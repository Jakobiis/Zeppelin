export type MessagePeriod = "daily" | "weekly" | "monthly" | "allTime";

const PERIOD_ALIASES: Record<string, MessagePeriod> = {
  d: "daily",
  day: "daily",
  daily: "daily",
  today: "daily",
  t: "daily",
  w: "weekly",
  week: "weekly",
  weekly: "weekly",
  m: "monthly",
  mo: "monthly",
  month: "monthly",
  monthly: "monthly",
  a: "allTime",
  all: "allTime",
  alltime: "allTime",
  all_time: "allTime",
};

export const MESSAGE_PERIOD_ARG_HINT = "`today`/`t`, `week`/`w`, `month`/`m`, or `all`/`a`";

// Returns null for an unrecognized period string — callers decide what "no input at all" should mean (the
// leaderboard defaults it to allTime; the set command requires it to be explicit).
export function parseMessagePeriod(input: string): MessagePeriod | null {
  return PERIOD_ALIASES[input.toLowerCase()] ?? null;
}
