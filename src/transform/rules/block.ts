import type { Blockquote, Code, Html, Table, TableRow, RootContent } from "mdast";
import { collectImages, toText } from "./inline.js";
import { lineOf } from "./position.js";
import type { TopicNode, TopicTable } from "../../types.js";

export interface BlockResult {
  note?: string;
  children?: TopicNode[];
}

export function handleBlock(node: RootContent): BlockResult {
  const kind = node.type as string;

  if (kind === "code") {
    const code = node as Code;
    const text = (code.value ?? "").replace(/\s+$/, "");
    return text ? { note: fence(code.lang ?? "", text) } : {};
  }

  if (kind === "blockquote") {
    const block = node as Blockquote;
    const text = toText(block).trim();
    // 引用里也可能挂着图片：toText 读不到图片，会把它们整段丢掉，这里单独补回来
    const images = collectImages(block);
    if (!text && images.length === 0) return {};
    const quote = text.length > 0
      ? text.split("\n").map((line) => "> " + line.trim()).join("\n")
      : "";
    const media = images
      .map((image) => "![" + image.alt + "](" + image.url + ")")
      .join("\n");
    return { note: quote && media ? quote + "\n\n" + media : quote || media };
  }

  if (kind === "table") {
    const structure = tableToStructure(node as Table);
    if (!structure) return {};
    return {
      children: [
        { title: structure.header.join(" | "), table: structure, line: lineOf(node) },
      ],
    };
  }

  if (kind === "html") {
    const html = node as Html;
    const value = (html.value ?? "").trim();
    return value ? { note: value } : {};
  }

  return {};
}

function fence(lang: string, text: string): string {
  return "```" + lang + "\n" + text + "\n```";
}

function rowText(row: TableRow): string[] {
  return row.children.map((cell) => toText(cell).trim());
}

export function tableToStructure(table: Table): TopicTable | null {
  const rows = table.children.map(rowText).filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  return { header: rows[0], rows: rows.slice(1) };
}

export function tableToMarkdown(table: TopicTable): string {
  let width = table.header.length;
  for (const row of table.rows) if (row.length > width) width = row.length;
  const pad = (row: string[]): string => {
    const cells = [...row];
    while (cells.length < width) cells.push("");
    return "| " + cells.join(" | ") + " |";
  };
  const lines = [pad(table.header), "| " + Array(width).fill("---").join(" | ") + " |"];
  for (const row of table.rows) lines.push(pad(row));
  return lines.join("\n");
}
