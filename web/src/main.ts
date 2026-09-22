import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { select, zoomTransform, type ZoomBehavior } from "d3";
// @ts-ignore
import { convertToIR, exportIR } from "@core/index";
// @ts-ignore
import {
  createMeasure,
  drawMindMap,
  measureMindMapSize,
  type DrawContext,
  type MathPainter,
} from "@core/render/draw";
// @ts-ignore
import { layoutTree, type LayoutNode, type LayoutResult } from "@core/render/layout";
import { DEFAULT_BRANCH_COLORS, DEFAULT_CENTRAL_COLOR, hexToHsl, hslToHex, resolveBranchColors } from "@core/theme/colors";
// @ts-ignore
import type { ConvertOptions, ExportFormat, MindMapIR, TopicNode } from "@core/types";
import { clampCapacity, paginate, type PageBlock, type PageSlice } from "./pages";
import { createPreviewMarkdown } from "./md-extras";
import { renderDiagrams } from "./diagrams";
import { collectMathTexts, createMathPainter } from "./math-draw";
// XMind 预览（markmap-lib）用 KaTeX 渲染公式，需要它的样式表才能正确显示
import "katex/dist/katex.min.css";
import "./style.css";
// markmap-lib 的公式与代码高亮渲染器读的是全局 window.katex / window.hljs：
// 找不到就把这次内容按「原始文本」先渲染出来，再异步去 CDN 现拉脚本
// —— 首屏因此会看到公式没排出来、代码没高亮，非得再切一次视图才正常。
// 这里直接把本地依赖挂到全局：首帧即正确，且完全不需要网络。
// 两者本来就随 markmap-lib 打进包里，不会额外增加体积。
import katex from "katex";
import hljs from "highlight.js";

const markmapGlobals = window as unknown as { katex?: unknown; hljs?: unknown };
markmapGlobals.katex = katex;
markmapGlobals.hljs = hljs;

// 演示文稿放在 sample.md：独立文件好维护，也不必躲在 TS 字符串的转义里。
// Vite 的 `?raw` 把它原样读成字符串（类型由 vite/client 提供）。
import SAMPLE from "./sample.md?raw";

const FONT_FAMILY = "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif";
const SCALE = 2;

/**
 * 纸张宽度（A4 的 210mm，@96dpi）取自 style.css 的 --page-width，是唯一真源。
 * 纸张尺寸不随视口变化：窄屏不把内容挤成一列，而是整张等比缩小，
 * 这样手机、电脑看到的版式与分页一致，导出的 PDF 也逐页相同。
 */
function readPageWidth(): number {
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--page-width");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 794;
}

const PAGE_WIDTH = readPageWidth();

const input = document.getElementById("markdown-input") as HTMLTextAreaElement;
const statusBar = document.getElementById("status") as HTMLElement;
const fileNameInput = document.getElementById("file-name") as HTMLInputElement;
// 页数读数会在首次 render 时同步写入，所以必须和上面这些引用一起提前声明
const pageCount = document.getElementById("page-count") as HTMLElement;
const pageNav = document.getElementById("page-nav") as HTMLElement;
const pageNavList = document.getElementById("page-nav-list") as HTMLElement;
const pageNavToggle = document.getElementById("page-nav-toggle") as HTMLButtonElement;
const formatSelect = document.getElementById("format") as HTMLSelectElement;
const formatMenu = document.getElementById("format-menu") as HTMLElement;
// 点击交给外层 wrap（select 已 click-through），鼠标与触屏都能弹出自绘菜单
const selectWrap = document.querySelector(".select-wrap") as HTMLElement;
const downloadButton = document.getElementById("download") as HTMLButtonElement;
const sampleButton = document.getElementById("load-sample") as HTMLButtonElement;
const dropZone = document.getElementById("drop-zone") as HTMLElement;
const swatchBar = document.getElementById("branch-swatches") as HTMLElement;
// 配色只作用于「导图预览」与 PNG / PDF 导出，因此这一块只在导图视图下露出
const paletteBlock = document.querySelector(".palette-block") as HTMLElement;
const svg = document.getElementById("mindmap-markmap") as unknown as SVGElement;
const canvas = document.getElementById("mindmap-canvas") as HTMLCanvasElement;
const tabXmind = document.getElementById("tab-xmind") as HTMLButtonElement;
const tabCanvas = document.getElementById("tab-canvas") as HTMLButtonElement;
const viewXmind = document.getElementById("view-xmind") as HTMLElement;
const viewCanvas = document.getElementById("view-canvas") as HTMLElement;
const viewMarkdown = document.getElementById("view-markdown") as HTMLElement;
const markdownPreview = document.getElementById("markdown-preview") as HTMLElement;
const tabMarkdown = document.getElementById("tab-markdown") as HTMLButtonElement;
const pickerModal = document.getElementById("pickerModal") as HTMLElement;
const pickerCloseBtn = document.getElementById("pickerCloseBtn") as HTMLButtonElement;
const pickerCancelBtn = document.getElementById("pickerCancelBtn") as HTMLButtonElement;
const pickerConfirmBtn = document.getElementById("pickerConfirmBtn") as HTMLButtonElement;
const pickerSwatch = document.getElementById("pickerSwatch") as HTMLElement;
const pickerHex = document.getElementById("pickerHex") as HTMLElement;
const colorCircle = document.getElementById("colorCircle") as HTMLElement;
const wheelCanvas = document.getElementById("colorCircleCanvas") as HTMLCanvasElement;
const handle = document.getElementById("handle") as HTMLElement;
const lightnessRange = document.getElementById("lightnessRange") as HTMLInputElement;
const workspace = document.getElementById("workspace") as HTMLElement;
const modeSwitch = document.getElementById("mode-switch") as HTMLElement;
const pickFileButton = document.getElementById("pick-file") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const toast = document.getElementById("toast") as HTMLElement;
const emptyState = document.getElementById("empty-state") as HTMLElement;
const downloadLabel = document.getElementById("download-label") as HTMLElement;
const toolbar = document.getElementById("toolbar") as HTMLElement;
const toolbarToggle = document.getElementById("toolbar-toggle") as HTMLButtonElement;
const toolbarSummary = document.getElementById("toolbar-summary") as HTMLElement;
const pageDock = document.getElementById("page-dock") as HTMLElement;
const pageDockList = document.getElementById("page-dock-list") as HTMLElement;
const pageDockSplit = document.getElementById("page-dock-split") as HTMLButtonElement;
const pageDockMerge = document.getElementById("page-dock-merge") as HTMLButtonElement;

const transformer = new Transformer();
// 预览语法见 web/src/md-extras.ts：内置语法之外补齐任务列表、Front-matter、脚注、标记、上下标、公式
const md = createPreviewMarkdown();

/** 完整格式表：从标记里读一次，带 data-paged 的选项才在「Markdown 预览」下可用 */
const ALL_FORMAT_OPTIONS = Array.from(formatSelect.options).map((option) => ({
  value: option.value as ExportFormat,
  label: option.textContent ?? option.value,
  paged: option.dataset.paged === "true",
}));
const PAGED_FORMAT_OPTIONS = ALL_FORMAT_OPTIONS.filter((option) => option.paged);
// 非「Markdown 预览」视图上次选的格式记在这里，切回来时恢复，不会因切视图被改写
let formatOutsidePaged: ExportFormat = "pdf";
// 「Markdown 预览」视图的默认 / 上次选择：导出默认 PNG（整篇连续图）
let formatInPaged: ExportFormat = "png";

/**
 * 按当前视图收放导出格式：「Markdown 预览」导出的是分页纸张，只留 PDF / PNG，其余视图放出全部。
 * 选项集合没变就不动 DOM，免得下拉在打开时被重建。
 */
function syncFormatOptions(): void {
  const paged = activeView === "markdown";
  const options = paged ? PAGED_FORMAT_OPTIONS : ALL_FORMAT_OPTIONS;
  // 目标值要在重建选项之前算出来：重建会让浏览器默认选中第一项。
  // 每个视图记住各自上次选的格式，Markdown 预览默认 PNG、其余视图默认 PDF
  const preferred = paged ? formatInPaged : formatOutsidePaged;
  const wanted = options.some((option) => option.value === preferred) ? preferred : options[0].value;

  const signature = options.map((option) => option.value).join(",");
  if (formatSelect.dataset.options !== signature) {
    formatSelect.dataset.options = signature;
    formatSelect.replaceChildren(
      ...options.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      }),
    );
  }
  if (formatSelect.value !== wanted) formatSelect.value = wanted;
  syncFormatMenu();
}

/**
 * 自绘菜单：系统弹层改不动圆角、阴影与勾选标记，鼠标 / 触屏统一用它。
 * 这一层只是「样子」，取值与无障碍语义始终在原生 select 上，所以给它 aria-hidden。
 */
let formatMenuOpen = false;

/** 让自绘菜单与 select 的选项、当前取值保持一致（选项集合没变就只刷新选中态） */
function syncFormatMenu(): void {
  const options = activeView === "markdown" ? PAGED_FORMAT_OPTIONS : ALL_FORMAT_OPTIONS;
  const items = Array.from(formatMenu.querySelectorAll<HTMLButtonElement>(".select-item"));
  const same =
    items.length === options.length &&
    items.every((item, index) => item.dataset.value === options[index].value);

  if (!same) {
    formatMenu.replaceChildren(
      ...options.map((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "select-item";
        item.dataset.value = option.value;
        // 面板本身 aria-hidden（语义交给原生 select），所以项不参与 Tab 序列
        item.tabIndex = -1;
        const check = document.createElement("span");
        check.className = "select-check";
        check.textContent = "✓";
        const label = document.createElement("span");
        label.textContent = option.label;
        item.append(check, label);
        return item;
      }),
    );
  }

  for (const item of formatMenu.querySelectorAll<HTMLButtonElement>(".select-item")) {
    item.classList.toggle("selected", item.dataset.value === formatSelect.value);
  }
}

function closeFormatMenu(): void {
  if (!formatMenuOpen) return;
  formatMenuOpen = false;
  formatMenu.hidden = true;
}

function openFormatMenu(): void {
  if (formatMenuOpen) return;
  syncFormatMenu();
  formatMenuOpen = true;
  formatMenu.hidden = false;
}

