import yaml from "js-yaml";
import type { Root } from "mdast";

export function extractFrontmatter(root: Root): Record<string, unknown> {
  const first = root.children[0] as unknown as { type?: string; value?: string } | undefined;
  if (!first || first.type !== "yaml" || typeof first.value !== "string") {
    return {};
  }
  try {
    const loaded = yaml.load(first.value);
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      return loaded as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

export function pickString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
