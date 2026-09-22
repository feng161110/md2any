import { resolveOptions } from "./config.js";
import { parseMarkdown } from "./parser/parseMarkdown.js";
import { mdastToIR } from "./transform/mdastToIR.js";
import { buildXMindFiles, irToXMindContent } from "./export/xmindZen.js";
import { irToMarkdown } from "./export/markdown.js";
import { zipFiles } from "./export/zip.js";
import { irToJson } from "./export/json.js";
import { parseXMind } from "./import/xmind.js";
import { DEFAULT_BRANCH_COLORS, DEFAULT_CENTRAL_COLOR } from "./theme/colors.js";
import type { ConvertOptions, ExportFormat, MindMapIR } from "./types.js";

export * from "./types.js";
export { resolveOptions } from "./config.js";
export { parseMarkdown } from "./parser/parseMarkdown.js";
export { mdastToIR } from "./transform/mdastToIR.js";
export { buildXMindFiles, irToXMindContent } from "./export/xmindZen.js";
export { irToMarkdown } from "./export/markdown.js";
export { zipFiles } from "./export/zip.js";
export { irToJson } from "./export/json.js";
export { parseXMind } from "./import/xmind.js";
export { DEFAULT_BRANCH_COLORS, DEFAULT_CENTRAL_COLOR } from "./theme/colors.js";

export function convertToIR(markdown: string, options: ConvertOptions = {}, fallbackTitle = "Markdown"): MindMapIR {
  const resolved = resolveOptions(options);
  const tree = parseMarkdown(markdown);
  return mdastToIR(tree, resolved, fallbackTitle);
}

export async function exportIR(ir: MindMapIR, format: ExportFormat = "xmind", options: ConvertOptions = {}): Promise<Uint8Array | string> {
  if (format === "json") return irToJson(ir);
  if (format === "markdown") return irToMarkdown(ir);
  if (format === "xmind") {
    const resolved = resolveOptions(options);
  return zipFiles(buildXMindFiles(ir, { centralColor: resolved.centralColor, branchColors: resolved.branchColors }));
  }
  if (format === "png" || format === "pdf") {
    throw new Error("PNG/PDF are Node-only: import irToPng / irToPdf from the export modules");
  }
  throw new Error("Unsupported export format: " + format);
}

export async function convert(markdown: string, options: ConvertOptions = {}, fallbackTitle = "Markdown"): Promise<Uint8Array> {
  const resolved = resolveOptions(options);
  const ir = convertToIR(markdown, resolved, fallbackTitle);
  return zipFiles(buildXMindFiles(ir, { centralColor: resolved.centralColor, branchColors: resolved.branchColors }));
}