/** 菜单里选中一项：交给原生 select 改值并广播 change，后续逻辑与手选完全同一条路 */
function selectFormat(value: string): void {
  closeFormatMenu();
  if (formatSelect.value === value) return;
  formatSelect.value = value;
  formatSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

// select 设成了 click-through（见 style.css 的 pointer-events:none），
// 所以鼠标和触屏都点在外层 wrap 上，统一走自绘菜单，手机上也一样好看。
selectWrap.addEventListener("pointerdown", (event) => {
  // 点到菜单项交给菜单自己的 handler，点到菜单空白处则不动
  if (event.target instanceof Element && event.target.closest(".select-menu")) return;
  event.preventDefault();
  formatSelect.focus({ preventScroll: true });
  if (formatMenuOpen) closeFormatMenu();
  else openFormatMenu();
});

// 焦点离开下拉（Tab 走开、点到别处）就收起面板
formatSelect.addEventListener("blur", closeFormatMenu);

// 用 pointerdown 选项：不抢 select 的焦点，面板就不会因为 blur 而先关掉
formatMenu.addEventListener("pointerdown", (event) => {
  const item = (event.target as Element | null)?.closest<HTMLButtonElement>(".select-item");
  if (!item) return;
  event.preventDefault();
  selectFormat(item.dataset.value ?? "");
});

document.addEventListener("pointerdown", (event) => {
  if (!formatMenuOpen) return;
  const target = event.target as Node | null;
  if (target && (formatMenu.contains(target) || selectWrap.contains(target))) return;
  closeFormatMenu();
});
let markmap: Markmap | undefined;
let activeView: "xmind" | "canvas" | "markdown" = "xmind";
let currentIR: MindMapIR | null = null;
let canvasLayout: LayoutResult | null = null;
let zoomScale = 1;
let centralColor: string | undefined;
let branchColors: string[] | undefined;

type PickerTarget = { kind: "central" } | { kind: "branch"; index: number };
let pickerTarget: PickerTarget = { kind: "central" };
let pickerColor = DEFAULT_CENTRAL_COLOR;
let wheelHue = 210;
let wheelSat = 0.8;
let wheelLightness = 30;

function currentOptions(): ConvertOptions {
  return {
    centralColor,
    branchColors,
  };
}

function syncFileNamePlaceholder(ir: MindMapIR): void {
  const title = ir.sheets[0]?.root.title ?? "mindmap";
  fileNameInput.placeholder = "留空则用「" + title + "」";
}

function countTopics(ir: MindMapIR): number {
  let total = 0;
  const walk = (node: TopicNode): void => {
    total += 1;
    for (const child of node.children ?? []) walk(child);
  };
  for (const sheet of ir.sheets) walk(sheet.root);
  return total;
}

function branchTitles(ir: MindMapIR): string[] {
  return (ir.sheets[0]?.root.children ?? []).map((child: { title: any; }) => child.title);
}

function activeBranchColors(ir: MindMapIR): string[] {
  const titles = branchTitles(ir);
  if (branchColors && branchColors.length === titles.length) return branchColors;
  return resolveBranchColors(titles.length, undefined);
}

// 导图公式绘制器：MathJax SVG 预渲染，标题 TeX 签名变化时在 renderCanvas 里异步重建
let mathPainter: MathPainter | undefined;
let mathSignature = "\u0000";
let canvasRenderToken = 0;

async function ensureMathPainter(ir: MindMapIR): Promise<MathPainter | undefined> {
  const signature = collectMathTexts(ir)
    .map((item) => (item.display ? "D:" : "I:") + item.tex)
    .join("\u0000");
  if (signature === mathSignature) return mathPainter;
  const painter = await createMathPainter(ir);
  mathPainter = painter;
  mathSignature = signature;
  return painter;
}

function drawOptions(ir: MindMapIR) {
  return {
    centralColor: centralColor ?? DEFAULT_CENTRAL_COLOR,
    branchColors: activeBranchColors(ir),
    fontFamily: FONT_FAMILY,
    math: mathPainter,
  };
}

function canFitMarkmap(): boolean {
  if (svg.clientWidth < 8 || svg.clientHeight < 8) return false;
  const rect = (
    markmap as unknown as {
      state?: { rect?: { x1: number; y1: number; x2: number; y2: number } };
    }
  )?.state?.rect;
  if (!rect) return true;
  const width = rect.x2 - rect.x1;
  const height = rect.y2 - rect.y1;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0.5 && height > 0.5;
}

const svgNode = svg as unknown as SVGSVGElement;
let markmapBaseScale = 1;

/** d3-zoom 维护的实际缩放倍数（与滚轮、拖动共用同一套变换） */
function markmapScale(): number {
  const k = zoomTransform(svgNode).k;
  return Number.isFinite(k) && k > 0 ? k : 1;
}

function isMarkmapFitted(): boolean {
  if (markmapBaseScale <= 0) return true;
  return Math.abs(markmapScale() / markmapBaseScale - 1) < 0.02;
}

function markmapBehavior(): ZoomBehavior<SVGSVGElement, unknown> | undefined {
  return (markmap as unknown as { zoom?: ZoomBehavior<SVGSVGElement, unknown> } | undefined)?.zoom;
}

/** 用户是否主动缩放过（按钮 / 双指）：字体到位后的自动重排要让位给用户视角 */
let markmapUserZoomed = false;

/**
 * 按钮缩放：直接复用滚轮走的 d3-zoom 路径。
 * 即时生效（无过渡动画，连点不会互相打断）、以视图中心为锚点、缩放倍数连续累积。
 */
function scaleMarkmapBy(factor: number): void {
  const behavior = markmapBehavior();
  if (!behavior) return;
  markmapUserZoomed = true;
  select(svgNode).call(behavior.scaleBy, factor);
  syncZoomLabel();
}

/** 统一适配入口：容器不可见或内容为空时跳过，避免 d3 计算出 NaN 变换 */
function fitMarkmap(): void {
  const instance = markmap;
  if (!instance || !canFitMarkmap()) return;
  void instance.fit().then(() => {
    markmapBaseScale = markmapScale();
    if (zoomScale !== 1 && Number.isFinite(zoomScale)) instance.rescale(zoomScale);
    syncZoomLabel();
  });
}

/**
 * 触摸手势：XMind 预览改用和「导图预览」（viewCanvas）同一套 pointer 逻辑，
 * 桌面端的鼠标拖拽仍由 d3-zoom 负责。
 *
 * d3-zoom 自带 touch 分支，但它只认 TouchEvent，遇到我们为触摸设的 pointer-capture、
 * 以及某些平台把 SVG/foreignObject 里的 touch-action 处理得不一致时，
 * 单指拖动会失效或变成页面滚动。这里摘掉它的 touch 监听、自己接管，
 * 于是移动端和桌面端一样可以任意平移、双指缩放。
 */
const markmapPointers = new Map<number, { x: number; y: number }>();
let markmapPanPointer: number | null = null;
let markmapDragDistance = 0;
let markmapPinchDistance = 0;

/** 摘掉 d3-zoom 的 touch 分支（鼠标拖拽与滚轮缩放保留），避免和下面的手势叠加成双倍位移 */
function detachMarkmapTouch(instance: Markmap): void {
  instance.svg
    .on("touchstart.zoom", null)
    .on("touchmove.zoom", null)
    .on("touchend.zoom touchcancel.zoom", null);
}

/** 按屏幕像素平移：translateBy 内部会乘以当前缩放，先除回去才是跟手的位移 */
function panMarkmap(dx: number, dy: number): void {
  const behavior = markmapBehavior();
  if (!behavior || dx === 0 || dy === 0) return;
  const k = markmapScale();
  // 平移不改变缩放倍数，这里也就没有刷新百分比的必要（拖动时每帧都写 DOM 是白工）
  select(svgNode).call(behavior.translateBy, dx / k, dy / k);
}

/** 以 SVG 内的 [x, y] 为锚点缩放 */
function pinchMarkmap(factor: number, x: number, y: number): void {
  const behavior = markmapBehavior();
  if (!behavior) return;
  markmapUserZoomed = true;
  select(svgNode).call(behavior.scaleBy, factor, [x, y]);
  syncZoomLabel();
}

function markmapPointerPairs(): Array<{ x: number; y: number }> {
  return Array.from(markmapPointers.values());
}

function markmapPairDistance(): number {
  const points = markmapPointerPairs();
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

/** 两指中点换算成 SVG 坐标，作为缩放锚点 */
function markmapPairAnchor(): { x: number; y: number } {
  const points = markmapPointerPairs();
  if (points.length < 2) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  return {
    x: (points[0].x + points[1].x) / 2 - rect.left,
    y: (points[0].y + points[1].y) / 2 - rect.top,
  };
}

svg.addEventListener("pointerdown", (event) => {
  // 只接管触摸：鼠标仍走 d3-zoom，笔（pen）会额外派发兼容鼠标事件，
  // 一并接管会和 d3 那边叠加出双倍位移。
  if (event.pointerType !== "touch") return;
  if (!markmap) return;
  svg.setPointerCapture(event.pointerId);
  markmapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (markmapPointers.size === 1) {
    markmapPanPointer = event.pointerId;
    markmapDragDistance = 0;
    markmapPinchDistance = 0;
  } else if (markmapPointers.size === 2) {
    markmapPanPointer = null;
    markmapPinchDistance = markmapPairDistance();
  }
});

svg.addEventListener("pointermove", (event) => {
  if (!markmapPointers.has(event.pointerId)) return;
  const previous = markmapPointers.get(event.pointerId);
  if (!previous) return;
  markmapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (markmapPointers.size >= 2) {
    const distance = markmapPairDistance();
    if (markmapPinchDistance > 8 && distance > 8) {
      const anchor = markmapPairAnchor();
      pinchMarkmap(distance / markmapPinchDistance, anchor.x, anchor.y);
      markmapPinchDistance = distance;
    }
    return;
  }

  if (markmapPanPointer !== event.pointerId) return;
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  markmapDragDistance = Math.max(markmapDragDistance, Math.hypot(dx, dy));
  panMarkmap(dx, dy);
});

function endMarkmapPointer(event: PointerEvent): void {
  if (!markmapPointers.delete(event.pointerId)) return;
  if (markmapPanPointer === event.pointerId) markmapPanPointer = null;
  if (markmapPointers.size < 2) markmapPinchDistance = 0;
  // 松开一根手指后还在拖动的那根接手平移，省得抬指后画面卡住
  if (markmapPointers.size === 1) {
    markmapPanPointer = Number(markmapPointers.keys().next().value);
  }
}

svg.addEventListener("pointerup", endMarkmapPointer);
svg.addEventListener("pointercancel", endMarkmapPointer);

let markmapViewport = { width: 0, height: 0 };
let markmapDirty = false;
// Markdown 分页也怕 0 宽度：窄屏「编辑」模式下容器不可见，此时测量全部退化成 1px，只能等重新可见再测
let markdownDirty = false;
// 分页导航里被标记为「当前页」的序号，移动端底部分页条的操作按钮以它为目标
let activePageIndex = 0;
// 纸张的适配比例（纸张比预览区宽时整张缩小）与用户倍率相乘后，才是屏幕上实际生效的缩放
let markdownFit = 1;
let markdownAppliedScale = 1;

/** 当前纸张的实际缩放：把屏幕位移换算回版式坐标时要用它 */
function appliedScale(): number {
  return markdownAppliedScale > 0 ? markdownAppliedScale : 1;
}

/**
 * markmap 在尺寸为 0 的容器里（窄屏「编辑」模式下预览区 display:none）渲染出来的布局不可用，
 * 所以容器恢复可见或尺寸变化后必须重新渲染一次，而不是只做适配计算。
 */
function refreshMarkmapViewport(): void {
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  if (width < 8 || height < 8) return;
  const wasHidden = markmapViewport.width < 8 || markmapViewport.height < 8;
  const resized = width !== markmapViewport.width || height !== markmapViewport.height;
  markmapViewport = { width, height };

  // 曾在不可见（0 尺寸）时创建过：销毁重建，彻底清掉残留布局与失效的手势绑定
  if (wasHidden && markmap) {
    markmap.destroy();
    markmap = undefined;
    markmapBaseScale = 1;
  }

  if (resized || markmapDirty || !markmap) {
    renderMarkmap();
    return;
  }
  fitMarkmap();
}

/**
 * markmap-lib 内置的 KaTeX 插件能把行内 `$…$` 正确渲染，但它的 html-parser 只把
 * 标题 / 列表建成节点，**正文段落（含块级公式段落）会被忽略**；而且 `$$…$$` 块级
 * 公式渲染出的 `<p class="katex-block">` 也会让 html-parser 解析失败。
 *
 * 这里做两层转换，让 XMind 预览也能显示公式：
 * 1. 独立成段的 `$$…$$` 块折叠成列表项 `- $…$`，markmap 会把它建成可见节点；
 * 2. 其余残留的单行 `$$…$$`（如标题内）折叠成行内 `$…$`。
 */
function normalizeMarkmapMath(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "$$") {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== "$$") {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        out.push("- $" + body.join(" ").replace(/\s+/g, " ").trim() + "$");
        i += 1;
        continue;
      }
    }
    // 单行独立成段的 `$$…$$`：同样折叠成列表项，否则会被 markmap 的「正文段落不建节点」规则忽略
    const single = /^\s*(\$\$)([\s\S]*?)\1\s*$/.exec(line);
    if (single && single[2].trim().length > 0) {
      out.push("- $" + single[2].replace(/\s+/g, " ").trim() + "$");
      i += 1;
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n").replace(/\$\$([^$\n]+?)\$\$/g, (_m, body: string) => "$" + body.trim() + "$");
}

function renderMarkmap(): void {
  const { root } = transformer.transform(normalizeMarkmapMath(input.value));
  if (!markmap) {
    markmap = Markmap.create(svg, { autoFit: false });
    // 双保险：内联声明，确保触摸手势不被浏览器判定为滚动
    svg.style.touchAction = "none";
    detachMarkmapTouch(markmap);
  }
  const instance = markmap;
  markmapViewport = { width: svg.clientWidth, height: svg.clientHeight };
  markmapDirty = false;
  void instance.setData(root).then(() => {
    fitMarkmap();
  });
}

async function renderCanvas(ir: MindMapIR): Promise<void> {
  const token = ++canvasRenderToken;
  await ensureMathPainter(ir);
  if (token !== canvasRenderToken) return; // 已有更新的渲染请求，丢弃过期绘制
  const options = drawOptions(ir);
  const zoom = zoomScale;
  const probeCtx = canvas.getContext("2d") as unknown as DrawContext;
  const size = measureMindMapSize(probeCtx, ir, options);
  canvas.width = Math.max(1, Math.round(size.width * SCALE * zoom));
  canvas.height = Math.max(1, Math.round(size.height * SCALE * zoom));
  canvas.style.width = Math.max(1, Math.round(size.width * zoom)) + "px";
  canvas.style.height = Math.max(1, Math.round(size.height * zoom)) + "px";
  const ctx = canvas.getContext("2d") as unknown as DrawContext;
  ctx.scale(SCALE * zoom, SCALE * zoom);
  drawMindMap(ctx, ir, options);

  // 命中测试布局与绘制用同一套公式感知的测量口径
  const measure = createMeasure(probeCtx, FONT_FAMILY, options.math);
  const sheet = ir.sheets[0];
  canvasLayout = sheet
    ? layoutTree(sheet.root, {
        measure,
        centralColor: options.centralColor,
        branchColors: options.branchColors,
      })
    : null;
}


let toastTimer = 0;

interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * 提示条。带按钮的提示留久一点（8s）并等用户点：嵌入场景下下载可能被宿主页的
 * sandbox 规则拦掉，这个按钮是用户唯一的手动出口。
 */
function showToast(
  message: string,
  kind: "info" | "ok" | "error" = "info",
  action?: ToastAction,
): void {
  toast.textContent = message;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      hideToast(kind);
      action.run();
    });
    toast.appendChild(button);
  }
  toast.className = "toast show" + (kind === "info" ? "" : " " + kind) + (action ? " acted" : "");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => hideToast(kind), action ? 8000 : 2600);
}

