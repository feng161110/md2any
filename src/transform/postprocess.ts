import type { MindMapIR, TopicNode } from "../types.js";
import type { ResolvedOptions } from "../config.js";

export function postprocess(ir: MindMapIR, options: ResolvedOptions): MindMapIR {
  const counter = { value: 0 };
  for (const sheet of ir.sheets) {
    sheet.root.title = sheet.root.title || "中心主题";
    normalize(sheet.root, 1, options.maxDepth, counter);
  }
  return ir;
}

function normalize(
  node: TopicNode,
  depth: number,
  maxDepth: number,
  counter: { value: number },
): void {
  counter.value += 1;
  node.id = "t" + counter.value;

  const children = node.children ?? [];
  const kept: TopicNode[] = [];
  for (const child of children) {
    if (!child.title && !child.children?.length) continue;
    normalize(child, depth + 1, maxDepth, counter);
    kept.push(child);
  }

  if (depth >= maxDepth && kept.length > 0) {
    node.note = mergeChildrenIntoNote(node, kept);
    node.children = undefined;
    return;
  }

  node.children = kept.length > 0 ? kept : undefined;
}

function mergeChildrenIntoNote(node: TopicNode, children: TopicNode[]): string {
  const lines = children.flatMap((child) => flatten(child));
  const note = lines.join("\n");
  return node.note ? node.note + "\n" + note : note;
}

/**
 * 把超过 maxDepth 的子主题展开成 markdown 列表文本，写入父节点 note。
 * indent 为当前层级缩进；被合并的子树自身可能已经带 note（更深层的合并结果），
 * 必须一并带出来，否则超过 maxDepth 两级以上的内容会静默丢失。
 */
function flatten(node: TopicNode, indent = ""): string[] {
  const lines = [indent + "- " + node.title];
  const inner = indent + "  ";
  for (const line of (node.note ?? "").split("\n")) lines.push(inner + line);
  for (const child of node.children ?? []) lines.push(...flatten(child, inner));
  return lines;
}
