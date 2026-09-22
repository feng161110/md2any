import type { TopicNode, TopicTable } from "../types.js";
import { DEFAULT_CENTRAL_COLOR, resolveBranchColors, topicStyle } from "../theme/colors.js";

export interface LayoutNode {
  topic: TopicNode;
  depth: number;
  branch: number;
  side: 1 | -1 | 0;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  fontSize: number;
  subtreeHeight: number;
  table?: TableMetrics;
  children: LayoutNode[];
}

export interface LayoutResult {
  root: LayoutNode;
  nodes: LayoutNode[];
  width: number;
  height: number;
  branchColors: string[];
}

export interface LayoutOptions {
  measure: (text: string, fontSize: number, bold: boolean) => number;
  centralColor?: string;
  branchColors?: string[];
  hGap?: number;
  vGap?: number;
  paddingX?: number;
  paddingY?: number;
  maxTextWidth?: number;
  margin?: number;
  lineHeightRatio?: number;
}

export function layoutTree(root: TopicNode, options: LayoutOptions): LayoutResult {
  const hGap = options.hGap ?? 64;
  const vGap = options.vGap ?? 16;
  const paddingX = options.paddingX ?? 18;
  const paddingY = options.paddingY ?? 12;
  const maxTextWidth = options.maxTextWidth ?? 210;
  const margin = options.margin ?? 40;
  const lineHeightRatio = options.lineHeightRatio ?? 1.45;

  const branchColors = resolveBranchColors((root.children ?? []).length, options.branchColors);
  const centralColor = options.centralColor ?? DEFAULT_CENTRAL_COLOR;
  const config: BuildConfig = { maxTextWidth, paddingX, paddingY, lineHeightRatio };

  const built = buildNode(root, 0, -1, 0, branchColors, centralColor, options, config);
  assignSides(built);
  measureSubtree(built, vGap);
  built.x = 0;
  built.y = 0;
  placeChildren(built, hGap, vGap);

  const nodes: LayoutNode[] = [];
  collectNodes(built, nodes);
  normalize(nodes, margin);

  // 逐项求极值：Math.max(...arr) 会把数组摊平进参数列表，节点上万时抛 RangeError
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (node.x + node.width > maxX) maxX = node.x + node.width;
    if (node.y + node.height > maxY) maxY = node.y + node.height;
  }

  return {
    root: built,
    nodes,
    width: Math.ceil(maxX + margin),
    height: Math.ceil(maxY + margin),
    branchColors,
  };
}

function assignSides(node: LayoutNode): void {
  node.children.forEach((child, index) => {
    if (node.depth === 0) {
      child.side = index % 2 === 0 ? 1 : -1;
    } else {
      child.side = node.side === -1 ? -1 : 1;
    }
    assignSides(child);
  });
}

function measureSubtree(node: LayoutNode, vGap: number): number {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height;
    return node.subtreeHeight;
  }

  if (node.depth === 0) {
    const right = node.children.filter((child) => child.side === 1);
    const left = node.children.filter((child) => child.side === -1);
    const height = Math.max(groupHeight(right, vGap), groupHeight(left, vGap));
    node.subtreeHeight = Math.max(node.height, height);
    return node.subtreeHeight;
  }

  node.subtreeHeight = Math.max(node.height, groupHeight(node.children, vGap));
  return node.subtreeHeight;
}

function groupHeight(children: LayoutNode[], vGap: number): number {
  if (children.length === 0) return 0;
  let total = 0;
  children.forEach((child, index) => {
    total += measureSubtree(child, vGap);
    if (index > 0) total += vGap;
  });
  return total;
}

function placeChildren(node: LayoutNode, hGap: number, vGap: number): void {
  const centerY = node.y + node.height / 2;

  if (node.depth === 0) {
    const right = node.children.filter((child) => child.side === 1);
    const left = node.children.filter((child) => child.side === -1);
    placeGroup(right, node.x + node.width + hGap, centerY, 1, hGap, vGap);
    placeGroup(left, node.x - hGap, centerY, -1, hGap, vGap);
    return;
  }

  const side: 1 | -1 = node.side === -1 ? -1 : 1;
  const anchor = side === 1 ? node.x + node.width + hGap : node.x - hGap;
  placeGroup(node.children, anchor, centerY, side, hGap, vGap);
}

function placeGroup(
  children: LayoutNode[],
  anchorX: number,
  centerY: number,
  side: 1 | -1,
  hGap: number,
  vGap: number,
): void {
  if (children.length === 0) return;
  const totalHeight =
    children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
    vGap * (children.length - 1);
  let cursor = centerY - totalHeight / 2;

  for (const child of children) {
    const childCenterY = cursor + child.subtreeHeight / 2;
    child.x = side === 1 ? anchorX : anchorX - child.width;
    child.y = childCenterY - child.height / 2;
    placeChildren(child, hGap, vGap);
    cursor += child.subtreeHeight + vGap;
  }
}

function normalize(nodes: LayoutNode[], margin: number): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
  }
  const dx = margin - minX;
  const dy = margin - minY;
  for (const node of nodes) {
    node.x += dx;
    node.y += dy;
  }
}

function collectNodes(node: LayoutNode, out: LayoutNode[]): void {
  out.push(node);
  for (const child of node.children) collectNodes(child, out);
}


