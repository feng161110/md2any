import type { MindMapIR } from "../types.js";
import {
  CANVAS_BACKGROUND,
  DEFAULT_CENTRAL_COLOR,
  LINK_COLOR,
  darken,
  lighten,
  topicStyle,
} from "../theme/colors.js";
import {
  hasTaskMarker,
  isTaskDone,
  layoutTree,
  type LayoutNode,
  type LayoutResult,
} from "./layout.js";
import { containsMathText, splitMathSegments } from "./mathText.js";

export interface DrawContext {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  /** 公式绘制需要；可选，缺省时公式退化为普通文本 */
  drawImage?(image: unknown, x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
}

/**
 * 公式绘制器：把 `$…$` TeX 片段排版进画布节点。
 * 由调用方注入（Web 端用 MathJax SVG 预渲染）；不注入时公式按普通文本绘制。
 */
export interface MathPainter {
  /** 公式在指定字号下的绘制宽度（px）；display 为块级 `$$…$$` */
  width(tex: string, fontSize: number, display?: boolean): number;
  /** 在一行内绘制公式；centerY 为该行文本的垂直中点 */
  paint(
    ctx: DrawContext,
    tex: string,
    x: number,
    centerY: number,
    fontSize: number,
    display?: boolean,
  ): void;
}

export interface DrawOptions {
  centralColor?: string;
  branchColors?: string[];
  fontFamily?: string;
  sheetGap?: number;
  math?: MathPainter;
}

export interface MindMapSize {
  width: number;
  height: number;
}

const LINE_HEIGHT_RATIO = 1.45;

export function measureMindMapSize(
  ctx: DrawContext,
  ir: MindMapIR,
  options: DrawOptions = {},
): MindMapSize {
  const fontFamily = options.fontFamily ?? defaultFontFamily();
  const sheetGap = options.sheetGap ?? 64;
  const measure = createMeasure(ctx, fontFamily, options.math);

  let width = 0;
  let height = 0;
  ir.sheets.forEach((sheet, index) => {
    const layout = layoutTree(sheet.root, {
      measure,
      centralColor: options.centralColor,
      branchColors: options.branchColors,
    });
    width = Math.max(width, layout.width);
    height += layout.height;
    if (index < ir.sheets.length - 1) height += sheetGap;
  });
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export function drawMindMap(
  ctx: DrawContext,
  ir: MindMapIR,
  options: DrawOptions = {},
): void {
  const fontFamily = options.fontFamily ?? defaultFontFamily();
  const sheetGap = options.sheetGap ?? 64;
  const centralColor = options.centralColor ?? DEFAULT_CENTRAL_COLOR;
  const measure = createMeasure(ctx, fontFamily, options.math);

  let offsetY = 0;
  for (const sheet of ir.sheets) {
    const layout = layoutTree(sheet.root, {
      measure,
      centralColor,
      branchColors: options.branchColors,
    });
    ctx.save();
    ctx.translate(0, offsetY);
    drawSheet(ctx, layout, fontFamily, centralColor, options.math);
    ctx.restore();
    offsetY += layout.height + sheetGap;
  }
}

/** 行宽测量：注入 math 时按「文本段 + 公式段」拼宽，否则整行 measureText */
export function createMeasure(ctx: DrawContext, fontFamily: string, math?: MathPainter) {
  return (text: string, fontSize: number, bold: boolean): number => {
    ctx.font = fontOf(fontSize, bold, fontFamily);
    if (!math || !containsMathText(text)) return ctx.measureText(text).width;
    let total = 0;
    for (const segment of splitMathSegments(text)) {
      total +=
        segment.kind === "math"
          ? math.width(segment.value, fontSize, segment.display)
          : ctx.measureText(segment.value).width;
    }
    return total;
  };
}

function drawSheet(
  ctx: DrawContext,
  layout: LayoutResult,
  fontFamily: string,
  centralColor: string,
  math?: MathPainter,
): void {
  ctx.fillStyle = CANVAS_BACKGROUND;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.strokeStyle = LINK_COLOR;
  ctx.lineWidth = 2;
  for (const node of layout.nodes) {
    for (const child of node.children) drawLink(ctx, node, child);
  }

  for (const node of layout.nodes) {
    drawNode(ctx, node, fontFamily, centralColor, layout.branchColors, math);
  }
}

function drawLink(ctx: DrawContext, parent: LayoutNode, child: LayoutNode): void {
  const side = child.side === -1 ? -1 : 1;
  const x1 = side === 1 ? parent.x + parent.width : parent.x;
  const y1 = parent.y + parent.height / 2;
  const x2 = side === 1 ? child.x : child.x + child.width;
  const y2 = child.y + child.height / 2;
  const curve = Math.max(28, Math.abs(x2 - x1) / 2);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + curve * side, y1, x2 - curve * side, y2, x2, y2);
  ctx.stroke();
}
function drawNode(
  ctx: DrawContext,
  node: LayoutNode,
  fontFamily: string,
  centralColor: string,
  branchColors: string[],
  math?: MathPainter,
): void {
  const style = topicStyle(centralColor, branchColors, node.depth, node.branch);
  const radius = node.depth === 0 ? 12 : 8;

  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.10)";
  roundRectPath(ctx, node.x + 3, node.y + 4, node.width, node.height, radius);
  ctx.fill();
  ctx.restore();

  if (node.topic.table && node.table) {
    drawTable(ctx, node, style, fontFamily);
    return;
  }

