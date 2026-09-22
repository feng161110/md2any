export function lineOf(node: unknown): number | undefined {
  const position = (node as { position?: { start?: { line?: number } } }).position;
  const line = position?.start?.line;
  return typeof line === "number" ? line - 1 : undefined;
}
