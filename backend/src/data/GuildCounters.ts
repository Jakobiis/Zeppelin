import moment from "moment-timezone";
import { FindOptionsWhere, In, IsNull, Not, Repository } from "typeorm";
import { Queue } from "../Queue.js";
import { DAYS, DBDateFormat, HOURS, MINUTES } from "../utils.js";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { Counter } from "./entities/Counter.js";
import { CounterDecayAmountOverrideState } from "./entities/CounterDecayAmountOverrideState.js";
import { CounterDecayRoleState } from "./entities/CounterDecayRoleState.js";
import { CounterTrigger, TriggerComparisonOp, isValidCounterComparisonOp } from "./entities/CounterTrigger.js";
import { CounterTriggerState } from "./entities/CounterTriggerState.js";
import { CounterValue } from "./entities/CounterValue.js";

const DELETE_UNUSED_COUNTERS_AFTER = 1 * DAYS;
const DELETE_UNUSED_COUNTER_TRIGGERS_AFTER = 1 * DAYS;

export const MIN_COUNTER_VALUE = 0;
export const MAX_COUNTER_VALUE = 2147483647; // 2^31-1, for MySQL INT

const decayQueue = new Queue();

async function deleteCountersMarkedToBeDeleted(): Promise<void> {
  await dataSource.getRepository(Counter).createQueryBuilder().where("delete_at <= NOW()").delete().execute();
}

async function deleteTriggersMarkedToBeDeleted(): Promise<void> {
  await dataSource.getRepository(CounterTrigger).createQueryBuilder().where("delete_at <= NOW()").delete().execute();
}

setInterval(deleteCountersMarkedToBeDeleted, 1 * HOURS);
setInterval(deleteTriggersMarkedToBeDeleted, 1 * HOURS);

setTimeout(deleteCountersMarkedToBeDeleted, 1 * MINUTES);
setTimeout(deleteTriggersMarkedToBeDeleted, 1 * MINUTES);

export class GuildCounters extends BaseGuildRepository {
  private counters: Repository<Counter>;
  private counterValues: Repository<CounterValue>;
  private counterTriggers: Repository<CounterTrigger>;
  private counterTriggerStates: Repository<CounterTriggerState>;
  private counterDecayRoleStates: Repository<CounterDecayRoleState>;
  private counterDecayAmountOverrideStates: Repository<CounterDecayAmountOverrideState>;

  constructor(guildId) {
    super(guildId);
    this.counters = dataSource.getRepository(Counter);
    this.counterValues = dataSource.getRepository(CounterValue);
    this.counterTriggers = dataSource.getRepository(CounterTrigger);
    this.counterTriggerStates = dataSource.getRepository(CounterTriggerState);
    this.counterDecayRoleStates = dataSource.getRepository(CounterDecayRoleState);
    this.counterDecayAmountOverrideStates = dataSource.getRepository(CounterDecayAmountOverrideState);
  }

  async findOrCreateCounter(name: string, perChannel: boolean, perUser: boolean): Promise<Counter> {
    const existing = await this.counters.findOne({
      where: {
        guild_id: this.guildId,
        name,
      },
    });

    if (existing) {
      // If the existing counter's properties match the ones we're looking for, return it.
      // Otherwise, delete the existing counter and re-create it with the proper properties.
      if (existing.per_channel === perChannel && existing.per_user === perUser) {
        await this.counters.update({ id: existing.id }, { delete_at: null });

        return existing;
      }

      await this.counters.delete({ id: existing.id });
    }

    const insertResult = await this.counters.insert({
      guild_id: this.guildId,
      name,
      per_channel: perChannel,
      per_user: perUser,
      last_decay_at: moment.utc().format(DBDateFormat),
    });

    return (await this.counters.findOne({
      where: {
        id: insertResult.identifiers[0].id,
      },
    }))!;
  }

  async markUnusedCountersToBeDeleted(idsToKeep: number[]): Promise<void> {
    const criteria: FindOptionsWhere<Counter> = {
      guild_id: this.guildId,
      delete_at: IsNull(),
    };

    if (idsToKeep.length) {
      criteria.id = Not(In(idsToKeep));
    }

    const deleteAt = moment.utc().add(DELETE_UNUSED_COUNTERS_AFTER, "ms").format(DBDateFormat);

    await this.counters.update(criteria, {
      delete_at: deleteAt,
    });
  }