function hideToast(kind: "info" | "ok" | "error"): void {
  toast.className = "toast" + (kind === "info" ? "" : " " + kind);
  toast.textContent = "";
}

function setStatus(message: string, kind: "idle" | "ok" | "error" = "idle"): void {
  statusBar.className = kind === "idle" ? "status" : "status " + kind;
  statusBar.textContent = message;
}

function syncEmptyState(): void {
  emptyState.hidden = input.value.trim().length > 0 || isFullscreen();
}

function render(): void {
  const markdown = input.value;
  try {
    const ir = convertToIR(markdown, currentOptions());
    currentIR = ir;
    renderSwatches(ir);
    syncFileNamePlaceholder(ir);
    syncFormatOptions();
    syncPaletteVisibility();
    if (activeView === "xmind") {
      if (svg.clientWidth > 8 && svg.clientHeight > 8) renderMarkmap();
      else markmapDirty = true; // 容器不可见：等切到预览时再渲染，避免在 0 尺寸下布局
    } else if (activeView === "canvas") void renderCanvas(ir);
    else renderMarkdown();
    syncEmptyState();
    if (markdown.trim().length === 0) {
      setStatus("等待输入：在左侧写下 Markdown，或拖入 / 打开 .md 文件");
    } else {
      setStatus(
        "中心主题「" + (ir.sheets[0]?.root.title ?? "") + "」· 共 " + countTopics(ir) + " 个主题",
        "ok",
      );
    }
  } catch (error) {
    setStatus("解析失败：" + (error instanceof Error ? error.message : String(error)), "error");
  }
}

function createSwatch(label: string, color: string, onOpen: () => void): HTMLElement {
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.className = "swatch";
  const dot = document.createElement("span");
  dot.className = "swatch-dot";
  dot.style.background = color;
  const text = document.createElement("span");
  text.textContent = label;
  wrap.appendChild(dot);
  wrap.appendChild(text);
  wrap.addEventListener("click", onOpen);
  return wrap;
}

function renderSwatches(ir: MindMapIR): void {
  const titles = branchTitles(ir);
  const colors = activeBranchColors(ir);
  const currentCentral = centralColor ?? DEFAULT_CENTRAL_COLOR;
  swatchBar.innerHTML = "";
  swatchBar.appendChild(
    createSwatch("中心主题", currentCentral, () => openPicker({ kind: "central" }, currentCentral)),
  );
  titles.forEach((title, index) => {
    swatchBar.appendChild(
      createSwatch(title, colors[index], () =>
        openPicker({ kind: "branch", index }, colors[index]),
      ),
    );
  });
}

const VIEW_ORDER: Array<"xmind" | "canvas" | "markdown"> = ["xmind", "canvas", "markdown"];
const VIEW_ELEMENTS: Record<string, HTMLElement> = {
  xmind: viewXmind,
  canvas: viewCanvas,
  markdown: viewMarkdown,
};
const VIEW_TABS: Record<string, HTMLButtonElement> = {
  xmind: tabXmind,
  canvas: tabCanvas,
  markdown: tabMarkdown,
};

function switchView(next: "xmind" | "canvas" | "markdown"): void {
  if (next === activeView) return;
  const outgoing = VIEW_ELEMENTS[activeView];
  const incoming = VIEW_ELEMENTS[next];
  const forward = VIEW_ORDER.indexOf(next) > VIEW_ORDER.indexOf(activeView);

  activeView = next;
  incoming.className = "view " + (forward ? "next" : "prev");
  void incoming.offsetWidth;
  incoming.className = "view active";
  outgoing.className = "view " + (forward ? "prev" : "next");

  for (const key of VIEW_ORDER) {
    const isActive = key === next;
    VIEW_TABS[key].classList.toggle("active", isActive);
    VIEW_TABS[key].setAttribute("aria-selected", String(isActive));
    VIEW_ELEMENTS[key].setAttribute("aria-hidden", String(!isActive));
  }
  // 格式选项与配色面板都跟着视图走，且会改变工具栏高度，必须在算适配比例之前落定
  syncFormatOptions();
  syncPaletteVisibility();

  zoomScale = next === "canvas" && currentIR ? computeCanvasZoom(currentIR) : 1;
  if (next === "canvas") resetCanvasOffset();
  if (next !== "markdown") {
    pageCount.hidden = true;
    pageNav.hidden = true;
    pageDock.hidden = true;
    viewMarkdown.classList.remove("has-dock");
  }
  syncZoomTools();
  render();
  window.requestAnimationFrame(() => {
    if (activeView === "xmind") refreshMarkmapViewport();
    else fitToWindow();
    syncEmptyState();
  });
}
function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const hex = hslToHex(hue, saturation, lightness / 100);
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function drawWheel(): void {
  const size = wheelCanvas.width;
  const ctx = wheelCanvas.getContext("2d");
  if (!ctx) return;
  const radius = size / 2;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - radius + 0.5;
      const dy = y - radius + 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const index = (y * size + x) * 4;
      if (distance > radius) {
        image.data[index + 3] = 0;
        continue;
      }
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const saturation = Math.min(1, distance / radius);
      const [r, g, b] = hslToRgb(hue, saturation, wheelLightness);
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function updatePickerPreview(): void {
  pickerColor = hslToHex(wheelHue, wheelSat, wheelLightness / 100);
  pickerSwatch.style.background = pickerColor;
  pickerHex.textContent = pickerColor.toUpperCase();
  const radius = wheelCanvas.width / 2;
  const angle = (wheelHue * Math.PI) / 180;
  const distance = wheelSat * radius;
  handle.style.left = radius + Math.cos(angle) * distance + "px";
  handle.style.top = radius + Math.sin(angle) * distance + "px";
}

function openPicker(target: PickerTarget, color: string): void {
  pickerTarget = target;
  const hsl = hexToHsl(color);
  wheelHue = hsl.h;
  wheelSat = hsl.s;
  wheelLightness = Math.round(hsl.l * 100);
  lightnessRange.value = String(wheelLightness);
  drawWheel();
  updatePickerPreview();
  pickerModal.classList.add("open");
}

function closePicker(): void {
  pickerModal.classList.remove("open");
}

function applyPicker(): void {
  if (pickerTarget.kind === "central") {
    centralColor = pickerColor;
  } else {
    const titles = currentIR ? branchTitles(currentIR) : [];
    const colors = currentIR ? activeBranchColors(currentIR).slice() : [];
    while (colors.length < titles.length) {
      colors.push(DEFAULT_BRANCH_COLORS[colors.length % DEFAULT_BRANCH_COLORS.length]);
    }
    colors[pickerTarget.index] = pickerColor;
    branchColors = colors;
  }
  closePicker();
  render();
}

function moveHandle(clientX: number, clientY: number): void {
  const rect = colorCircle.getBoundingClientRect();
  const radius = rect.width / 2;
  const dx = clientX - rect.left - radius;
  const dy = clientY - rect.top - radius;
  const distance = Math.min(radius, Math.sqrt(dx * dx + dy * dy));
  wheelHue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  wheelSat = radius === 0 ? 0 : distance / radius;
  updatePickerPreview();
}

let dragging = false;
colorCircle.addEventListener("pointerdown", (event) => {
  dragging = true;
  colorCircle.setPointerCapture(event.pointerId);
  moveHandle(event.clientX, event.clientY);
});
colorCircle.addEventListener("pointermove", (event) => {
  if (dragging) moveHandle(event.clientX, event.clientY);
});
colorCircle.addEventListener("pointerup", () => {
  dragging = false;
});
colorCircle.addEventListener("pointercancel", () => {
  dragging = false;
});

lightnessRange.addEventListener("input", () => {
  wheelLightness = Number(lightnessRange.value);
  drawWheel();
  updatePickerPreview();
});

pickerCloseBtn.addEventListener("click", closePicker);
pickerCancelBtn.addEventListener("click", closePicker);
pickerConfirmBtn.addEventListener("click", applyPicker);
pickerModal.addEventListener("click", (event) => {
  if (event.target === pickerModal) closePicker();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // 两个 Escape 消费者必须有先后：先给最上层的弹层，命中就到此为止。
  // 若各自判断而不统一收口，关掉配色面板的同时会连带退出全屏。
  if (saveModal.classList.contains("open")) {
    closeSavePanel();
    return;
  }
  if (pickerModal.classList.contains("open")) {
    closePicker();
    return;
  }
  if (formatMenuOpen) {
    formatSelect.focus({ preventScroll: true });
    closeFormatMenu();
    return;
  }
  if (isFullscreen()) toggleFullscreen();
});

function debounce(fn: () => void, delay: number): () => void {
  let timer = 0;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, delay);
  };
}

const renderLater = debounce(render, 250);

function extensionOf(format: ExportFormat): string {
  if (format === "json") return ".json";
  if (format === "markdown") return ".md";
  if (format === "png") return ".png";
  if (format === "pdf") return ".pdf";
  return ".xmind";
}

function safeFileName(name: string): string {
  return name.replace(/[\\\\/:*?"<>|]/g, "-").trim() || "mindmap";
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  // Firefox / Safari 要求 <a> 在文档里才认这次点击
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  // 撤销必须延后：同步 revoke 会让尚未启动的下载被直接掐掉
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

/** 触屏设备：命中区要按手指给，不能按屏宽判断（iPad 横屏 1024px 依然是手指） */
function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints ?? 0) > 1;
}

/** 能否把这份文件交给系统分享（Safari 需要安全上下文与 web-share 授权，不支持就退下载） */
function canShareFile(file: File): boolean {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** 是否被 iframe 嵌入（跨域访问 top 会抛错，那也算嵌入） */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** 嵌入方的 origin：能读到 document.referrer 就定向发送，读不到才退到 "*" */
function embedderOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
}

/** 父页面回执的等待上限：等太久会把「导出中」拖得难受 */
const HANDOFF_TIMEOUT = 500;

/**
 * 宿主页对下载的态度。
 *
 * - "allowed"：没写 sandbox、或 sandbox 里含 allow-downloads → 子页面直接下载即可，
 *   所有设备一视同仁；
 * - "blocked"：写了 sandbox 却缺 allow-downloads → 浏览器会丢掉这次下载（只有一句
 *   控制台 warning），必须请宿主页接管、或在手机上走系统分享；
 * - "unknown"：跨源嵌入读不到 frameElement（规范返回 null），按「可能被拦」处理。
 */
type DownloadPermission = "allowed" | "blocked" | "unknown";

function embedderDownloadPermission(): DownloadPermission {
  if (!isEmbedded()) return "allowed";
  try {
    const sandbox = window.frameElement?.getAttribute("sandbox");
    if (sandbox === null || sandbox === undefined) return "allowed";
    return sandbox.split(/\s+/).includes("allow-downloads") ? "allowed" : "blocked";
  } catch {
    return "unknown";
  }
}

/**
 * 嵌入场景下把文件交给宿主页面保存。
 *
 * 被 iframe 嵌入时，子页面的下载会被宿主的 sandbox 规则拦掉 ——
 * `sandbox="allow-scripts allow-same-origin"` 少了 `allow-downloads`，
 * 浏览器就直接丢弃这次下载（控制台只留一句 warning，页面上毫无反应）。
 * 而宿主页面自己不在沙箱里，由它来保存是嵌入环境下唯一稳的路径。
 *
 * 协议（宿主页只需几行，见 README）：
 *   子 → 父：{ type: "md2xmind:download", name, mime, size, blob }
 *   父 → 子：{ type: "md2xmind:download:done", name }   // 拿到就回，表示已接管
 * 没回执（宿主页没实现）就返回 false，调用方继续走本地兜底。
 */
function handOffToParent(blob: Blob, name: string): Promise<boolean> {
  if (!isEmbedded()) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      resolve(ok);
    };
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; name?: string } | null;
      if (data && data.type === "md2xmind:download:done") finish(!data.name || data.name === name);
    };
    window.addEventListener("message", onMessage);
    try {
      window.parent.postMessage(
        { type: "md2xmind:download", name, mime: blob.type, size: blob.size, blob },
        embedderOrigin(),
      );
    } catch {
      finish(false);
      return;
    }
    window.setTimeout(() => finish(false), HANDOFF_TIMEOUT);
  });
}

