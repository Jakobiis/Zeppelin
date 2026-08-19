import moment from "moment-timezone";
import { Giveaway, GiveawayCounterRequirement, GiveawayCountRange, GiveawayMessageRequirement } from "../../../data/entities/Giveaway.js";
import { GuildGiveaways } from "../../../data/GuildGiveaways.js";
import { registerUpcomingGiveaway } from "../../../data/loops/upcomingGiveawaysLoop.js";
import { DBDateFormat } from "../../../utils.js";
import { buildGiveawayButtons, buildGiveawayEmbed } from "./buildGiveawayMessage.js";
import { sendChannelMessage } from "./discordRest.js";

export interface CreateGiveawayFields {
  channel_id: string;
  host_id: string;
  // Set when a staff member is physically holding the prize — they get added to each winner's thread alongside
  // the host. Null means the giveaway isn't staff-held.
  holder_id: string | null;
  prize: string;
  winner_count: number;
  duration_ms: number;
  embed_color: number | null;
  required_role_ids: string[];
  bypass_role_ids: string[];
  blacklisted_role_ids: string[];
  extra_entries: Record<string, number>;
  message_requirement: GiveawayMessageRequirement | null;
  counter_requirement: GiveawayCounterRequirement | null;
  coins_requirement: GiveawayCountRange | null;
  // Null means no claim requirement — winners aren't rerolled for failing to click Claim Prize.
  claim_time_ms: number | null;
}

/**
 * Inserts the giveaway row, posts its embed + Enter button, stamps the resulting message_id back onto the row,
 * and arms the restart-proof end timer — the whole "start a giveaway" sequence shared by both
 * `-giveaway start` (GiveawayStartCmd.ts, which resolves role mentions/template via live Discord data first)
 * and the dashboard's create form (api/guilds/giveaways.ts, which already has raw role IDs from its pickers).
 * Only the *resolution* of fields differs between those two callers — this part is identical either way, and
 * works from both processes since it only touches the DB and plain REST (see discordRest.ts).
 */
export async function createGiveawayRecord(guildId: string, fields: CreateGiveawayFields): Promise<Giveaway> {
  const repo = GuildGiveaways.getGuildInstance(guildId);
  const endsAt = moment.utc().add(fields.duration_ms, "ms").format(DBDateFormat);

  const giveaway = await repo.create({
    channel_id: fields.channel_id,
    message_id: null,
    host_id: fields.host_id,
    holder_id: fields.holder_id,
    prize: fields.prize,
    winner_count: fields.winner_count,
    ends_at: endsAt,
    ended_at: null,
    status: "running",
    embed_color: fields.embed_color,
    required_role_ids: fields.required_role_ids,
    bypass_role_ids: fields.bypass_role_ids,
    blacklisted_role_ids: fields.blacklisted_role_ids,
    extra_entries: fields.extra_entries,
    message_requirement: fields.message_requirement,
    counter_requirement: fields.counter_requirement,
    coins_requirement: fields.coins_requirement,
    winner_ids: [],
    claim_time_ms: fields.claim_time_ms,
    claimed_winner_ids: [],
    expired_winner_ids: [],
    winner_claim_deadlines: {},
    winner_thread_ids: {},
    winner_thread_closed_ids: [],
    winner_announcement_message_ids: [],
    created_at: moment.utc().format(DBDateFormat),
  });

  const sentMessage = await sendChannelMessage(giveaway.channel_id, {
    embeds: [buildGiveawayEmbed(giveaway).toJSON()],
    components: [buildGiveawayButtons(giveaway.id, 0).toJSON()],
  });

  await repo.update(giveaway.id, { message_id: sentMessage.id });
  const updated = (await repo.find(giveaway.id))!;

  registerUpcomingGiveaway(updated);

  return updated;
}