  async deleteCountersMarkedToBeDeleted(): Promise<void> {
    await this.counters.createQueryBuilder().where("delete_at <= NOW()").delete().execute();
  }

  async changeCounterValue(
    id: number,
    channelId: string | null,
    userId: string | null,
    change: number,
    initialValue: number,
    maxValue: number = MAX_COUNTER_VALUE,
  ): Promise<void> {
    if (typeof change !== "number" || Number.isNaN(change) || !Number.isFinite(change)) {
      throw new Error(`changeCounterValue() change argument must be a number`);
    }

    channelId = channelId || "0";
    userId = userId || "0";

    const rawUpdate =
      change >= 0
        ? `value = LEAST(value + ${change}, ${maxValue})`
        : `value = GREATEST(value ${change}, ${MIN_COUNTER_VALUE})`;

    await this.counterValues.query(
      `
      INSERT INTO counter_values (counter_id, channel_id, user_id, value)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE ${rawUpdate}
    `,
      [id, channelId, userId, Math.min(Math.max(initialValue + change, MIN_COUNTER_VALUE), maxValue)],
    );
  }

  async setCounterValue(
    id: number,
    channelId: string | null,
    userId: string | null,
    value: number,
    maxValue: number = MAX_COUNTER_VALUE,
  ): Promise<void> {
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
      throw new Error(`setCounterValue() value argument must be a number`);
    }

    channelId = channelId || "0";
    userId = userId || "0";

    value = Math.min(Math.max(value, MIN_COUNTER_VALUE), maxValue);

