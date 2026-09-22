import type { PhrasingContent, RootContent } from "mdast";

type AnyNode = {
  type?: string;
  value?: string;
  url?: string;
  alt?: string;
  children?: unknown[];
};

export interface LinkInfo {
  url: string;
  text: string;
}

export interface ImageInfo {
  alt: string;
  url: string;
}

export function toText(node: RootContent | PhrasingContent | { value?: string }): string {
  return collectText(node).replace(/\r\n/g, "\n");
}

export function extractLink(node: RootContent | PhrasingContent): LinkInfo | undefined {
  const found = findFirst(node, "link");
  if (!found) return undefined;
  const url = typeof found.url === "string" ? found.url : "";
  if (!url) return undefined;
  return { url, text: toText(found as PhrasingContent).trim() };
}

export function collectImages(node: RootContent | PhrasingContent): ImageInfo[] {
  const images: ImageInfo[] = [];
  walk(node, (current) => {
    if (current.type === "image") {
      images.push({ alt: typeof current.alt === "string" ? current.alt : "", url: current.url ?? "" });
    }
  });
  return images;
}

function collectText(node: unknown): string {
  const target = node as AnyNode;
  if (typeof target.value === "string") return target.value;
  if (Array.isArray(target.children)) {
    return target.children.map((child) => collectText(child)).join("");
  }
  return "";
}

function walk(node: unknown, visit: (node: AnyNode) => void): void {
  if (!node || typeof node !== "object") return;
  const target = node as AnyNode;
  visit(target);
  if (Array.isArray(target.children)) {
    for (const child of target.children) walk(child, visit);
  }
}

function findFirst(node: unknown, type: string): AnyNode | undefined {
  let result: AnyNode | undefined;
  walk(node, (current) => {
    if (!result && current.type === type) result = current;
  });
  return result;
}