export interface TableMetrics {
  columnWidths: number[];
  rowHeight: number;
  cellPaddingX: number;
  fontSize: number;
}

function measureTable(
  table: TopicTable,
  fontSize: number,
  measure: (text: string, fontSize: number, bold: boolean) => number,
): TableMetrics {
  const cellPaddingX = 12;
  const maxColumnWidth = 190;
  const minColumnWidth = 56;
  const columnWidths: number[] = [];

  for (let index = 0; index < table.header.length; index += 1) {
    let width = measure(table.header[index] ?? "", fontSize, true);
    for (const row of table.rows) {
      width = Math.max(width, measure(row[index] ?? "", fontSize, false));
    }
    columnWidths.push(
      Math.min(maxColumnWidth, Math.max(minColumnWidth, Math.ceil(width + cellPaddingX * 2))),
    );
  }

  return {
    columnWidths,
    rowHeight: Math.round(fontSize * 1.6) + 14,
    cellPaddingX,
    fontSize,
  };
}

interface BuildConfig {
  maxTextWidth: number;
  paddingX: number;
  paddingY: number;
  lineHeightRatio: number;
}

function buildNode(
  topic: TopicNode,
  depth: number,
  branch: number,
  side: 1 | -1 | 0,
  branchColors: string[],
  centralColor: string,
  options: LayoutOptions,
  config: BuildConfig,
): LayoutNode {
  const style = topicStyle(centralColor, branchColors, depth, branch);
  if (topic.table) {
    const metrics = measureTable(topic.table, Math.min(style.fontSize, 14), options.measure);
    const tableWidth = metrics.columnWidths.reduce((sum, value) => sum + value, 0);
    const tableHeight = metrics.rowHeight * (topic.table.rows.length + 1);
    const tableChildren = (topic.children ?? []).map((child, index) =>
      buildNode(child, depth + 1, depth === 0 ? index : branch, 0, branchColors, centralColor, options, config),
    );
    return {
      topic,
      depth,
      branch,
      side,
      x: 0,
      y: 0,
      width: tableWidth,
      height: tableHeight,
      lines: [],
      fontSize: metrics.fontSize,
      subtreeHeight: 0,
      table: metrics,
      children: tableChildren,
    };
  }
  let fontSize = style.fontSize;
  let lines = wrapText(
    topic.title || " ",
    config.maxTextWidth,
    fontSize,
    style.bold,
    options.measure,
  );
  if (lines.length > 8) {
    fontSize = Math.max(11, Math.round(style.fontSize * 0.78));
    lines = wrapText(
      topic.title || " ",
      config.maxTextWidth,
      fontSize,
      style.bold,
      options.measure,
    );
  }
  const lineHeight = Math.round(fontSize * config.lineHeightRatio);
  let textWidth = 0;
  for (const line of lines) {
    textWidth = Math.max(textWidth, options.measure(line, fontSize, style.bold));
  }
  const extra = hasTaskMarker(topic) ? 24 : 0;
  const width = Math.ceil(textWidth + config.paddingX * 2 + extra);
  const height = Math.ceil(lines.length * lineHeight + config.paddingY * 2);
  const children = (topic.children ?? []).map((child, index) =>
    buildNode(
      child,
      depth + 1,
      depth === 0 ? index : branch,
      0,
      branchColors,
      centralColor,
      options,
      config,
    ),
  );
  return {
    topic,
    depth,
    branch,
    side,
    x: 0,
    y: 0,
    width,
    height,
    lines,
    fontSize,
    subtreeHeight: 0,
    children,
  };
}

export function hasTaskMarker(topic: TopicNode): boolean {
  const markers = topic.markers ?? [];
  return markers.includes("task-done") || markers.includes("task-start");
}

export function isTaskDone(topic: TopicNode): boolean {
  return (topic.markers ?? []).includes("task-done");
}

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  bold: boolean,
  measure: (text: string, fontSize: number, bold: boolean) => number,
): string[] {
  // 先把跨行 `$$…$$` 合并成单行（TeX 对空白换行不敏感），避免按换行把公式拆散
  const merged = text
    .replace(/\r\n/g, "\n")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, body: string) => "$$" + body.replace(/\s+/g, " ").trim() + "$$");
  const paragraphs = merged.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const clean = paragraph.replace(/\s+/g, " ").trim();
    if (clean.length === 0) {
      if (lines.length > 0) lines.push("");
      continue;
    }
    for (const line of wrapLine(clean, maxWidth, fontSize, bold, measure)) {
      lines.push(line);
    }
  }

  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  return lines.length > 0 ? lines : [" "];
}

function wrapLine(
  text: string,
  maxWidth: number,
  fontSize: number,
  bold: boolean,
  measure: (text: string, fontSize: number, bold: boolean) => number,
): string[] {
  // `$$…$$` / `$…$` 公式作为原子 token，换行时不会被从中间拆开
  const tokens = text.match(/\$\$[^$\n]+\$\$|\$[^$\n]+\$|[A-Za-z0-9_.:/%-]+|\s+|[^\s]/g) ?? [text];
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    if (token.trim().length === 0 && current.length === 0) continue;
    const candidate = current + token;
    if (measure(candidate, fontSize, bold) > maxWidth && current.length > 0) {
      lines.push(current.trimEnd());
      current = token.trim().length === 0 ? "" : token;
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 0) lines.push(current.trimEnd());
  return lines;
}