/**
 * 把导出结果交给用户，返回「文件最后去了哪里」。
 *
 * 顺序有意设计成「能直接下载就一律直接下载」：
 * 1. 宿主页拦了下载（sandbox 缺 allow-downloads，或跨源读不到属性）时，先请宿主页接管 ——
 *    宿主不在沙箱里，由它保存最稳；
 * 2. 宿主没接管时，手机上退回系统分享（分享面板的「存储到文件」是沙箱里唯一能落地的入口）；
 * 3. 其余全部走 `<a download>`：桌面、Android、以及放行了 allow-downloads 的
 *    iPhone / iPad 都是同一条路，行为完全一致。
 *
 * 曾经给 iOS 单独留过「提前开好标签页、再把它的地址设成 blob:」的兜底 ——
 * 那会让苹果设备看到的是「跳转到一个 blob 页面」而不是下载，与预期相反，已删除。
 */
async function deliverFile(blob: Blob, name: string): Promise<"saved" | "shared" | "handed"> {
  const permission = embedderDownloadPermission();
  if (permission !== "allowed" && (await handOffToParent(blob, name))) return "handed";

  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  if (permission !== "allowed" && isTouchDevice() && canShareFile(file)) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      // 用户点了取消：也算交接完成，不必再兜底
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
      // 其它失败：继续往下走下载
    }
  }

  saveBlob(blob, name);
  return "saved";
}

let savePanelUrl: string | null = null;
let savePanelFile: { blob: Blob; name: string } | null = null;

function formatBytes(size: number): string {
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}

function closeSavePanel(): void {
  saveModal.classList.remove("open");
  saveBody.replaceChildren();
  savePanelFile = null;
  const url = savePanelUrl;
  savePanelUrl = null;
  // 面板里的 <img> / <iframe> 可能还在用它，等卸载完再撤销
  if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 在当前界面里摊开导出结果，并提供就地保存的方式。
 *
 * 嵌入场景下宿主的 sandbox 可能直接拦掉下载（浏览器只留一句控制台警告，
 * 而且**新开标签页还是当前界面导航都绕不过去**：拦的是下载行为本身）。
 * 所以这里不开新标签页，而是把文件交给用户眼前：
 * 图片可长按 / 右键另存，文本可复制，PDF 用浏览器自带查看器，
 * 二进制文件保留「下载文件」按钮（宿主页放开 allow-downloads 就能用）。
 */
function openSavePanel(blob: Blob, name: string): void {
  savePanelFile = { blob, name };
  savePanelUrl = URL.createObjectURL(blob);
  const type = blob.type || "application/octet-stream";
  saveTitle.textContent = name;
  saveMeta.textContent = formatBytes(blob.size) + " · " + type;
  saveBody.replaceChildren();
  saveCopy.hidden = true;
  let hint = "若「下载文件」没有反应，说明宿主页面拦下了下载：给它加上 allow-downloads，或按 README 里的几行代码接管下载。";

  if (type.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = savePanelUrl;
    image.alt = name;
    saveBody.appendChild(image);
    hint = "长按图片（手机）或右键（电脑）→ 另存为图片，可在当前界面直接保存。";
  } else if (type === "application/pdf") {
    const frame = document.createElement("iframe");
    frame.src = savePanelUrl;
    frame.title = name;
    saveBody.appendChild(frame);
    // 沙箱里浏览器自带查看器加载不出来（contentDocument 为空），
    // 这时「下载文件」同样会被 sandbox 拦掉，所以把人指向能通的 PNG 路线
    hint =
      "用查看器自带的下载 / 打印另存；若这里是空白（宿主页的 sandbox 会挡住查看器），" +
      "可改用 PNG 导出 —— PNG 能在当前界面直接长按 / 右键另存。";
  } else if (type.startsWith("text/")) {
    const pre = document.createElement("pre");
    saveBody.appendChild(pre);
    void blob.text().then((text) => {
      pre.textContent = text;
    });
    saveCopy.hidden = false;
    hint = "可直接框选复制，或用「下载文件」保存成文件。";
  } else {
    const box = document.createElement("div");
    box.className = "save-binary";
    box.textContent = name + "（" + formatBytes(blob.size) + "）";
    saveBody.appendChild(box);
  }

  saveHint.textContent = hint;
  saveModal.classList.add("open");
}

function canvasToBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 编码失败")), "image/png");
  });
}

async function download(): Promise<void> {
  const format = formatSelect.value as ExportFormat;
  const options = currentOptions();
  const ir = convertToIR(input.value, options);
  const fallbackName = ir.sheets[0]?.root.title ?? "mindmap";
  const typedName = fileNameInput.value.trim();
  const name = safeFileName(typedName.length > 0 ? typedName : fallbackName);
  setBusy(true);
  try {
    let blob: Blob;
    let extra = "";
    if (format === "png") {
      const image =
        activeView === "markdown"
          ? await renderMarkdownImage()
          : await renderMindMapImage(ir);
      blob = image.blob;
    } else if (format === "pdf") {
      if (activeView === "markdown") {
        // 编辑栏下预览区不可见，逐页截图同样需要先给它一个可测量的形态
        const restorePane = preparePreviewForCapture();
        try {
          const exported = await exportMarkdownPdf();
          blob = exported.blob;
          extra = " · 共 " + exported.pageCount + " 页";
        } finally {
          restorePane();
        }
      } else {
        blob = await exportImagePdf(await renderMindMapImage(ir));
      }
    } else {
      const result = await exportIR(ir, format, options);
      blob =
        typeof result === "string"
          ? new Blob([result], { type: "text/plain;charset=utf-8" })
          : new Blob([result as unknown as BlobPart], { type: "application/octet-stream" });
    }

    const fileName = name + extensionOf(format);
    const delivered = await deliverFile(blob, fileName);
    setStatus("已导出：" + fileName + extra, "ok");
    if (delivered === "handed") {
      showToast("已交给所在页面保存 " + fileName + extra, "ok");
    } else if (delivered === "shared") {
      showToast("已通过系统分享保存 " + fileName + extra, "ok");
    } else if (embedderDownloadPermission() === "blocked") {
      // 宿主页的 sandbox 明确拦了下载（浏览器只留一句控制台 warning），
      // 不开新标签页 —— 把文件摊在当前界面里，随用户就地另存
      openSavePanel(blob, fileName);
      showToast("已导出 " + fileName + extra, "ok", {
        label: "打开导出面板",
        run: () => openSavePanel(blob, fileName),
      });
    } else {
      showToast("已导出 " + fileName + extra, "ok");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus("导出失败：" + message, "error");
    showToast("导出失败：" + message, "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(busy: boolean): void {
  downloadButton.disabled = busy;
  downloadButton.classList.toggle("loading", busy);
  downloadLabel.textContent = busy ? "导出中" : "导出";
}

/**
 * 导入 Markdown。
 * 文件名优先采用源文件名（去掉扩展名），未提供源文件时清空、回退到中心主题；
 * 中心主题本身始终由 Markdown 的 H1 / Front-matter 决定，不会被这里改动。
 */
function loadMarkdown(text: string, source?: string): void {
  input.value = text;
  centralColor = undefined;
  branchColors = undefined;
  fileNameInput.value = source ? safeFileName(source.replace(/\.[^.]+$/, "")) : "";
  render();
  if (source) showToast("已载入 " + source, "ok");
}

input.addEventListener("input", renderLater);
tabXmind.addEventListener("click", () => switchView("xmind"));
tabCanvas.addEventListener("click", () => switchView("canvas"));
tabMarkdown.addEventListener("click", () => switchView("markdown"));
downloadButton.addEventListener("click", () => void download());
formatSelect.addEventListener("change", () => {
  // 各视图记住各自上次选的格式，切回来时恢复
  if (activeView === "markdown") formatInPaged = formatSelect.value as ExportFormat;
  else formatOutsidePaged = formatSelect.value as ExportFormat;
  updateToolbarSummary();
  syncFormatMenu();
  // 在 Markdown 预览里，PDF 走分页纸张、PNG 走整篇连续，换格式就得重排一次
  if (activeView === "markdown") render();
});

sampleButton.addEventListener("click", () => loadMarkdown(SAMPLE));

pickFileButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void file
    .text()
    .then((text) => loadMarkdown(text, file.name))
    .catch(() => showToast("读取文件失败", "error"))
    .finally(() => {
      fileInput.value = "";
    });
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  void file
    .text()
    .then((text) => loadMarkdown(text, file.name))
    .catch(() => showToast("读取文件失败", "error"));
});

for (const button of Array.from(modeSwitch.querySelectorAll<HTMLButtonElement>(".mode-btn"))) {
  button.addEventListener("click", () => {
    setMobileMode(button.dataset.mode === "preview" ? "preview" : "editor");
  });
}

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void download();
  }
});

window.addEventListener(
  "resize",
  debounce(() => {
    syncToolbarResponsive();
    if (activeView === "xmind") {
      if (isMarkmapFitted()) refreshMarkmapViewport();
      return;
    }
    // 纸张尺寸固定，可用宽度变化只影响适配比例，不必重新测量分页
    if (activeView === "markdown") {
      refreshMarkdownLayout();
      syncZoomLabel();
      return;
    }
    if (zoomScale === 1) fitToWindow();
    else applyZoom();
  }, 220),
);

// 启动渲染放在文件末尾：渲染链路会用到 previewPane 等元素，
// 提前跑会因为 TDZ 拿到未初始化的引用，而这个错误会被 render 的 try/catch 吞掉。

const previewPane = document.getElementById("preview-pane") as HTMLElement;
const zoomTools = document.getElementById("zoom-tools") as HTMLElement;
const zoomInButton = document.getElementById("zoom-in") as HTMLButtonElement;
const zoomOutButton = document.getElementById("zoom-out") as HTMLButtonElement;
const zoomFitButton = document.getElementById("zoom-fit") as HTMLButtonElement;
const fullscreenToggle = document.getElementById("fullscreen-toggle") as HTMLButtonElement;
const previewBody = document.querySelector(".preview-body") as HTMLElement;
const zoomLevel = document.getElementById("zoom-level") as HTMLElement;
const saveModal = document.getElementById("save-modal") as HTMLElement;
const saveTitle = document.getElementById("save-title") as HTMLElement;
const saveMeta = document.getElementById("save-meta") as HTMLElement;
const saveBody = document.getElementById("save-body") as HTMLElement;
const saveHint = document.getElementById("save-hint") as HTMLElement;
const saveDownload = document.getElementById("save-download") as HTMLButtonElement;
const saveCopy = document.getElementById("save-copy") as HTMLButtonElement;
const saveClose = document.getElementById("save-close") as HTMLButtonElement;
const saveCloseBtn = document.getElementById("save-close-btn") as HTMLButtonElement;

saveClose.addEventListener("click", closeSavePanel);
saveCloseBtn.addEventListener("click", closeSavePanel);
saveModal.addEventListener("click", (event) => {
  if (event.target === saveModal) closeSavePanel();
});
saveDownload.addEventListener("click", () => {
  if (savePanelFile) saveBlob(savePanelFile.blob, savePanelFile.name);
});
saveCopy.addEventListener("click", () => {
  const text = saveBody.querySelector("pre")?.textContent ?? "";
  void navigator.clipboard?.writeText(text).then(
    () => showToast("已复制到剪贴板", "ok"),
    () => showToast("复制失败，请手动框选复制", "error"),
  );
});

/**
 * 紧凑布局（单栏 + 编辑 / 预览切换）：手机，以及竖屏平板。
 * 竖屏 iPad 只有 744~834px，左右两栏会把预览头部挤到溢出，手指也更适合「一块块看」，
 * 所以阈值放到 900；横屏平板（1024+）空间足够，保持左右两栏的对照工作流。
 */
const COMPACT_BREAKPOINT = 900;

function isCompactLayout(): boolean {
  return window.innerWidth <= COMPACT_BREAKPOINT;
}

/** 手机宽度：导出设置默认折叠（平板竖屏纵向空间够，展开更好用） */
const NARROW_BREAKPOINT = 720;

function isNarrowLayout(): boolean {
  return window.innerWidth <= NARROW_BREAKPOINT;
}

