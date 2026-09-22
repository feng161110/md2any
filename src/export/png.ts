import fs from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import type { MindMapIR } from "../types.js";
import { drawMindMap, measureMindMapSize, type DrawContext } from "../render/draw.js";

export interface PngResult {
  buffer: Uint8Array;
  width: number;
  height: number;
}

export interface PngOptions {
  centralColor?: string;
  branchColors?: string[];
  scale?: number;
}

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/msyhbd.ttc",
  "C:/Windows/Fonts/simhei.ttf",
  "C:/Windows/Fonts/arialuni.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/System/Library/Fonts/PingFang.ttc",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

const FONT_FAMILY = "md2xmind-cjk";
let fontReady = false;

export function ensureFont(): string {
  if (fontReady) return FONT_FAMILY;
  fontReady = true;
  for (const candidate of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) {
        GlobalFonts.registerFromPath(candidate, FONT_FAMILY);
        return FONT_FAMILY;
      }
    } catch {
      continue;
    }
  }
  return "sans-serif";
}

export async function irToPng(ir: MindMapIR, options: PngOptions = {}): Promise<PngResult> {
  const scale = options.scale ?? 2;
  const fontFamily = ensureFont();
  const drawOptions = {
    centralColor: options.centralColor,
    branchColors: options.branchColors,
    fontFamily,
  };

  const probe = createCanvas(1, 1);
  const probeCtx = probe.getContext("2d") as unknown as DrawContext;
  const size = measureMindMapSize(probeCtx, ir, drawOptions);

  const canvas = createCanvas(
    Math.max(1, Math.round(size.width * scale)),
    Math.max(1, Math.round(size.height * scale)),
  );
  const ctx = canvas.getContext("2d") as unknown as DrawContext;
  ctx.scale(scale, scale);
  drawMindMap(ctx, ir, drawOptions);

  return {
    buffer: new Uint8Array(canvas.toBuffer("image/png")),
    width: size.width,
    height: size.height,
  };
}
