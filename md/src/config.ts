import type { ConvertOptions } from "./types.js";

export interface ResolvedOptions extends ConvertOptions {
  layout: NonNullable<ConvertOptions["layout"]>;
  maxDepth: number;
  sheetTitle: string;
}

export const DEFAULT_OPTIONS: ResolvedOptions = {
  // 与自绘布局（render/layout 的左右分边）保持一致，也决定 .xmind 的 structure-class
  layout: "map",
  maxDepth: 6,
  sheetTitle: "Sheet 1",
};

export function resolveOptions(options: ConvertOptions = {}): ResolvedOptions {
  return { ...DEFAULT_OPTIONS, ...stripUndefined(options) };
}

function stripUndefined(input: ConvertOptions): Partial<ConvertOptions> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<ConvertOptions>;
}