function setMobileMode(mode: "editor" | "preview"): void {
  workspace.dataset.mode = mode;
  for (const button of Array.from(modeSwitch.querySelectorAll<HTMLButtonElement>(".mode-btn"))) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
  if (mode !== "preview") {
    // 记录「画布已不可见」：下次回到预览时按真实尺寸重建，而不是复用 0 尺寸下算出的布局
    if (activeView === "xmind") markmapViewport = { width: 0, height: 0 };
    return;
  }
  zoomScale = 1;
  window.requestAnimationFrame(() => {
    refreshActiveView();
    syncEmptyState();
  });
}

/* ---- 移动端工具栏折叠 ---- */
let toolbarCollapsed = false;
let toolbarWasMobile = false;

function updateToolbarSummary(): void {
  const formatLabel =
    formatSelect.options[formatSelect.selectedIndex]?.text ?? formatSelect.value;
  const parts = [formatLabel];
  // 配色面板收起时不报读数，避免摘要里出现界面上看不到的东西
  if (!paletteBlock.hidden) {
    const swatchCount = swatchBar.querySelectorAll(".swatch").length;
    if (swatchCount > 0) parts.push(swatchCount + " 项配色");
  }
  toolbarSummary.textContent = parts.join(" · ");
}

/** 配色只影响「导图预览」与 PNG / PDF 导出，其余视图下没有可调项，直接收起面板 */
function syncPaletteVisibility(): void {
  paletteBlock.hidden = activeView !== "canvas";
  updateToolbarSummary();
}

function applyToolbarCollapsed(): void {
  toolbar.classList.toggle("collapsed", toolbarCollapsed);
  toolbarToggle.setAttribute("aria-expanded", String(!toolbarCollapsed));
  // 折叠后下拉本身也看不见了，菜单没必要留在屏幕上
  closeFormatMenu();
}

toolbarToggle.addEventListener("click", () => {
  toolbarCollapsed = !toolbarCollapsed;
  applyToolbarCollapsed();
});

/** 跨断点时按设备默认折叠/展开；用户手动切换后仅在断点变化时才重置 */
function syncToolbarResponsive(): void {
  const mobile = isNarrowLayout();
  if (mobile !== toolbarWasMobile) {
    toolbarWasMobile = mobile;
    toolbarCollapsed = mobile;
    applyToolbarCollapsed();
  }
  updateToolbarSummary();
}

toolbarWasMobile = isNarrowLayout();
toolbarCollapsed = toolbarWasMobile;
applyToolbarCollapsed();
updateToolbarSummary();

function syncZoomTools(): void {
  zoomTools.hidden = false;
  syncZoomLabel();
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;

function syncZoomLabel(): void {
  if (activeView === "xmind" && markmap) {
    const relative = markmapBaseScale > 0 ? markmapScale() / markmapBaseScale : 1;
    zoomLevel.textContent = Math.round(relative * 100) + "%";
    return;
  }
  zoomLevel.textContent = Math.round(zoomScale * 100) + "%";
}

/** 经典滚动条会占掉预览区一部分宽度，保守预留一点，免得纸张挤出横向滚动 */
const SCROLLBAR_GUTTER = 16;

/**
 * 适配比例：纸张宽 PAGE_WIDTH，预览区更窄时整张缩小到刚好铺满（只缩不放）。
 * 用预览容器（而非纸张自身）的宽度计算，避免「出现滚动条 → 宽度变小 → 比例再变」的来回抖动。
 */
function computeMarkdownFit(previous: number): number {
  const style = window.getComputedStyle(viewMarkdown);
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const available =
    previewBody.getBoundingClientRect().width - padding - SCROLLBAR_GUTTER;
  if (!(available >= 8)) return previous; // 容器不可见：沿用上一次的比例
  return Math.min(1, available / PAGE_WIDTH);
}

/**
 * 纸张按固定宽度排版，窄屏整张等比缩小（「适应窗口」的基准），用户倍率在此之上叠加。
 * 缩放变化时按比例补偿滚动，读到的内容不会跳走。
 */
function applyMarkdownZoom(): void {
  markdownFit = computeMarkdownFit(markdownFit);
  const next = markdownFit * zoomScale;
  if (Math.abs(next - markdownAppliedScale) < 0.0001) return;
  const ratio = markdownAppliedScale > 0 ? next / markdownAppliedScale : 1;
  markdownAppliedScale = next;
  markdownPreview.style.zoom = next === 1 ? "" : String(next);
  // 页间空隙与页底把手按「屏幕像素」定尺寸，缩放后仍保持同样的触摸命中区
  markdownPreview.style.setProperty("--paper-scale", String(next));
  // 纸张被缩得很小时页脚标注会糊成一团，改由底部分页条交代页序
  markdownPreview.classList.toggle("zoomed-out", next < 0.7);
  if (ratio !== 1) viewMarkdown.scrollTop = viewMarkdown.scrollTop * ratio;
}

/**
 * 测量与导出都必须在 1:1 下进行：纸张缩放会让 getBoundingClientRect 的读数带上倍率，
 * 页间空隙按屏幕像素折算也会跟着放大。用完记得 restoreLayoutScale 还原。
 */
function suspendLayoutScale(): { css: string; scale: number; paperScale: string } {
  const saved = {
    css: markdownPreview.style.zoom,
    scale: markdownAppliedScale,
    paperScale: markdownPreview.style.getPropertyValue("--paper-scale"),
  };
  markdownPreview.style.zoom = "";
  markdownPreview.style.setProperty("--paper-scale", "1");
  markdownAppliedScale = 1;
  return saved;
}

function restoreLayoutScale(saved: { css: string; scale: number; paperScale: string }): void {
  markdownPreview.style.zoom = saved.css;
  markdownAppliedScale = saved.scale;
  if (saved.paperScale) markdownPreview.style.setProperty("--paper-scale", saved.paperScale);
  else markdownPreview.style.removeProperty("--paper-scale");
}

function applyZoom(): void {
  syncZoomLabel();
  if (activeView === "xmind") return; // XMind 视图的变换由 d3-zoom 维护
  if (activeView === "canvas") {
    scheduleCanvasRender();
    return;
  }
  applyMarkdownZoom();
}

let canvasRenderQueued = false;

/** 连点按钮或连续滚轮时，每帧最多重绘一次画布，避免反复分配位图造成卡顿 */
function scheduleCanvasRender(): void {
  if (canvasRenderQueued) return;
  canvasRenderQueued = true;
  window.requestAnimationFrame(() => {
    canvasRenderQueued = false;
    if (activeView === "canvas" && currentIR) void renderCanvas(currentIR);
  });
}

/** 画布与 Markdown 视图的倍率缩放（XMind 视图走 scaleMarkmapBy） */
function zoomBy(factor: number): void {
  const before = zoomScale;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, before * factor));
  if (next === before) return;
  zoomScale = next;
  syncZoomLabel();
  if (activeView === "canvas") {
    scheduleCanvasRender();
    return;
  }
  applyMarkdownZoom();
}

/** 计算让整张导图刚好放进预览区的比例（只缩不放），并做数值兜底 */
function computeCanvasZoom(ir: MindMapIR): number {
  const options = drawOptions(ir);
  const probeCtx = canvas.getContext("2d") as unknown as DrawContext;
  const size = measureMindMapSize(probeCtx, ir, options);
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    return 1;
  }
  const available = previewBody.getBoundingClientRect();
  if (available.width < 8 || available.height < 8) return 1;
  const fitWidth = (available.width - 24) / size.width;
  const fitHeight = (available.height - 24) / size.height;
  const fit = Math.min(1, fitWidth, fitHeight);
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

function fitToWindow(): void {
  if (activeView === "xmind") {
    zoomScale = 1;
    fitMarkmap();
    syncZoomLabel();
    return;
  }
  if (activeView === "canvas" && currentIR) {
    zoomScale = computeCanvasZoom(currentIR);
    resetCanvasOffset();
    void renderCanvas(currentIR);
    syncZoomLabel();
    return;
  }
  zoomScale = 1;
  applyMarkdownZoom();
  syncZoomLabel();
}

/**
 * 字体稳定后重排 XMind 预览。
 *
 * KaTeX 公式、代码高亮都是 WebFont：字体到位前量到的字形尺寸偏小，
 * 节点框和公式会挤在一起，看上去就像「公式没加载出来」。
 * SVG foreignObject 不会因为字体到位自动重排，只能自己重来一遍。
 *
 * 关键：必须重新渲染（renderMarkmap → setData 才会重新量节点尺寸）。
 * 不能退化成「只 fitMarkmap()」—— fit 只改变换矩阵，不重算已写进 DOM 的宽高，
 * 量错的尺寸会一直留着，这正是「要切走再切回来才正常」的原因。
 */
function refreshAfterFonts(): void {
  if (!document.fonts) return;
  // 两条路都要挂：首次渲染有没有发起字形请求取决于容器当时是否可见，
  // 只有 loadingdone 能覆盖「稍后才发起」的情况；字体已在缓存时不会再触发
  // loadingdone，则由 fonts.ready 补上（两者可能都触发，重排一次不贵）。
  document.fonts.addEventListener("loadingdone", remeasureMarkmap);
  void document.fonts.ready.then(() => remeasureMarkmap());
}

/**
 * 字体到位后的补正：只认「用户缩放」不认「平移」（标志见上方 markmapUserZoomed）。
 * 平移只是换个位置，重排后重新适配一次无伤大雅；
 * 而漏掉这次重排，就是「公式要切走再切回才显示」的老问题。
 */
function remeasureMarkmap(): void {
  if (activeView !== "xmind" || markmapUserZoomed) return;
  if (!markmap) {
    // 首帧容器还是 0 尺寸时第一次渲染被跳过，这里按现在的尺寸补上
    refreshMarkmapViewport();
    return;
  }
  // 用户没缩放过，那「重新适配一次」就是唯一正确的终态，不必记住旧视角
  // （重排时 fit 可能还在动画中，读到的中间倍数反而是错的）
  renderMarkmap();
}

/**
 * 首帧时容器尺寸和 WebFont 都还没稳定，第一次 render 量到的往往不是最终排版。
 * 这里在下一帧按真实尺寸补一次（三个视图的补正入口见 refreshActiveView）。
 */
function refreshWhenSettled(): void {
  window.requestAnimationFrame(() => {
    refreshActiveView();
    window.requestAnimationFrame(() => refreshAfterFonts());
  });
}

/**
 * 预览区重新可见或尺寸变化后，按真实尺寸恢复当前视图。
 * 三个视图的诉求其实是同一件事：markmap 要在有尺寸的容器里重排、分页要按真实宽度重新测量、
 * 导图要重新适配窗口，所以统一从一个入口进来。
 */
function refreshActiveView(): void {
  if (activeView === "xmind") refreshMarkmapViewport();
  else if (activeView === "markdown") {
    zoomScale = 1;
    refreshMarkdownLayout();
    syncZoomLabel();
  } else if (zoomScale === 1) fitToWindow();
  else applyZoom();
}

const ZOOM_STEP = 1.15;

function zoomIn(): void {
  if (activeView === "xmind") {
    scaleMarkmapBy(ZOOM_STEP);
    return;
  }
  zoomBy(ZOOM_STEP);
}

function zoomOut(): void {
  if (activeView === "xmind") {
    scaleMarkmapBy(1 / ZOOM_STEP);
    return;
  }
  zoomBy(1 / ZOOM_STEP);
}

zoomInButton.addEventListener("click", zoomIn);

zoomOutButton.addEventListener("click", zoomOut);

zoomFitButton.addEventListener("click", () => fitToWindow());

// 滚轮缩放：导图视图与 XMind 预览一致（滚轮即缩放）；Markdown 视图保留普通滚动，Ctrl / ⌘ + 滚轮才缩放
const wheelZoomTargets: Array<[HTMLElement, "canvas" | "markdown"]> = [
  [viewCanvas, "canvas"],
  [viewMarkdown, "markdown"],
];

for (const [element, target] of wheelZoomTargets) {
  element.addEventListener(
    "wheel",
    (event) => {
      if (activeView !== target) return;
      if (target === "markdown" && !event.ctrlKey && !event.metaKey) return;
      const factor = event.deltaY < 0 ? 1.06 : 1 / 1.06;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomScale * factor));
      if (next === zoomScale) return; // 已到倍率边界：不拦截，交回浏览器滚动
      event.preventDefault();
      zoomBy(factor);
    },
    { passive: false },
  );
}

