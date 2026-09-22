import { XMLParser } from "fast-xml-parser";
import { unzipFiles } from "../export/zip.js";
import type { MindMapIR, Sheet, TopicNode } from "../types.js";

export async function parseXMind(buffer: Uint8Array): Promise<MindMapIR> {
  // 只解这两个文本条目：.xmind 里的缩略图 / resources 不必参与解析
  const files = await unzipFiles(buffer, ["content.json", "content.xml"]).catch((error) => {
    throw new Error(
      "Invalid .xmind archive: " + (error instanceof Error ? error.message : String(error)),
    );
  });
  if (files["content.json"]) return parseZen(files["content.json"]);
  if (files["content.xml"]) return parseLegacy(files["content.xml"]);
  throw new Error("Invalid .xmind archive: content.json and content.xml are both missing");
}

function parseZen(content: string): MindMapIR {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      "Invalid content.json: " + (error instanceof Error ? error.message : String(error)),
    );
  }
  const rawSheets = Array.isArray(parsed) ? parsed : [parsed];
  const sheets: Sheet[] = rawSheets.map((raw, index) => {
    const sheet = raw as Record<string, unknown>;
    return {
      id: typeof sheet.id === "string" ? sheet.id : "sheet-" + (index + 1),
      title: typeof sheet.title === "string" ? sheet.title : "Sheet " + (index + 1),
      root: zenTopicToIr((sheet.rootTopic ?? {}) as Record<string, unknown>),
    };
  });
  return { sheets, meta: { generator: "md2xmind" } };
}

function zenTopicToIr(raw: Record<string, unknown>): TopicNode {
  const node: TopicNode = { title: topicTitle(raw.title) };
  const notes = raw.notes as { plain?: { content?: string } } | undefined;
  if (notes?.plain?.content) node.note = notes.plain.content;
  if (typeof raw.href === "string") node.href = raw.href;
  const image = raw.image as { src?: string; width?: number; height?: number } | undefined;
  if (image?.src) {
    node.image = { src: image.src, width: image.width, height: image.height };
  }
  const markers = raw.markers as Array<{ markerId?: string }> | undefined;
  if (Array.isArray(markers)) {
    const ids = markers
      .map((marker) => marker.markerId)
      .filter((id): id is string => typeof id === "string");
    if (ids.length > 0) node.markers = ids;
  }
  const children = raw.children as { attached?: unknown[] } | undefined;
  const attached = Array.isArray(children?.attached) ? children.attached : [];
  if (attached.length > 0) {
    node.children = attached.map((child) => zenTopicToIr(child as Record<string, unknown>));
  }
  return node;
}

function topicTitle(title: unknown): string {
  if (typeof title === "string") return title;
  if (title && typeof title === "object") {
    const content = (title as { content?: string }).content;
    if (typeof content === "string") return content;
  }
  return "";
}

function parseLegacy(content: string): MindMapIR {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(content) as Record<string, unknown>;
  const root = parsed["xmap-content"] as Record<string, unknown> | undefined;
  if (!root) throw new Error("Invalid XMind 8 file: xmap-content not found");
  const sheets: Sheet[] = toArray(root.sheet).map((raw, index) => {
    const sheet = raw as Record<string, unknown>;
    const topic = sheet.topic as Record<string, unknown> | undefined;
    return {
      id: typeof sheet["@_id"] === "string" ? sheet["@_id"] : "sheet-" + (index + 1),
      title: typeof sheet.title === "string" ? sheet.title : "Sheet " + (index + 1),
      root: topic ? legacyTopicToIr(topic) : { title: "" },
    };
  });
  return { sheets, meta: { generator: "md2xmind" } };
}

function legacyTopicToIr(raw: Record<string, unknown>): TopicNode {
  const node: TopicNode = { title: typeof raw.title === "string" ? raw.title : "" };
  if (typeof raw["@_href"] === "string") node.href = raw["@_href"];
  const notes = raw.notes as Record<string, unknown> | undefined;
  if (notes && typeof notes.plain === "string") node.note = notes.plain;
  const markerRefs = raw["marker-refs"] as Record<string, unknown> | undefined;
  if (markerRefs) {
    const ids = toArray(markerRefs["marker-ref"])
      .map((ref) => (ref as Record<string, unknown>)["@_marker-id"])
      .filter((id): id is string => typeof id === "string");
    if (ids.length > 0) node.markers = ids;
  }
  const childrenEl = raw.children as Record<string, unknown> | undefined;
  if (childrenEl) {
    const topicsList = toArray(childrenEl.topics);
    const attached =
      topicsList.find((item) => (item as Record<string, unknown>)["@_type"] === "attached") ??
      topicsList[0];
    const items = attached
      ? toArray((attached as Record<string, unknown>).topic)
      : [];
    if (items.length > 0) {
      node.children = items.map((item) => legacyTopicToIr(item as Record<string, unknown>));
    }
  }
  return node;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}
