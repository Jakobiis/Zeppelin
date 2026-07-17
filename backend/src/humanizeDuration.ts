import humanizeduration from "humanize-duration";

export const delayStringMultipliers = {
  y: 1000 * 60 * 60 * 24 * (365 + 1 / 4 - 1 / 100 + 1 / 400),
  mo: (1000 * 60 * 60 * 24 * (365 + 1 / 4 - 1 / 100 + 1 / 400)) / 12,
  w: 1000 * 60 * 60 * 24 * 7,
  d: 1000 * 60 * 60 * 24,
  h: 1000 * 60 * 60,
  m: 1000 * 60,
  s: 1000,
  x: 1,
};

export const humanizeDurationShort = humanizeduration.humanizer({
  language: "shortEn",
  languages: {
    shortEn: {
      y: () => "y",
      mo: () => "mo",
      w: () => "w",
      d: () => "d",
      h: () => "h",
      m: () => "m",
      s: () => "s",
      ms: () => "ms",
    },
  },
  spacer: "",
  unitMeasures: delayStringMultipliers,
});

export const humanizeDuration = humanizeduration.humanizer({
  unitMeasures: delayStringMultipliers,
});

export type DiscordTimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";
export function discordTimestamp(
  when: Date | number,
  style: DiscordTimestampStyle = "f"
): string {
  let seconds: number;

  if (when instanceof Date) {
    seconds = Math.floor(when.getTime() / 1000);
  } else {
    seconds = Math.floor(when >= 1e12 ? when / 1000 : when);
  }

  return `<t:${seconds}:${style}>`;
}