// 双保险：某些平台对 SVG / foreignObject 内的 touch-action 应用不完整，
// 这里直接把两个画布视图上的触摸滚动拦掉，确保手势完整交给我们自己的逻辑。
for (const element of [viewXmind, viewCanvas]) {
  element.addEventListener(
    "touchmove",
    (event) => {
      if (event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
}

function isFullscreen(): boolean {
  return previewPane.classList.contains("fullscreen");
}

function toggleFullscreen(): void {
  const next = !isFullscreen();
  previewPane.classList.toggle("fullscreen", next);
  document.body.classList.toggle("locked", next);
  fullscreenToggle.textContent = next ? "⤡" : "⛶";
  fullscreenToggle.title = next ? "退出全屏（Esc）" : "全屏";
  window.requestAnimationFrame(() => {
    refreshActiveView();
    syncEmptyState();
  });
}

fullscreenToggle.addEventListener("click", toggleFullscreen);

function decodeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent ?? "";
}

function findLineIndex(node: unknown): number {
  const payload = (node as { payload?: { lines?: string } }).payload;
  const lines = payload?.lines;
  if (!lines) return -1;
  const start = Number.parseInt(lines.split(",")[0], 10);
  return Number.isNaN(start) ? -1 : start;
}





svg.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a")) return;
  // 触摸拖动结束时浏览器仍可能补一个 click：拖出距离就当手势，不跳行、不折叠节点
  if (markmapDragDistance > 6) {
    markmapDragDistance = 0;
    return;
  }
  const element = event.target instanceof Element ? findNodeElement(event.target) : null;
  if (!element) return;
  const node = nodeFromElement(element);
  if (!node) return;
  event.preventDefault();
  event.stopPropagation();
  const lineIndex = findLineIndex(node);
  if (lineIndex < 0) return;
  if (!isFullscreen()) revealLine(lineIndex);
}, true);


// Escape 已由上面的统一 handler 处理（弹层 → 菜单 → 全屏），这里不再重复监听

syncZoomTools();