  roundRectPath(ctx, node.x, node.y, node.width, node.height, radius);
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.strokeStyle = style.border;
  ctx.lineWidth = style.lineWidth;
  ctx.stroke();

  const lineHeight = Math.round(node.fontSize * LINE_HEIGHT_RATIO);
  const textLeft = node.x + (hasTaskMarker(node.topic) ? 32 : 18);
  let textY =
    node.y + node.height / 2 - (node.lines.length * lineHeight) / 2 + lineHeight / 2;

  ctx.fillStyle = style.color;
  ctx.font = fontOf(node.fontSize, style.bold, fontFamily);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const line of node.lines) {
    if (math && containsMathText(line)) {
      drawLineWithMath(ctx, line, textLeft, textY, node.fontSize, math);
    } else {
      ctx.fillText(line, textLeft, textY);
    }
    textY += lineHeight;
  }

  if (hasTaskMarker(node.topic)) drawCheckbox(ctx, node, style.color);
  if (node.topic.note) drawNoteDot(ctx, node, style.color);
}

/** 含公式的行：按段推进光标，文本走 fillText，公式交给 MathPainter */
function drawLineWithMath(
  ctx: DrawContext,
  line: string,
  startX: number,
  centerY: number,
  fontSize: number,
  math: MathPainter,
): void {
  let cursorX = startX;
  for (const segment of splitMathSegments(line)) {
    if (segment.kind === "math") {
      math.paint(ctx, segment.value, cursorX, centerY, fontSize, segment.display);
      cursorX += math.width(segment.value, fontSize, segment.display);
    } else {
      ctx.fillText(segment.value, cursorX, centerY);
      cursorX += ctx.measureText(segment.value).width;
    }
  }
}

function drawCheckbox(ctx: DrawContext, node: LayoutNode, color: string): void {
  const size = 15;
  const x = node.x + 10;
  const y = node.y + node.height / 2 - size / 2;

  roundRectPath(ctx, x, y, size, size, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (!isTaskDone(node.topic)) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 3.5, y + size / 2);
  ctx.lineTo(x + 6.5, y + size - 4.5);
  ctx.lineTo(x + size - 3.5, y + 4.5);
  ctx.stroke();
}

function drawNoteDot(ctx: DrawContext, node: LayoutNode, color: string): void {
  ctx.beginPath();
  ctx.arc(node.x + node.width - 9, node.y + 9, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function roundRectPath(
  ctx: DrawContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fontOf(fontSize: number, bold: boolean, fontFamily: string): string {
  return (bold ? "bold " : "") + fontSize + "px " + fontFamily;
}

function defaultFontFamily(): string {
  return "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif";
}

function drawTable(
  ctx: DrawContext,
  node: LayoutNode,
  style: ReturnType<typeof topicStyle>,
  fontFamily: string,
): void {
  const table = node.topic.table;
  const metrics = node.table;
  if (!table || !metrics) return;

  const columnWidths = metrics.columnWidths;
  const rowHeight = metrics.rowHeight;
  const totalWidth = columnWidths.reduce((sum, value) => sum + value, 0);
  const rowsCount = table.rows.length + 1;
  const totalHeight = rowHeight * rowsCount;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(node.x, node.y, totalWidth, totalHeight);
  ctx.fillStyle = lighten(style.fill, 0.82);
  ctx.fillRect(node.x, node.y, totalWidth, rowHeight);
  ctx.fillStyle = "#f8fafc";
  for (let row = 2; row < rowsCount; row += 2) {
    ctx.fillRect(node.x, node.y + row * rowHeight, totalWidth, rowHeight);
  }

  ctx.strokeStyle = lighten(style.fill, 0.55);
  ctx.lineWidth = 1;
  for (let row = 0; row <= rowsCount; row += 1) {
    const y = node.y + row * rowHeight;
    ctx.beginPath();
    ctx.moveTo(node.x, y);
    ctx.lineTo(node.x + totalWidth, y);
    ctx.stroke();
  }
  let columnX = node.x;
  for (let column = 0; column <= columnWidths.length; column += 1) {
    ctx.beginPath();
    ctx.moveTo(columnX, node.y);
    ctx.lineTo(columnX, node.y + totalHeight);
    ctx.stroke();
    columnX += columnWidths[column] ?? 0;
  }

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  ctx.font = fontOf(metrics.fontSize, true, fontFamily);
  ctx.fillStyle = darken(style.fill, 0.55);
  drawTableRow(ctx, table.header, node.x, node.y + rowHeight / 2, columnWidths, metrics.cellPaddingX);

  ctx.font = fontOf(metrics.fontSize, false, fontFamily);
  ctx.fillStyle = "#33475b";
  table.rows.forEach((row, index) => {
    drawTableRow(
      ctx,
      row,
      node.x,
      node.y + (index + 1) * rowHeight + rowHeight / 2,
      columnWidths,
      metrics.cellPaddingX,
    );
  });
}

function drawTableRow(
  ctx: DrawContext,
  cells: string[],
  startX: number,
  centerY: number,
  columnWidths: number[],
  paddingX: number,
): void {
  let cursorX = startX;
  cells.forEach((text, index) => {
    const width = columnWidths[index] ?? 0;
    if (text) {
      ctx.fillText(fitText(ctx, text, width - paddingX * 2), cursorX + paddingX, centerY);
    }
    cursorX += width;
  });
}

function fitText(ctx: DrawContext, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(result + "…").width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + "…";
}
