export type MessagePeriod = "daily" | "weekly" | "monthly" | "allTime";

const PERIOD_ALIASES: Record<string, MessagePeriod> = {
  day: "daily",
  daily: "daily",
  today: "daily",
  week: "weekly",
  weekly: "weekly",
  month: "monthly",
  monthly: "monthly",
  all: "allTime",
  alltime: "allTime",
  all_time: "allTime",
};

export const MESSAGE_PERIOD_ARG_HINT = "`today`, `week`, `month`, or `all`";

// Returns null for an unrecognized period string — callers decide what "no input at all" should mean (the
// leaderboard defaults it to allTime; the set command requires it to be explicit).
export function parseMessagePeriod(input: string): MessagePeriod | null {
  return PERIOD_ALIASES[input.toLowerCase()] ?? null;
}