function findNodeElement(target: Element): Element | null {
  let element: Element | null = target;
  while (element && element !== svg) {
    const datum = (element as unknown as { __data__?: unknown }).__data__;
    if (datum && typeof datum === "object" && ("payload" in datum || "data" in datum)) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function nodeFromElement(element: Element): unknown {
  const datum = (element as unknown as { __data__?: unknown }).__data__;
  if (!datum || typeof datum !== "object") return undefined;
  if ("payload" in datum) return datum;
  if ("data" in datum) return (datum as { data?: unknown }).data;
  return undefined;
}

function measureLineOffset(markdown: string, lineIndex: number): number {
  const style = window.getComputedStyle(input);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = input.clientWidth + "px";
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.padding = style.padding;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.boxSizing = "border-box";
  const head = markdown.split("\n").slice(0, lineIndex);
  mirror.textContent = head.length > 0 ? head.join("\n") + "\n" : "";
  document.body.appendChild(mirror);
  const offset = mirror.getBoundingClientRect().height;
  document.body.removeChild(mirror);
  return offset;
}

function revealLine(lineIndex: number): void {
  const lines = input.value.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return;

  let start = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    start += lines[index].length + 1;
  }
  const end = start + lines[lineIndex].length;

  if (isCompactLayout() && workspace.dataset.mode !== "editor") {
    setMobileMode("editor");
  }
  input.focus({ preventScroll: true });
  input.setSelectionRange(start, end);

  const offset = measureLineOffset(input.value, lineIndex);
  input.scrollTop = Math.max(0, offset - input.clientHeight / 2);
}


/** 窄屏「编辑」模式下预览容器是 display:none，宽度为 0，此时任何测量都没有意义 */
function markdownViewportReady(): boolean {
  return markdownPreview.clientWidth >= 8;
}

function renderMarkdown(options: { instant?: boolean } = {}): void {
  if (!markdownViewportReady()) {
    markdownDirty = true; // 容器不可见：等预览重新出现时按真实宽度重排
    return;
  }
  markdownDirty = false;
  const env: Record<string, unknown> = {};
  const tokens = md.parse(input.value, env);
  for (const token of tokens) {
    if (!token.map) continue;
    const isBlock =
      token.nesting === 1 ||
      token.type === "fence" ||
      token.type === "code_block" ||
      token.type === "hr" ||
      token.type === "front_matter" ||
      token.type === "math_block";
    if (isBlock) token.attrSet("data-line", String(token.map[0]));
  }
  markdownPreview.innerHTML = md.renderer.render(tokens, md.options, env);
  buildPages();
  // 图表围栏（mermaid / markmap / chart）在分页完成后再渲染，此时占位块已就位
  void renderDiagrams(markdownPreview, options);
}

/**
 * 截图前的「可测量化」。
 *
 * 紧凑布局的「编辑」栏会把预览区设成 display:none，里面一切尺寸都是 0 ——
 * `renderMarkdown()` 会直接放弃排版，`html2canvas` 也只量到空画布，
 * `toBlob` 返回 null，对外就是那句「PNG 编码失败」。
 * 导出期间把预览区临时挪到屏幕外并给足宽高，结束后原样恢复。
 */
function preparePreviewForCapture(): () => void {
  if (previewPane.clientWidth >= 8) return () => {};
  previewPane.classList.add("export-measure");
  return () => previewPane.classList.remove("export-measure");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

async function renderMindMapImage(ir: MindMapIR) {
  const savedZoom = zoomScale;
  zoomScale = 1;
  await renderCanvas(ir);
  const result = {
    blob: await canvasToBlob(),
    width: canvas.width / SCALE,
    height: canvas.height / SCALE,
  };
  zoomScale = savedZoom;
  if (savedZoom !== 1) await renderCanvas(ir);
  return result;
}

async function renderMarkdownImage() {
  // 编辑栏下预览区不可见，先给它一个可测量的形态（否则会得到空图 / 编码失败）
  const restorePane = preparePreviewForCapture();
  try {
    // instant：关掉图表入场动画，避免截图抓到柱子长到一半的瞬间
    renderMarkdown({ instant: true });
    // 等 mermaid / markmap / chart 都画完再截图，否则导出图里是空的占位块
    await renderDiagrams(markdownPreview, { instant: true });
    markdownPreview.classList.add("exporting");
    // 导出固定按 1:1 渲染，产物与设备、窗口大小无关
    const savedScale = suspendLayoutScale();
    try {
      const rendered = await html2canvas(markdownPreview, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const blob = await new Promise<Blob>((resolve, reject) => {
        rendered.toBlob((value) =>
          value ? resolve(value) : reject(new Error("PNG 编码失败")), "image/png");
      });
      return { blob, width: rendered.width / 2, height: rendered.height / 2 };
    } finally {
      markdownPreview.classList.remove("exporting");
      restoreLayoutScale(savedScale);
    }
  } finally {
    restorePane();
  }
}

/* ---- PDF 导出 ---- */
const PDF_SCALE = 2; // html2canvas 渲染倍率
const PDF_PAGE_RATIO = Math.SQRT2; // A4 高宽比

/* ---- 分页预览（纸张式）：每页一张可调高的纸，拖动页边界即改变该页容量 ---- */
const PAGE_INSET = 20; // 卡片上下内边距（与 style.css 里 .page-card 的纵向 padding 保持一致）
const PAGE_MIN_RATIO = 0.3;
const PAGE_MAX_RATIO = 3;

/** 用户逐页调整过的容量（内容区高度），索引对应页序号；缺失则用默认容量 */
let pageCapacities: number[] = [];

interface MeasuredBlock extends PageBlock {
  element: HTMLElement;
  top: number;
  bottom: number;
}

/** 把块从页卡片里搬回内容流（恢复平铺），便于重新测量 */
function resetPageCards(): void {
  const cards = Array.from(markdownPreview.querySelectorAll<HTMLElement>(".page-card"));
  for (const card of cards) {
    const body = card.querySelector<HTMLElement>(".page-body");
    if (body) {
      for (const child of Array.from(body.children) as HTMLElement[]) {
        markdownPreview.insertBefore(child, card);
      }
    }
    card.remove();
  }
  markdownPreview.classList.remove("paged");
}

/** 平铺状态下测量每个块的占位高度（含与下一块之间的间距） */
function measureBlocks(): MeasuredBlock[] {
  const containerTop = markdownPreview.getBoundingClientRect().top;
  const children = Array.from(markdownPreview.children) as HTMLElement[];
  const measured: MeasuredBlock[] = [];
  children.forEach((element, index) => {
    if (element.classList.contains("page-nav")) return;
    const rect = element.getBoundingClientRect();
    const next = children[index + 1];
    const nextTop =
      next && !next.classList.contains("page-nav")
        ? next.getBoundingClientRect().top - containerTop
        : null;
    const top = rect.top - containerTop;
    const bottom = rect.bottom - containerTop;
    const height = nextTop !== null && nextTop > top ? nextTop - top : bottom - top;
    const marker =
      element.getAttribute("data-line") ??
      element.querySelector("[data-line]")?.getAttribute("data-line") ??
      null;
    const line = marker === null ? -1 : Number.parseInt(marker, 10);
    measured.push({
      element,
      top,
      bottom,
      height: Math.max(1, height),
      tag: element.tagName.toLowerCase(),
      line: Number.isNaN(line) ? -1 : line,
    });
  });
  return measured;
}

/** 纸张尺寸与默认容量：固定 A4 比例，与视口无关（桌面端、移动端、导出 PDF 共用同一份数值） */
function pageMetricsFor() {
  const pageWidth = PAGE_WIDTH;
  const pageHeight = Math.round(pageWidth * PDF_PAGE_RATIO);
  return {
    width: pageWidth,
    height: pageHeight,
    // 留几像素余量，避免最后一行贴着纸张边缘被裁切
    capacity: Math.max(80, pageHeight - PAGE_INSET * 2 - 6),
  };
}

const pageMetricsInfo = pageMetricsFor();

/** 页面导航里显示的摘要：优先取该页第一个标题 */
function pageSummary(blocks: MeasuredBlock[], slice: PageSlice): string {
  const sliceBlocks = blocks.slice(slice.start, slice.end);
  const picked = sliceBlocks.find((block) => /^h[1-6]$/.test(block.tag)) ?? sliceBlocks[0];
  if (!picked) return "";
  const text = (picked.element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text.slice(0, 16) : picked.tag.toUpperCase();
}

/* ---- 分页状态：缓存测量结果与卡片，拖动时做增量重绘 ---- */
interface PageLayout {
  blocks: MeasuredBlock[];
  slices: PageSlice[];
  cards: HTMLElement[];
}

let pageLayout: PageLayout | null = null;

function currentSlices(): PageSlice[] {
  return pageLayout?.slices ?? [];
}

/** 只算分配、不碰 DOM */
function planSlices(blocks: MeasuredBlock[]): PageSlice[] {
  return paginate(blocks, {
    defaultCapacity: pageMetricsInfo.capacity,
    capacities: pageCapacities,
    minRatio: PAGE_MIN_RATIO,
    maxRatio: PAGE_MAX_RATIO,
  });
}

function createPageCard(index: number): HTMLElement {
  const card = document.createElement("section");
  card.className = "page-card";

  const body = document.createElement("div");
  body.className = "page-body";

  const footer = document.createElement("div");
  footer.className = "page-footer";

  const handle = document.createElement("div");
  handle.className = "page-resize";
  handle.dataset.pageResize = String(index);
  handle.title =
    "上下拖动调整这一页的高度（0.3～3 倍）；按住 Shift 拖动可暂停边缘自动滚动；双击恢复默认";

  card.appendChild(body);
  card.appendChild(footer);
  card.appendChild(handle);
  return card;
}

function cardParts(card: HTMLElement): {
  body: HTMLElement;
  footer: HTMLElement;
  handle: HTMLElement;
} {
  return {
    body: card.querySelector(".page-body") as HTMLElement,
    footer: card.querySelector(".page-footer") as HTMLElement,
    handle: card.querySelector(".page-resize") as HTMLElement,
  };
}

/**
 * 把分配结果画到卡片上。
 * 复用已有卡片、只改高度并移动必要的内容块，因此拖动时能逐帧连续跟随，
 * 同时保留滚动位置——滚动条长度会随内容总高度实时变化。
 */
function paintPages(slices: PageSlice[]): void {
  const blocks = pageLayout?.blocks ?? [];
  const cards = pageLayout?.cards ?? [];
  const previousScroll = viewMarkdown.scrollTop;

  while (cards.length < slices.length) {
    const card = createPageCard(cards.length);
    markdownPreview.appendChild(card);
    cards.push(card);
  }
  while (cards.length > slices.length) {
    cards.pop()?.remove();
  }

  const summaries: string[] = [];
  slices.forEach((slice, index) => {
    const card = cards[index];
    const { body, footer, handle } = cardParts(card);
    card.dataset.page = String(index + 1);
    card.style.height = Math.round(slice.capacity + PAGE_INSET * 2) + "px";
    footer.textContent = "第 " + (index + 1) + " / " + slices.length + " 页";
    handle.dataset.pageResize = String(index);

    const desired = blocks.slice(slice.start, slice.end).map((block) => block.element);
    const current = Array.from(body.children) as HTMLElement[];
    const sameOrder =
      current.length === desired.length && current.every((element, i) => element === desired[i]);
    if (!sameOrder) {
      // 依次 append 即可得到目标顺序（已在 body 内的元素会被移到末尾）
      for (const element of desired) body.appendChild(element);
    }
    summaries.push(pageSummary(blocks, slice));
  });

  pageLayout = { blocks, slices, cards };
  viewMarkdown.scrollTop = previousScroll;
  updatePageCount(slices.length);
  // 用预览区宽度判断：纸张宽度是固定的，不能代表实际可用空间
  renderPageNav(summaries, viewMarkdown.clientWidth);
  syncActivePage();
}

/**
 * 分页预览只在「Markdown 预览 + PDF」下出现：PNG 导出的是整篇一张连续图，
 * 编辑区就没必要把它切成一张张纸，直接连着排反而所见即所得。
 */
function pagedPreview(): boolean {
  return activeView === "markdown" && (formatSelect.value as ExportFormat) === "pdf";
}

/** 完整重建：重新测量内容并分页（内容变化后调用）；连续模式下则撤掉分页 */
function buildPages(): void {
  // 纸张可能正被整体缩小，而测量必须拿到 1:1 的版式尺寸
  const savedScale = suspendLayoutScale();
  try {
    resetPageCards();
    pageLayout = null;

    // 连续模式：不留分页卡片，也收起页数、页面导航与底部分页条
    if (!pagedPreview()) {
      updatePageCount(0);
      renderPageNav([], 0);
      return;
    }

    const blocks = measureBlocks();
    if (blocks.length === 0) {
      pageCapacities = [];
      updatePageCount(0);
      renderPageNav([], 0);
      return;
    }

    markdownPreview.classList.add("paged");
    const slices = planSlices(blocks);
    pageLayout = { blocks, slices: [], cards: [] };
    paintPages(slices);
    // 页数变少后，超出的自定义高度要一并丢掉，否则内容再多回来时会带上过时的高度。
    // 这里只裁剪不重置：逐字输入也会走这里，整体重置会把用户拖出来的页高全清掉。
    if (pageCapacities.length > slices.length) pageCapacities.length = slices.length;
  } finally {
    restoreLayoutScale(savedScale);
  }
}

/**
 * 预览区重新可见或可用宽度变化后恢复 Markdown 视图。
 * 纸张宽度固定（分页与连续都是同一张纸的宽度），所以可用宽度变化只影响适配比例；
 * 只有「内容变了 / 上次不可见时没能排」才需要重排一次。
 */
function refreshMarkdownLayout(): void {
  if (!markdownViewportReady()) {
    markdownDirty = true;
    return;
  }
  applyMarkdownZoom();
  if (!markdownDirty) return;
  renderMarkdown();
}

function repaintNow(): void {
  if (!pageLayout) {
    buildPages();
    return;
  }
  paintPages(planSlices(pageLayout.blocks));
}

/* ---- 拖动页边界：实时改变该页容量，正文随之重排 ---- */
let resizeState: {
  pageIndex: number;
  startY: number;
  startHeight: number;
  startScroll: number;
  pointerId: number;
  clientY: number;
  precise: boolean;
} | null = null;
let repaintQueued = false;

/** 拖动过程中按帧重绘：不重新测量内容，正文连续跟随，滚动位置保持 */
function scheduleRepaint(): void {
  if (repaintQueued) return;
  repaintQueued = true;
  window.requestAnimationFrame(() => {
    repaintQueued = false;
    repaintNow();
  });
}

markdownPreview.addEventListener("pointerdown", (event) => {
  const handle = (event.target as Element | null)?.closest<HTMLElement>("[data-page-resize]");
  if (!handle) return;
  const pageIndex = Number.parseInt(handle.dataset.pageResize ?? "", 10);
  const card = handle.closest<HTMLElement>(".page-card");
  if (Number.isNaN(pageIndex) || !card) return;
  event.preventDefault();
  event.stopPropagation();
  if (!pageLayout) buildPages();
  resizeState = {
    pageIndex,
    startY: event.clientY,
    // 纸张可能被整体缩小，量到的屏幕高度要折回版式高度
    startHeight: card.getBoundingClientRect().height / appliedScale(),
    startScroll: viewMarkdown.scrollTop,
    clientY: event.clientY,
    precise: event.shiftKey,
    pointerId: event.pointerId,
  };
  edgeSince = 0;
  card.classList.add("resizing");
  window.requestAnimationFrame(resizeLoop);
});

function finishResize(event: PointerEvent): void {
  if (!resizeState || event.pointerId !== resizeState.pointerId) return;
  resizeState = null;
  edgeSince = 0;
  markdownPreview
    .querySelectorAll(".page-card.resizing")
    .forEach((card) => card.classList.remove("resizing"));
  reportPages();
}

/** 把指针位置换算成这一页的目标高度；页面滚动量要补偿进来，把手才始终贴手 */
function applyResizeFromPointer(clientY: number): void {
  if (!resizeState) return;
  // 纸张被缩小（CSS zoom）时，屏幕位移要折算回版式坐标才跟手
  const scale = appliedScale();
  const scrollDelta = viewMarkdown.scrollTop - resizeState.startScroll;
  const delta = (clientY - resizeState.startY) / scale + scrollDelta;
  const target = resizeState.startHeight + delta - PAGE_INSET * 2;
  pageCapacities[resizeState.pageIndex] = clampCapacity(
    target,
    pageMetricsInfo.capacity,
    PAGE_MIN_RATIO,
    PAGE_MAX_RATIO,
  );
}

const AUTO_SCROLL_EDGE = 56; // 指针进入视口上下这段距离才考虑自动滚动
const AUTO_SCROLL_DELAY = 180; // 在边缘停留这么久才开始滚动，避免掠过就滚
const AUTO_SCROLL_MIN_STEP = 2; // 刚进边缘时的每帧滚动量（慢，方便微调）
const AUTO_SCROLL_MAX_STEP = 12; // 贴住边缘时的每帧滚动量
const SCROLL_EPSILON = 0.5; // 判断是否已经滚到头的容差

let edgeSince = 0; // 指针进入边缘区的时刻，0 表示当前不在边缘

/**
 * 指针拖到视口上下边缘时自动滚动预览区（滚动条随之移动）。
 * 三条刹车：需要停留一小会儿才启动、越贴边越快、已经滚到头就彻底停手
 * ——这样在文章底部仍然能稳稳地拖出想要的页尾留白。
 */
function autoScrollStep(): boolean {
  if (!resizeState) return false;
  // 按住 Shift 拖动：临时关掉自动滚动，纯粹按指针位移微调
  if (resizeState.precise) {
    edgeSince = 0;
    return false;
  }
  const rect = viewMarkdown.getBoundingClientRect();
  const { clientY } = resizeState;

  let depth = 0;
  let direction = 0;
  if (clientY > rect.bottom - AUTO_SCROLL_EDGE) {
    depth = clientY - (rect.bottom - AUTO_SCROLL_EDGE);
    direction = 1;
  } else if (clientY < rect.top + AUTO_SCROLL_EDGE) {
    depth = rect.top + AUTO_SCROLL_EDGE - clientY;
    direction = -1;
  }
  if (direction === 0) {
    edgeSince = 0;
    return false;
  }

  const now = performance.now();
  if (edgeSince === 0) {
    edgeSince = now;
    return false;
  }
  if (now - edgeSince < AUTO_SCROLL_DELAY) return false;

  // 到底 / 到顶就没有滚动余地了，再滚只会让页高乱跑
  const before = viewMarkdown.scrollTop;
  const maxScroll = viewMarkdown.scrollHeight - viewMarkdown.clientHeight;
  if (direction > 0 && before >= maxScroll - SCROLL_EPSILON) return false;
  if (direction < 0 && before <= SCROLL_EPSILON) return false;

  const ratio = Math.min(1, depth / AUTO_SCROLL_EDGE);
  const step =
    AUTO_SCROLL_MIN_STEP + (AUTO_SCROLL_MAX_STEP - AUTO_SCROLL_MIN_STEP) * ratio;
  viewMarkdown.scrollTop = before + direction * step;
  return viewMarkdown.scrollTop !== before;
}

/** 拖动期间持续运行：负责边缘自动滚动，滚动后重新换算页高并重绘 */
function resizeLoop(): void {
  if (!resizeState) return;
  if (autoScrollStep()) {
    applyResizeFromPointer(resizeState.clientY);
    scheduleRepaint();
  }
  window.requestAnimationFrame(resizeLoop);
}

window.addEventListener("pointermove", (event) => {
  if (!resizeState || event.pointerId !== resizeState.pointerId) return;
  event.preventDefault();
  resizeState.clientY = event.clientY;
  resizeState.precise = event.shiftKey;
  applyResizeFromPointer(event.clientY);
  scheduleRepaint();
});

window.addEventListener("pointerup", finishResize);
window.addEventListener("pointercancel", finishResize);

// 双击页底把手：把这一页恢复成默认高度
markdownPreview.addEventListener("dblclick", (event) => {
  const handle = (event.target as Element | null)?.closest<HTMLElement>("[data-page-resize]");
  if (!handle) return;
  const pageIndex = Number.parseInt(handle.dataset.pageResize ?? "", 10);
  if (Number.isNaN(pageIndex)) return;
  event.preventDefault();
  event.stopPropagation();
  pageCapacities[pageIndex] = Number.NaN; // NaN 会被 clampCapacity 视为"未设置"
  buildPages();
  reportPages();
});

function reportPages(): void {
  const cards = markdownPreview.querySelectorAll(".page-card").length;
  const adjusted = pageCapacities.filter((value) => Number.isFinite(value)).length;
  setStatus(
    "共 " + cards + " 页 · " + (adjusted > 0 ? "含 " + adjusted + " 页自定义高度" : "自动分页"),
    "ok",
  );
}

function updatePageCount(count: number): void {
  pageCount.hidden = activeView !== "markdown" || count <= 0;
  pageCount.textContent = count > 0 ? "共 " + count + " 页" : "";
}

/* ---- 右侧页面导航：跳页、插入分页、删除分页、折叠 ---- */
const NAV_COLLAPSE_KEY = "md2xmind:nav-collapsed";

function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

let navCollapsed = readNavCollapsed();

function applyNavCollapsed(): void {
  pageNav.classList.toggle("collapsed", navCollapsed);
  pageNavToggle.textContent = navCollapsed ? "‹" : "›";
  const label = navCollapsed ? "展开页面导航" : "折叠页面导航";
  pageNavToggle.title = label;
  pageNavToggle.setAttribute("aria-label", label);
}

pageNavToggle.addEventListener("click", () => {
  navCollapsed = !navCollapsed;
  try {
    window.localStorage.setItem(NAV_COLLAPSE_KEY, navCollapsed ? "1" : "0");
  } catch {
    // 隐私模式下写入失败可忽略
  }
  applyNavCollapsed();
});

applyNavCollapsed();

function renderPageNav(summaries: string[], width: number): void {
  pageNavList.innerHTML = "";
  pageDockList.innerHTML = "";
  const showSide = summaries.length > 1 && width >= 960 && activeView === "markdown";
  const showDock = summaries.length > 1 && activeView === "markdown" && !showSide;
  pageNav.hidden = !showSide;
  pageDock.hidden = !showDock;
  viewMarkdown.classList.toggle("has-dock", showDock);
  if (!showSide && !showDock) return;
  if (showSide) applyNavCollapsed();

  if (showSide) {
    summaries.forEach((summary, index) => {
      const slice = currentSlices()[index];
      const item = document.createElement("div");
      item.className = "page-nav-item";
      item.dataset.page = String(index + 1);

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "page-nav-jump";
      jump.title = "跳转到第 " + (index + 1) + " 页";
      const badge = document.createElement("span");
      badge.className = "page-nav-index";
      badge.textContent = String(index + 1);
      const label = document.createElement("span");
      label.className = "page-nav-title";
      label.textContent = summary;
      jump.appendChild(badge);
      jump.appendChild(label);
      jump.addEventListener("click", () => scrollToPage(index));

      const actions = document.createElement("span");
      actions.className = "page-nav-actions";

      const split = document.createElement("button");
      split.type = "button";
      split.className = "page-nav-action";
      split.textContent = "＋";
      split.disabled = !slice || slice.end - slice.start < 2;
      split.title = split.disabled ? "这一页只有一个内容块，无法再拆" : "在这一页中间插入分页";
      split.addEventListener("click", () => splitPage(index));

      const merge = document.createElement("button");
      merge.type = "button";
      merge.className = "page-nav-action";
      merge.textContent = "－";
      merge.disabled = index === 0;
      merge.title = index === 0 ? "第一页没有上一页可合并" : "删除这一页的分页（并入上一页）";
      merge.addEventListener("click", () => mergePage(index));

      actions.appendChild(split);
      actions.appendChild(merge);
      item.appendChild(jump);
      item.appendChild(actions);
      pageNavList.appendChild(item);
    });
  }

  if (showDock) {
    summaries.forEach((summary, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "page-dock-item";
      item.textContent = String(index + 1);
      item.title = "第 " + (index + 1) + " 页" + (summary ? " · " + summary : "");
      item.addEventListener("click", () => scrollToPage(index));
      pageDockList.appendChild(item);
    });
  }
}

/** 在这一页中间插入分页：拆成两页 */
function splitPage(index: number): void {
  const slice = currentSlices()[index];
  const blocks = pageLayout?.blocks ?? [];
  if (!slice || slice.end - slice.start < 2) return;
  const mid = slice.start + Math.floor((slice.end - slice.start) / 2);
  let used = 0;
  for (let i = slice.start; i < mid; i += 1) used += blocks[i].height;
  pageCapacities[index] = clampCapacity(
    used,
    pageMetricsInfo.capacity,
    PAGE_MIN_RATIO,
    PAGE_MAX_RATIO,
  );
  pageCapacities.splice(index + 1, 0, Number.NaN); // 新页沿用默认高度
  repaintNow();
  reportPages();
  showToast("已在第 " + (index + 1) + " 页中间插入分页", "ok");
}

/** 删除这一页的分页：内容并回上一页 */
function mergePage(index: number): void {
  const slices = currentSlices();
  const slice = slices[index];
  const previous = slices[index - 1];
  if (index <= 0 || !slice || !previous) return;
  const needed = previous.used + slice.used;
  // 并入后如果页尾没有留白（内容顶到页脚），补出一点呼吸空间；原本就宽松则保持原高度
  const breath = PAGE_INSET * 2;
  const target = previous.capacity >= needed + breath ? previous.capacity : needed + breath;
  pageCapacities[index - 1] = clampCapacity(
    target,
    pageMetricsInfo.capacity,
    PAGE_MIN_RATIO,
    PAGE_MAX_RATIO,
  );
  pageCapacities.splice(index, 1);
  repaintNow();
  reportPages();
  showToast(
    target > needed + breath ? "已并入上一页（保留原有页高）" : "已并入上一页，并在页尾留出空白",
    "ok",
  );
}

// 底部分页条的「＋ / －」：没有侧栏的窄屏上，分页的增删就靠这两个按钮
pageDockSplit.addEventListener("click", () => splitPage(activePageIndex));
pageDockMerge.addEventListener("click", () => mergePage(activePageIndex));

function scrollToPage(index: number): void {
  const card = markdownPreview.querySelectorAll<HTMLElement>(".page-card")[index];
  if (!card) return;
  const viewTop = viewMarkdown.getBoundingClientRect().top;
  // 纸张被整体缩小时，屏幕位移要折回版式坐标才能和 scrollTop 相加
  const offset =
    (card.getBoundingClientRect().top - viewTop) / appliedScale() + viewMarkdown.scrollTop;
  viewMarkdown.scrollTo({ top: Math.max(0, offset - 12), behavior: "smooth" });
  setActivePage(index);
}

function setActivePage(index: number): void {
  const changed = index !== activePageIndex;
  activePageIndex = index;
  pageNavList.querySelectorAll<HTMLElement>(".page-nav-item").forEach((item, i) => {
    item.classList.toggle("active", i === index);
  });
  pageDockList.querySelectorAll<HTMLElement>(".page-dock-item").forEach((item, i) => {
    item.classList.toggle("active", i === index);
  });
  syncDockActions();
  if (changed) revealDockItem(index);
}

/** 移动端分页条的「＋ / －」都作用于当前页，可用性随该页内容块数量实时更新 */
function syncDockActions(): void {
  const slice = currentSlices()[activePageIndex];
  pageDockSplit.disabled = !slice || slice.end - slice.start < 2;
  pageDockMerge.disabled = activePageIndex === 0;
}

/** 让当前页的页码滚进分页条可视范围（只横向滚动页码条，不惊动正文） */
function revealDockItem(index: number): void {
  if (pageDock.hidden) return;
  const item = pageDockList.children[index] as HTMLElement | undefined;
  if (!item) return;
  const target =
    item.offsetLeft - pageDockList.offsetLeft - (pageDockList.clientWidth - item.clientWidth) / 2;
  pageDockList.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
}

function syncActivePage(): void {
  const cards = Array.from(markdownPreview.querySelectorAll<HTMLElement>(".page-card"));
  if (cards.length === 0) return;
  const viewTop = viewMarkdown.scrollTop;
  const originTop = viewMarkdown.getBoundingClientRect().top;
  const scale = appliedScale();
  let active = 0;
  cards.forEach((card, index) => {
    const top = (card.getBoundingClientRect().top - originTop) / scale + viewTop;
    if (top - 48 <= viewTop) active = index;
  });
  setActivePage(active);
}

viewMarkdown.addEventListener("scroll", () => {
  if (activeView === "markdown") syncActivePage();
});

/** Markdown 预览 → 多页 PDF：逐页卡片渲染，与预览完全一致 */
async function exportMarkdownPdf(): Promise<{ blob: Blob; pageCount: number }> {
  renderMarkdown({ instant: true });
  // 图表是异步渲染的：等它们完成再逐页截图（instant：截图前不要入场动画）
  await renderDiagrams(markdownPreview, { instant: true });
  const cards = Array.from(markdownPreview.querySelectorAll<HTMLElement>(".page-card"));
  if (cards.length === 0) throw new Error("没有可导出的内容");

  markdownPreview.classList.add("exporting");
  // 逐页都在 1:1 下渲染，于是 PDF 的纸张尺寸与设备、窗口大小无关
  const savedScale = suspendLayoutScale();

  try {
    let pdf: jsPDF | null = null;
    for (const card of cards) {
      // 纸张尺寸取自固定值，高度取分页时写下的版式高度，避免受屏幕缩放影响
      const width = pageMetricsInfo.width;
      const height = Math.max(
        1,
        Math.round(Number.parseFloat(card.style.height) || pageMetricsInfo.height),
      );
      const orientation = width >= height ? "landscape" : "portrait";
      const rendered = await html2canvas(card, {
        scale: PDF_SCALE,
        backgroundColor: "#ffffff",
      });
      const dataUrl = rendered.toDataURL("image/png");
      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: "px", format: [width, height], compress: true });
      } else {
        pdf.addPage([width, height], orientation);
      }
      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
    }
    if (!pdf) throw new Error("没有可导出的内容");
    // 不走 pdf.save()：它自己造 <a> 下载，手机上的手势已过期、点了没反应；
    // 交出 blob，由 deliverFile 统一决定怎么落到用户设备上
    return { blob: pdf.output("blob"), pageCount: cards.length };
  } finally {
    markdownPreview.classList.remove("exporting");
    restoreLayoutScale(savedScale);
  }
}

/** 思维导图 → 单页 PDF：页面尺寸即图形尺寸，保证结构完整不割裂 */
async function exportImagePdf(
  image: { blob: Blob; width: number; height: number },
): Promise<Blob> {
  const dataUrl = await blobToDataUrl(image.blob);
  const pdf = new jsPDF({
    orientation: image.width >= image.height ? "landscape" : "portrait",
    unit: "px",
    format: [image.width, image.height],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, image.width, image.height);
  return pdf.output("blob");
}

// Markdown 高亮与导图高亮各用一个计时器：共用一个时，
// 两次触发会互相取消（高亮不消失，或导图不再重绘）
let flashTimer = 0;
let canvasFlashTimer = 0;

function flashElement(element: Element): void {
  element.classList.remove("flash");
  void (element as HTMLElement).offsetWidth;
  element.classList.add("flash");
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => element.classList.remove("flash"), 700);
}

function highlightCanvasNode(node: LayoutNode): void {
  const ctx = canvas.getContext("2d") as unknown as DrawContext;
  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 3;
  const pad = 4;
  ctx.beginPath();
  ctx.moveTo(node.x - pad, node.y - pad);
  ctx.lineTo(node.x + node.width + pad, node.y - pad);
  ctx.lineTo(node.x + node.width + pad, node.y + node.height + pad);
  ctx.lineTo(node.x - pad, node.y + node.height + pad);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  window.clearTimeout(canvasFlashTimer);
  canvasFlashTimer = window.setTimeout(() => {
    if (currentIR) void renderCanvas(currentIR);
  }, 700);
}

markdownPreview.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  if (target && target.closest("a")) return;
  const element = target ? target.closest("[data-line]") : null;
  if (!element) return;
  const line = Number.parseInt(element.getAttribute("data-line") ?? "", 10);
  if (Number.isNaN(line)) return;
  flashElement(element);
  if (!isFullscreen()) revealLine(line);
});

