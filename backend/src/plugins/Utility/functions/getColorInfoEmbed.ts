import { APIEmbed } from "discord.js";
import { EmbedWith, trimLines } from "../../../utils.js";
import { parseColor } from "../../../utils/parseColor.js";
import { rgbToInt } from "../../../utils/rgbToInt.js";

function rgbToHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const lightness = (max + min) / 2;

  if (max === min) {
    return [0, 0, Math.round(lightness * 100)];
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue: number;
  switch (max) {
    case rNorm:
      hue = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
      break;
    case gNorm:
      hue = (bNorm - rNorm) / delta + 2;
      break;
    default:
      hue = (rNorm - gNorm) / delta + 4;
      break;
  }
  hue /= 6;

  return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)];
}

/**
 * Parses a color from user input (hex, rgb(), CSS color name, "r g b", etc. - see parseColor()) and builds an
 * embed showing it in the common formats people expect (mimicking Dyno's `.color` command), with the embed's own
 * side color set to match so the color is also visible at a glance.
 */
export function getColorInfoEmbed(input: string): APIEmbed | null {
  const rgb = parseColor(input);
  if (!rgb) {
    return null;
  }

  const [r, g, b] = rgb;
  const hex = rgbToHex(rgb);
  const [h, s, l] = rgbToHsl(rgb);
  const decimal = rgbToInt(rgb);
  const hexNoHash = hex.slice(1).toLowerCase();

  const embed: EmbedWith<"fields" | "color" | "image"> = {
    fields: [],
    color: decimal,
    image: {
      url: `https://singlecolorimage.com/get/${hexNoHash}/400x100`,
    },
  };

  embed.fields.push({
    name: hex,
    value: trimLines(`
      Hex: **${hex}**
      RGB: **${r}, ${g}, ${b}**
      HSL: **${h}°, ${s}%, ${l}%**
      Decimal: **${decimal}**
    `),
  });

  return embed;
}
