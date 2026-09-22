import type { MindMapIR, TopicNode } from "../types.js";
import { tableToMarkdown } from "../transform/rules/block.js";

export function irToMarkdown(ir: MindMapIR): string {
  const rendered = ir.sheets.map((sheet) => renderRoot(sheet.root)).join("\n\n---\n\n");
  return rendered.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function renderRoot(root: TopicNode): string {
  const lines: string[] = [];
  renderNode(root, 1, 0, lines);
  return lines.join("\n");
}

function renderNode(
  node: TopicNode,
  depth: number,
  listDepth: number,
  lines: string[],
): void {
  const task = isTask(node);
  const currentListDepth = listDepth > 0 ? listDepth : task ? 1 : 0;

  // 表格主题的标题默认就是拼好的表头（见 transform/rules/block.ts）。
  // 再写成标题的话，下次解析会先建一个同名标题节点、再在它下面建表格节点，
  // 每往返一圈就多一层，标题也重复一遍 —— 这里把这种冗余标题省掉。
  const redundantTitle = depth > 1 && node.title === node.table?.header.join(" | ");

  if (currentListDepth > 0) {
    if (!redundantTitle) {
      lines.push("  ".repeat(currentListDepth - 1) + bullet(node) + titleOf(node));
    }
  } else if (!redundantTitle) {
    lines.push("#".repeat(Math.min(depth, 6)) + " " + titleOf(node));
  }

  const noteIndent = currentListDepth > 0 ? "  ".repeat(currentListDepth) : "";
  if (node.table) {
    // GFM 表格要求独立起步：紧跟在标题后面会被当成同一段正文，表格会退化成普通文本，
    // 于是 ir → markdown → ir 的往返丢掉表格结构。
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    for (const line of tableToMarkdown(node.table).split("\n")) {
      lines.push(noteIndent + line);
    }
  }
  if (node.note) {
    for (const line of noteToMarkdown(node.note)) {
      lines.push(noteIndent + line);
    }
  }
  if (node.image?.src) {
    lines.push(noteIndent + "![](" + node.image.src + ")");
  }

  const children = node.children ?? [];
  for (const child of children) {
    const nextListDepth =
      depth >= 6 || currentListDepth > 0 ? currentListDepth + 1 : 0;
    if (currentListDepth === 0) lines.push("");
    renderNode(child, depth + 1, nextListDepth, lines);
  }
}

/**
 * 备注 → Markdown 行。
 *
 * 备注里存的本就可能是一整段 Markdown（引用带 `>`、代码块带围栏），
 * 一律再补 `> ` 会把它变成嵌套引用：二次解析时围栏被打散，
 * 正文会和代码粘在同一行、来回一圈还多一层缩进。
 * 所以已经是块级 Markdown 的按原样输出，纯文本才补 `> `，确保往返后仍是备注。
 */
function noteToMarkdown(note: string): string[] {
  const lines = note.split("\n");
  const isRichNote = lines.some((line) => /^\s*(>|```|~~~)/.test(line));
  return isRichNote ? lines : lines.map((line) => "> " + line);
}

function isTask(node: TopicNode): boolean {
  const markers = node.markers ?? [];
  return markers.includes("task-done") || markers.includes("task-start");
}

function bullet(node: TopicNode): string {
  const markers = node.markers ?? [];
  if (markers.includes("task-done")) return "- [x] ";
  if (markers.includes("task-start")) return "- [ ] ";
  return "- ";
}

/**
 * 标题必须是单行：带换行的标题写进 Markdown 会“溢出”到下一行，
 * 二次解析时被当成新的段落 / 标题，树的层级每往返一圈就长一层。
 * 这里把换行折成空格——画布上仍能分行显示，导出文本则是稳定的单行。
 */
function titleOf(node: TopicNode): string {
  const title = node.title.replace(/\s*\n+\s*/g, " ").trim();
  if (node.href) return "[" + title + "](" + node.href + ")";
  return title;
}
