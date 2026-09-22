import { TOPIC_SHAPE, type TopicStyle } from "./presets.js";

export const CANVAS_BACKGROUND = "#ffffff";
export const LINK_COLOR = "#9aa8bb";
export const DEFAULT_CENTRAL_COLOR = "#1f4e79";

export const DEFAULT_BRANCH_COLORS = [
  "#2e75b6",
  "#c0504d",
  "#4f81bd",
  "#9bbb59",
  "#8064a2",
  "#4bacc6",
  "#f79646",
];

export function resolveBranchColors(count: number, custom?: string[]): string[] {
  const source = custom && custom.length > 0 ? custom : DEFAULT_BRANCH_COLORS;
  const total = Math.max(1, count);
  return Array.from({ length: total }, (_, index) => source[index % source.length]);
}

export function centralStyle(base: string): TopicStyle {
  const fill = normalize(base, DEFAULT_CENTRAL_COLOR);
  return {
    fill,
    color: readableOn(fill),
    border: darken(fill, 0.22),
    shape: TOPIC_SHAPE.roundedRect,
    fontSize: 22,
    lineWidth: 2,
    bold: true,
  };
}

export function branchStyle(base: string, depth: number): TopicStyle {
  const fill = normalize(base, DEFAULT_BRANCH_COLORS[0]);
  if (depth <= 1) {
    return {
      fill,
      color: readableOn(fill),
      border: darken(fill, 0.18),
      shape: TOPIC_SHAPE.roundedRect,
      fontSize: 16,
      lineWidth: 2,
      bold: true,
    };
  }
  if (depth === 2) {
    return {
      fill: lighten(fill, 0.55),
      color: darken(fill, 0.52),
      border: lighten(fill, 0.18),
      shape: TOPIC_SHAPE.roundedRect,
      fontSize: 14,
      lineWidth: 1,
      bold: false,
    };
  }
  return {
    fill: lighten(fill, 0.84),
    color: darken(fill, 0.46),
    border: lighten(fill, 0.45),
    shape: TOPIC_SHAPE.roundedRect,
    fontSize: 13,
    lineWidth: 1,
    bold: false,
  };
}

export function topicStyle(
  centralColor: string,
  branchColors: string[],
  depth: number,
  branchIndex: number,
): TopicStyle {
  if (depth === 0) return centralStyle(centralColor);
  if (branchIndex >= 0 && branchColors.length > 0) {
    return branchStyle(branchColors[branchIndex % branchColors.length], depth);
  }
  return centralStyle(centralColor);
}

export function lighten(hex: string, ratio: number): string {
  return mix(hex, "#ffffff", ratio);
}

export function darken(hex: string, ratio: number): string {
  return mix(hex, "#000000", ratio);
}

export function mix(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.min(1, Math.max(0, ratio));
  const blended: [number, number, number] = [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  return rgbToHex(blended);
}

export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1f2937" : "#ffffff";
}

export function normalize(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  const value = hex.trim();
  if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return fallback;
  return value.startsWith("#") ? value : "#" + value;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.min(1, Math.max(0, s));
  const lightness = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgbToHex([
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ]);
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

function hexToRgb(hex: string): [number, number, number] {
  let value = (hex || "").trim().replace("#", "");
  if (value.length === 3) {
    value = value.split("").map((char) => char + char).join("");
  }
  const int = Number.parseInt(value, 16);
  if (Number.isNaN(int)) return [0, 0, 0];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((part) => part.toString(16).padStart(2, "0")).join("");
}