/* ---- 导图视图手势：与 XMind 预览一致（按住拖动平移、双指捏合缩放） ---- */
const canvasPointers = new Map<number, { x: number; y: number }>();
let canvasPanPointer: number | null = null;
let canvasPanStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
let canvasOffset = { x: 0, y: 0 };
let canvasDragDistance = 0;
let canvasPinchDistance = 0;

/** 平移用 transform（和 markmap 一样），不依赖滚动容器，因此没有滚动边界 */
function applyCanvasOffset(): void {
  canvas.style.transform =
    canvasOffset.x === 0 && canvasOffset.y === 0
      ? ""
      : "translate(" + canvasOffset.x + "px, " + canvasOffset.y + "px)";
}

function resetCanvasOffset(): void {
  canvasOffset = { x: 0, y: 0 };
  applyCanvasOffset();
}

function pointerDistance(): number {
  const points = Array.from(canvasPointers.values());
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  canvas.setPointerCapture(event.pointerId);

  if (canvasPointers.size === 1) {
    canvasPanPointer = event.pointerId;
    canvasDragDistance = 0;
    canvasPanStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX: canvasOffset.x,
      offsetY: canvasOffset.y,
    };
    canvas.classList.add("grabbing");
    return;
  }
  if (canvasPointers.size === 2) {
    canvasPanPointer = null;
    canvasPinchDistance = pointerDistance();
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!canvasPointers.has(event.pointerId)) return;
  canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (canvasPointers.size >= 2) {
    const distance = pointerDistance();
    if (canvasPinchDistance > 8 && distance > 8) {
      const ratio = distance / canvasPinchDistance;
      if (Math.abs(ratio - 1) > 0.008) {
        zoomBy(ratio);
        canvasPinchDistance = distance;
      }
    }
    return;
  }

  if (canvasPanPointer !== event.pointerId) return;
  const dx = event.clientX - canvasPanStart.x;
  const dy = event.clientY - canvasPanStart.y;
  canvasDragDistance = Math.max(canvasDragDistance, Math.hypot(dx, dy));
  canvasOffset = { x: canvasPanStart.offsetX + dx, y: canvasPanStart.offsetY + dy };
  applyCanvasOffset();
});

function endCanvasPointer(event: PointerEvent): void {
  canvasPointers.delete(event.pointerId);
  if (canvasPanPointer === event.pointerId) {
    canvasPanPointer = null;
    canvas.classList.remove("grabbing");
  }
  if (canvasPointers.size < 2) canvasPinchDistance = 0;
}

canvas.addEventListener("pointerup", endCanvasPointer);
canvas.addEventListener("pointercancel", endCanvasPointer);

canvas.addEventListener("click", (event) => {
  if (canvasDragDistance > 6) {
    canvasDragDistance = 0;
    return;
  }
  if (!canvasLayout) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const ratio = canvas.width / SCALE / zoomScale / rect.width;
  const x = (event.clientX - rect.left) * ratio;
  const y = (event.clientY - rect.top) * ratio;

  const hit = canvasLayout.nodes.find(
  (node: { x: number; width: any; y: number; height: any; }) =>
      x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height,
  );
  if (!hit) return;
  if (currentIR) renderCanvas(currentIR);
  highlightCanvasNode(hit);
  if (!isFullscreen() && hit.topic.line !== undefined) revealLine(hit.topic.line);
});

/* ---- 启动：所有 DOM 引用与监听都已就位后再渲染 ---- */
input.value = SAMPLE;
render();
refreshWhenSettled();