    await this.counterValues.query(
      `
      INSERT INTO counter_values (counter_id, channel_id, user_id, value)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE value = ?
    `,
      [id, channelId, userId, value, value],
    );
  }

  /**
   * Applies decay to counter_values rows for the given counter, optionally restricted to (or excluding) a set of
   * user IDs and/or a [min, max) value range. `lastDecayAt`/`persistNewLastDecayAt` are abstracted out so this same
   * logic can drive the counter-wide decay rate (stored on the `counters` row), per-role decay rate overrides
   * (stored in `counter_decay_role_states`), and per-threshold amount_overrides brackets (stored in
   * `counter_decay_amount_override_states`) — each with their own independently-compensated last-decay timestamp.
   */
  private async applyDecay(
    id: number,
    decayPeriodMs: number,
    decayAmount: number,
    lastDecayAt: string,
    persistNewLastDecayAt: (newLastDecayAt: string) => Promise<any>,
    userIdFilter: { include: string[] } | { exclude: string[] } | null,
    maxValue: number = MAX_COUNTER_VALUE,
    valueRangeFilter: { min?: number; max?: number } | null = null,
  ): Promise<void> {
    const diffFromLastDecayMs = moment.utc().diff(moment.utc(lastDecayAt), "ms");
    if (diffFromLastDecayMs < decayPeriodMs) {
      return;
    }

    const periodRatio = diffFromLastDecayMs / decayPeriodMs;
    const decayAmountToApply = Math.round(periodRatio * decayAmount);
    if (decayAmountToApply === 0 || Number.isNaN(decayAmountToApply)) {
      return;
    }

    // Calculate new last_decay_at based on the rounded decay amount we applied, so that over time the decayed
    // amount stays accurate even if we round some here.
    const timeConsumedMs = (decayAmountToApply / decayAmount) * decayPeriodMs;
    const newLastDecayDate = moment.utc(lastDecayAt).add(timeConsumedMs, "ms").format(DBDateFormat);

    const rawUpdate =
      decayAmountToApply >= 0
        ? `GREATEST(value - ${decayAmountToApply}, ${MIN_COUNTER_VALUE})`
        : `LEAST(value + ${Math.abs(decayAmountToApply)}, ${maxValue})`;

    // Using an UPDATE with ORDER BY in an attempt to avoid deadlocks from simultaneous decays
    // Also see https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks-handling.html
    let query = this.counterValues.createQueryBuilder("CounterValue").where("counter_id = :id", { id });

    if (userIdFilter && "include" in userIdFilter) {
      query = query.andWhere("user_id IN (:...userIds)", { userIds: userIdFilter.include });
    } else if (userIdFilter && "exclude" in userIdFilter) {
      query = query.andWhere("user_id NOT IN (:...userIds)", { userIds: userIdFilter.exclude });
    }

    if (valueRangeFilter?.min !== undefined) {
      query = query.andWhere("value >= :minValue", { minValue: valueRangeFilter.min });
    }
    if (valueRangeFilter?.max !== undefined) {
      query = query.andWhere("value < :maxValue", { maxValue: valueRangeFilter.max });
    }

    await query
      .orderBy("id")
      .update({
        value: () => rawUpdate,
      })
      .execute();

    await persistNewLastDecayAt(newLastDecayDate);
  }

  decay(
    id: number,
    decayPeriodMs: number,
    decayAmount: number,
    excludeUserIds: string[] = [],
    maxValue: number = MAX_COUNTER_VALUE,
    // If set, only rows below this value are decayed at the base rate — rows at/above it belong to an
    // amount_overrides bracket instead and are decayed independently via decayForAmountOverride()
    belowValue?: number,
  ) {
    return decayQueue.add(async () => {
      const counter = (await this.counters.findOne({
        where: {
          id,
        },
      }))!;

      await this.applyDecay(
        id,
        decayPeriodMs,
        decayAmount,
        counter.last_decay_at!,
        (newLastDecayAt) => this.counters.update({ id }, { last_decay_at: newLastDecayAt }),
        excludeUserIds.length ? { exclude: excludeUserIds } : null,
        maxValue,
        belowValue !== undefined ? { max: belowValue } : null,
      );
    });
  }

  /**
   * Like `decay()`, but applies a decay rate override that only affects the given user IDs (e.g. members with a
   * specific role), tracked with its own independent last-decay timestamp so it doesn't interfere with the base
   * decay rate's timing.
   */
  async decayForRole(
    id: number,
    roleId: string,
    decayPeriodMs: number,
    decayAmount: number,
    userIds: string[],
    maxValue: number = MAX_COUNTER_VALUE,
  ) {
    if (userIds.length === 0) {
      return;
    }

    return decayQueue.add(async () => {
      let state = await this.counterDecayRoleStates.findOne({
        where: { counter_id: id, role_id: roleId },
      });

      if (!state) {
        const insertResult = await this.counterDecayRoleStates.insert({
          counter_id: id,
          role_id: roleId,
          last_decay_at: moment.utc().format(DBDateFormat),
        });
        state = (await this.counterDecayRoleStates.findOne({
          where: { id: insertResult.identifiers[0].id },
        }))!;
      }

      await this.applyDecay(
        id,
        decayPeriodMs,
        decayAmount,
        state.last_decay_at!,
        (newLastDecayAt) =>
          this.counterDecayRoleStates.update({ counter_id: id, role_id: roleId }, { last_decay_at: newLastDecayAt }),
        { include: userIds },
        maxValue,
      );
    });
  }

  /**
   * Like `decayForRole()`, but for a single decay.amount_overrides bracket — each bracket gets its own independent
   * last-decay timestamp (stored in `counter_decay_amount_override_states`, keyed by counter + threshold), so its
   * `every` period is measured from when *that bracket* last decayed rather than from the base rate's timing.
   *
   * Brackets are mutually exclusive by value range rather than by config list order: this bracket only claims rows
   * in [threshold, nextHigherThreshold) among `allThresholds`, so a row is always decayed by exactly one bracket —
   * whichever is the highest threshold its current value meets — regardless of the order overrides are configured
   * in.
   */
  async decayForAmountOverride(
    id: number,
    threshold: number,
    decayPeriodMs: number,
    decayAmount: number,
    allThresholds: number[],
    excludeUserIds: string[] = [],
    maxValue: number = MAX_COUNTER_VALUE,
  ) {
    return decayQueue.add(async () => {
      let state = await this.counterDecayAmountOverrideStates.findOne({
        where: { counter_id: id, threshold },
      });

      if (!state) {
        const insertResult = await this.counterDecayAmountOverrideStates.insert({
          counter_id: id,
          threshold,
          last_decay_at: moment.utc().format(DBDateFormat),
        });
        state = (await this.counterDecayAmountOverrideStates.findOne({
          where: { id: insertResult.identifiers[0].id },
        }))!;
      }

      const nextThreshold = allThresholds.filter((t) => t > threshold).sort((a, b) => a - b)[0];

      await this.applyDecay(
        id,
        decayPeriodMs,
        decayAmount,
        state.last_decay_at!,
        (newLastDecayAt) =>
          this.counterDecayAmountOverrideStates.update(
            { counter_id: id, threshold },
            { last_decay_at: newLastDecayAt },
          ),
        excludeUserIds.length ? { exclude: excludeUserIds } : null,
        maxValue,
        { min: threshold, max: nextThreshold },
      );
    });
  }

  async markUnusedTriggersToBeDeleted(triggerIdsToKeep: number[]) {
    let triggersToMarkQuery = this.counterTriggers
      .createQueryBuilder("counterTriggers")
      .innerJoin(Counter, "counters", "counters.id = counterTriggers.counter_id")
      .where("counters.guild_id = :guildId", { guildId: this.guildId });

    // If there are no active triggers, we just mark all triggers from the guild to be deleted.
    // Otherwise, we mark all but the active triggers in the guild.
    if (triggerIdsToKeep.length) {
      triggersToMarkQuery = triggersToMarkQuery.andWhere("counterTriggers.id NOT IN (:...triggerIds)", {
        triggerIds: triggerIdsToKeep,
      });
    }

    const triggersToMark = await triggersToMarkQuery.getMany();

    if (triggersToMark.length) {
      const deleteAt = moment.utc().add(DELETE_UNUSED_COUNTER_TRIGGERS_AFTER, "ms").format(DBDateFormat);

      await this.counterTriggers.update(
        {
          id: In(triggersToMark.map((t) => t.id)),
        },
        {
          delete_at: deleteAt,
        },
      );
    }
  }

  async deleteTriggersMarkedToBeDeleted(): Promise<void> {
    await this.counterTriggers.createQueryBuilder().where("delete_at <= NOW()").delete().execute();
  }

  async initCounterTrigger(
    counterId: number,
    triggerName: string,
    comparisonOp: TriggerComparisonOp,
    comparisonValue: number,
    reverseComparisonOp: TriggerComparisonOp,
    reverseComparisonValue: number,
  ): Promise<CounterTrigger> {
    if (!isValidCounterComparisonOp(comparisonOp)) {
      throw new Error(`Invalid comparison op: ${comparisonOp}`);
    }

    if (!isValidCounterComparisonOp(reverseComparisonOp)) {
      throw new Error(`Invalid comparison op: ${reverseComparisonOp}`);
    }

    if (typeof comparisonValue !== "number") {
      throw new Error(`Invalid comparison value: ${comparisonValue}`);
    }

    if (typeof reverseComparisonValue !== "number") {
      throw new Error(`Invalid comparison value: ${reverseComparisonValue}`);
    }

    return dataSource.transaction(async (entityManager) => {
      const existing = await entityManager.findOne(CounterTrigger, {
        where: {
          counter_id: counterId,
          name: triggerName,
        },
      });

      if (existing) {
        // Since all existing triggers are marked as to-be-deleted before they are re-initialized, this needs to be reset
        await entityManager.update(CounterTrigger, existing.id, {
          comparison_op: comparisonOp,
          comparison_value: comparisonValue,
          reverse_comparison_op: reverseComparisonOp,
          reverse_comparison_value: reverseComparisonValue,
          delete_at: null,
        });
        return existing;
      }

      const insertResult = await entityManager.insert(CounterTrigger, {
        counter_id: counterId,
        name: triggerName,
        comparison_op: comparisonOp,
        comparison_value: comparisonValue,
        reverse_comparison_op: reverseComparisonOp,
        reverse_comparison_value: reverseComparisonValue,
      });

      return (await entityManager.findOne(CounterTrigger, {
        where: {
          id: insertResult.identifiers[0].id,
        },
      }))!;
    });
  }

  /**
   * Checks if a counter value with the given parameters triggers the specified comparison for the specified counter.
   * If it does, mark this comparison for these parameters as triggered.
   * Note that if this comparison for these parameters was already triggered previously, this function will return false.
   * This means that a specific comparison for the specific parameters specified will only trigger *once* until the reverse trigger is triggered.
   *
   * @param counterId
   * @param comparisonOp
   * @param comparisonValue
   * @param userId
   * @param channelId
   * @return Whether the given parameters newly triggered the given comparison
   */
  async checkForTrigger(
    counterTrigger: CounterTrigger,
    channelId: string | null,
    userId: string | null,
  ): Promise<boolean> {
    channelId = channelId || "0";
    userId = userId || "0";

    return dataSource.transaction(async (entityManager) => {
      const previouslyTriggered = await entityManager.findOne(CounterTriggerState, {
        where: {
          trigger_id: counterTrigger.id,
          user_id: userId!,
          channel_id: channelId!,
        },
      });

      if (previouslyTriggered) {
        return false;
      }

      const matchingValue = await entityManager
        .createQueryBuilder(CounterValue, "cv")
        .leftJoin(
          CounterTriggerState,
          "triggerStates",
          "triggerStates.trigger_id = :triggerId AND triggerStates.user_id = cv.user_id AND triggerStates.channel_id = cv.channel_id",
          { triggerId: counterTrigger.id },
        )
        .where(`cv.value ${counterTrigger.comparison_op} :value`, { value: counterTrigger.comparison_value })
        .andWhere(`cv.counter_id = :counterId`, { counterId: counterTrigger.counter_id })
        .andWhere("cv.channel_id = :channelId AND cv.user_id = :userId", { channelId, userId })
        .andWhere("triggerStates.id IS NULL")
        .getOne();

      if (matchingValue) {
        await entityManager.insert(CounterTriggerState, {
          trigger_id: counterTrigger.id,
          user_id: userId!,
          channel_id: channelId!,
        });

        return true;
      }

      return false;
    });
  }

  /**
   * Checks if any counter values of the specified counter match the specified comparison.
   * Like checkForTrigger(), this can only happen *once* per unique counter value parameters until the reverse trigger is triggered for those values.
   *
   * @return Counter value parameters that triggered the condition
   */
  async checkAllValuesForTrigger(
    counterTrigger: CounterTrigger,
  ): Promise<Array<{ channelId: string; userId: string }>> {
    return dataSource.transaction(async (entityManager) => {
      const matchingValues = await entityManager
        .createQueryBuilder(CounterValue, "cv")
        .leftJoin(
          CounterTriggerState,
          "triggerStates",
          "triggerStates.trigger_id = :triggerId AND triggerStates.user_id = cv.user_id AND triggerStates.channel_id = cv.channel_id",
          { triggerId: counterTrigger.id },
        )
        .where(`cv.value ${counterTrigger.comparison_op} :value`, { value: counterTrigger.comparison_value })
        .andWhere(`cv.counter_id = :counterId`, { counterId: counterTrigger.counter_id })
        .andWhere("triggerStates.id IS NULL")
        .getMany();

      if (matchingValues.length) {
        await entityManager.insert(
          CounterTriggerState,
          matchingValues.map((row) => ({
            trigger_id: counterTrigger.id,
            channel_id: row.channel_id,
            user_id: row.user_id,
          })),
        );
      }

      return matchingValues.map((row) => ({
        channelId: row.channel_id,
        userId: row.user_id,
      }));
    });
  }

  /**
   * Checks if a counter value with the given parameters *no longer* matches the specified comparison, and thus triggers a "reverse trigger".
   * Like checkForTrigger(), this can only happen *once* until the comparison is triggered normally again.
   *
   * @param counterId
   * @param comparisonOp
   * @param comparisonValue
   * @param userId
   * @param channelId
   * @return Whether the given parameters triggered a reverse trigger for the given comparison
   */
  async checkForReverseTrigger(
    counterTrigger: CounterTrigger,
    channelId: string | null,
    userId: string | null,
  ): Promise<boolean> {
    channelId = channelId || "0";
    userId = userId || "0";

    return dataSource.transaction(async (entityManager) => {
      const matchingValue = await entityManager
        .createQueryBuilder(CounterValue, "cv")
        .innerJoin(
          CounterTriggerState,
          "triggerStates",
          "triggerStates.trigger_id = :triggerId AND triggerStates.user_id = cv.user_id AND triggerStates.channel_id = cv.channel_id",
          { triggerId: counterTrigger.id },
        )
        .where(`cv.value ${counterTrigger.reverse_comparison_op} :value`, {
          value: counterTrigger.reverse_comparison_value,
        })
        .andWhere(`cv.counter_id = :counterId`, { counterId: counterTrigger.counter_id })
        .andWhere(`cv.channel_id = :channelId AND cv.user_id = :userId`, { channelId, userId })
        .getOne();

      if (matchingValue) {
        await entityManager.delete(CounterTriggerState, {
          trigger_id: counterTrigger.id,
          user_id: userId!,
          channel_id: channelId!,
        });

        return true;
      }

      return false;
    });
  }

  /**
   * Checks if any counter values of the specified counter *no longer* match the specified comparison, and thus triggers a "reverse trigger" for those values.
   * Like checkForTrigger(), this can only happen *once* per unique counter value parameters until the comparison is triggered normally again.
   *
   * @return Counter value parameters that triggered a reverse trigger
   */
  async checkAllValuesForReverseTrigger(
    counterTrigger: CounterTrigger,
  ): Promise<Array<{ channelId: string; userId: string }>> {
    return dataSource.transaction(async (entityManager) => {
      const matchingValues: Array<{
        id: string;
        triggerStateId: string;
        user_id: string;
        channel_id: string;
      }> = await entityManager
        .createQueryBuilder(CounterValue, "cv")
        .innerJoin(
          CounterTriggerState,
          "triggerStates",
          "triggerStates.trigger_id = :triggerId AND triggerStates.user_id = cv.user_id AND triggerStates.channel_id = cv.channel_id",
          { triggerId: counterTrigger.id },
        )
        .where(`cv.value ${counterTrigger.reverse_comparison_op} :value`, {
          value: counterTrigger.reverse_comparison_value,
        })
        .andWhere(`cv.counter_id = :counterId`, { counterId: counterTrigger.counter_id })
        .select([
          "cv.id AS id",
          "cv.user_id AS user_id",
          "cv.channel_id AS channel_id",
          "triggerStates.id AS triggerStateId",
        ])
        .getRawMany();

      if (matchingValues.length) {
        await entityManager.delete(CounterTriggerState, {
          id: In(matchingValues.map((v) => v.triggerStateId)),
        });
      }

      return matchingValues.map((row) => ({
        channelId: row.channel_id,
        userId: row.user_id,
      }));
    });
  }

  async getCurrentValue(
    counterId: number,
    channelId: string | null,
    userId: string | null,
  ): Promise<number | undefined> {
    const value = await this.counterValues.findOne({
      where: {
        counter_id: counterId,
        channel_id: channelId || "0",
        user_id: userId || "0",
      },
    });

    return value?.value;
  }

  async getTopValues(counterId: number, limit: number = 10, offset: number = 0): Promise<CounterValue[]> {
    return this.counterValues
      .createQueryBuilder("cv")
      .where("cv.counter_id = :counterId", { counterId })
      .andWhere("cv.user_id != :zero", { zero: "0" }) // exclude the "no user" aggregate row
      .orderBy("cv.value", "DESC")
      .addOrderBy("cv.id", "ASC")
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  async getValueCount(counterId: number): Promise<number> {
    return this.counterValues
      .createQueryBuilder("cv")
      .where("cv.counter_id = :counterId", { counterId })
      .andWhere("cv.user_id != :zero", { zero: "0" }) // exclude the "no user" aggregate row
      .getCount();
  }

  async resetAllCounterValues(counterId: number): Promise<void> {
    // Foreign keys will remove any related triggers and counter values
    await this.counters.delete({
      id: counterId,
    });
  }
}
