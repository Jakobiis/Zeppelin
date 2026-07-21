import { Repository } from "typeorm";
import { BaseGuildRepository } from "./BaseGuildRepository.js";
import { dataSource } from "./dataSource.js";
import { ScheduleState } from "./entities/ScheduleState.js";

export class GuildScheduleStates extends BaseGuildRepository {
  private scheduleStates: Repository<ScheduleState>;

  constructor(guildId) {
    super(guildId);
    this.scheduleStates = dataSource.getRepository(ScheduleState);
  }

  all(): Promise<ScheduleState[]> {
    return this.scheduleStates.find({ where: { guild_id: this.guildId } });
  }

  async upsert(
    scheduleName: string,
    data: Omit<Partial<ScheduleState>, "id" | "guild_id" | "schedule_name">,
  ): Promise<void> {
    await this.scheduleStates.upsert(
      { ...data, guild_id: this.guildId, schedule_name: scheduleName },
      ["guild_id", "schedule_name"],
    );
  }

  async delete(scheduleName: string): Promise<void> {
    await this.scheduleStates.delete({ guild_id: this.guildId, schedule_name: scheduleName });
  }
}
