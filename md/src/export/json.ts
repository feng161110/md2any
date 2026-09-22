import type { MindMapIR } from "../types.js";

export function irToJson(ir: MindMapIR): string {
  return JSON.stringify(ir, null, 2);
}
