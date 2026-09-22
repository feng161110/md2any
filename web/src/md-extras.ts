import MarkdownIt from "markdown-it";
import yaml from "js-yaml";
import mathjax3 from "markdown-it-mathjax3";
import { tex2svgHtml } from "mathxyjax3";

/**
 * 预览端的 markdown-it 扩展。
 *
 * markdown-it 自带 CommonMark 与表格 / 删除线 / 自动链接，但**任务列表、Front-matter、
 * 脚注、标记、上下标**都不在内置范围内；这里用一组自包含的小插件补齐。
 * 公式（`$…$` / `$$…$$`）交给 markdown-it-mathjax3，由 MathJax 输出真实 SVG 排版。
 * 因此可以直接在单测里跑（见 test/web-md.spec.ts）。
 *
 * 下面的 state / token 结构只声明真正用到的字段：markdown-it 的内部 state 类型没有随包导出，
 * 本地声明既够用又不必跟着上游类型路径走；签名对不上的地方统一用 `as never` 收口。
 */

interface MdToken {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  markup: string;
  children: MdToken[] | null;
  map: [number, number] | null;
  meta: Record<string, unknown> | null;
  attrSet(name: string, value: string): void;
  attrGet(name: string): string | null;
  attrJoin(name: string, value: string): void;
}

/** markdown-it 的默认导出只是构造器值，实例类型从这里取 */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

interface Footnotes {
  /** 定义内容：label → 正文 */
  defs: Map<string, string>;
  /** 引用顺序，决定编号 */
  order: string[];
}

interface MdEnv {
  footnotes?: Footnotes;
  /** markdown-it 的 env 是开放对象，声明成索引签名才能直接传给它 */
  [key: string]: unknown;
  [key: symbol]: unknown;
}

interface BlockState {
  src: string;
  line: number;
  lineMax: number;
  blkIndent: number;
  sCount: number[];
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  md: MarkdownItInstance;
  env: MdEnv;
  isEmpty(line: number): boolean;
  push(type: string, tag: string, nesting: number): MdToken;
}

interface InlineState {
  src: string;
  pos: number;
  md: MarkdownItInstance;
  env: MdEnv;
  tokens: MdToken[];
  push(type: string, tag: string, nesting: number): MdToken;
}

interface CoreState {
  tokens: MdToken[];
  md: MarkdownItInstance;
  env: MdEnv;
  Token: new (type: string, tag: string, nesting: number) => MdToken;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 取第 line 行的内容（去掉缩进，与 markdown-it 内部规则同样的取法） */
function lineAt(state: BlockState, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

/* ------------------------------------------------------------------ *
 * Front-matter
 * ------------------------------------------------------------------ */

/**
 * 文首的 `---` 块：核心库把它当全局配置，预览里也让它单独成块展示，
 * 否则会被当成一条分割线加一段 YAML 正文。
 */
function frontMatterRule(state: BlockState): boolean {
  const start = state.line;
  if (start !== 0 || state.blkIndent !== 0) return false;
  if (lineAt(state, start).trim() !== "---") return false;

  let end = start + 1;
  while (end < state.lineMax && lineAt(state, end).trim() !== "---") end += 1;
  if (end >= state.lineMax) return false; // 没有收尾分隔线：当普通内容处理

  const body: string[] = [];
  for (let line = start + 1; line < end; line += 1) body.push(lineAt(state, line));

  state.line = end + 1;
  const token = state.push("front_matter", "div", 0);
  token.content = body.join("\n");
  token.map = [start, end + 1];
  return true;
}

/** 把 YAML 渲染成「键 — 值」列表；解析不了就原样展示 */
function frontMatterHtml(raw: string): string {
  let data: unknown;
  try {
    data = yaml.load(raw);
  } catch {
    data = undefined;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const rows = Object.entries(data as Record<string, unknown>).map(([key, value]) => {
      const text = typeof value === "string" ? value : String(JSON.stringify(value));
      return (
        '<div class="md-frontmatter-row">' +
        '<span class="md-frontmatter-key">' + escapeHtml(key) + "</span>" +
        '<span class="md-frontmatter-value">' + escapeHtml(text) + "</span>" +
        "</div>"
      );
    });
    if (rows.length > 0) return rows.join("");
  }
  return '<pre class="md-frontmatter-raw">' + escapeHtml(raw) + "</pre>";
}

/* ------------------------------------------------------------------ *
 * 任务列表
 * ------------------------------------------------------------------ */

/** `- [x] 待办`：方括号里是空格或 x，且后面跟空白或行尾 */
const TASK_MARKER = /^\[([ xX])\](?=\s|$)[ \t]*/;

function taskListRule(state: CoreState): void {
  const tokens = state.tokens;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "inline") continue;
    if (tokens[index - 1].type !== "paragraph_open") continue;
    const item = tokens[index - 2];
    if (item.type !== "list_item_open") continue;

    const match = TASK_MARKER.exec(token.content);
    if (!match) continue;
    const children = token.children ?? [];
    const first = children[0];
    if (!first || first.type !== "text" || !first.content.startsWith(match[0])) continue;

    const checked = match[1].toLowerCase() === "x";
    first.content = first.content.slice(match[0].length);
    token.content = token.content.slice(match[0].length);

    const box = new state.Token("html_inline", "", 0);
    box.content =
      '<input class="md-task" type="checkbox" disabled' +
      (checked ? " checked" : "") +
      ' aria-label="' + (checked ? "已完成" : "未完成") + '">';
    token.children = [box, ...children];
    item.attrJoin("class", "md-task-item");
  }
}

/* ------------------------------------------------------------------ *
 * 脚注
 * ------------------------------------------------------------------ */

function ensureFootnotes(env: MdEnv): Footnotes {
  if (!env.footnotes) env.footnotes = { defs: new Map(), order: [] };
  return env.footnotes;
}

/** `[^label]: 内容` 定义成脚注，支持缩进续行 */
function footnoteDefRule(state: BlockState): boolean {
  const start = state.line;
  const match = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(lineAt(state, start));
  if (!match) return false;

  const parts: string[] = [];
  if (match[2].trim().length > 0) parts.push(match[2].trim());

  let line = start + 1;
  while (line < state.lineMax && !state.isEmpty(line)) {
    if (state.sCount[line] - state.blkIndent < 2) break;
    parts.push(lineAt(state, line).trim());
    line += 1;
  }

  ensureFootnotes(state.env).defs.set(match[1], parts.join(" "));
  state.line = line;
  return true;
}

/** 引用编号在解析阶段定下来，渲染时直接用 */
function footnoteRefRule(state: InlineState, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 0x5e /* ^ */) return false;
  const close = state.src.indexOf("]", state.pos + 2);
  if (close < 0) return false;

  const label = state.src.slice(state.pos + 2, close);
  if (label.length === 0 || /\s/.test(label)) return false;
  const store = state.env.footnotes;
  if (!store || !store.defs.has(label)) return false; // 没有定义：留给普通文本
  if (silent) return true;

  let order = store.order.indexOf(label);
  if (order < 0) {
    store.order.push(label);
    order = store.order.length - 1;
  }

  const token = state.push("footnote_ref", "", 0);
  token.meta = { label, index: order + 1 };
  state.pos = close + 1;
  return true;
}

function footnoteSlug(label: string): string {
  return label.replace(/[^0-9A-Za-z_-]/g, "-");
}

/** 文末补一节脚注列表，每条都带回正文的链接 */
function footnoteTailRule(state: CoreState): void {
  const store = state.env.footnotes;
  if (!store || store.order.length === 0) return;

  const items = store.order.map((label, index) => {
    const slug = footnoteSlug(label);
    const inline = new state.Token("inline", "", 0);
    inline.content = store.defs.get(label) ?? "";
    inline.children = [];
    state.md.inline.parse(inline.content, state.md, state.env, inline.children as never);
    const body = state.md.renderer.renderInline(
      inline.children as never,
      state.md.options,
      state.env,
    );
    return (
      '<li class="md-footnote" id="md-fn-' + slug + '">' +
      '<span class="md-footnote-index">' + (index + 1) + "</span>" +
      "<p>" + body +
      ' <a class="md-footnote-back" href="#md-fnref-' + slug +
      '" role="doc-backlink" aria-label="返回正文">↩</a></p></li>'
    );
  });

  const section = new state.Token("html_block", "", 0);
  section.content =
    '<section class="md-footnotes" role="doc-endnotes">' +
    '<h2 class="md-footnotes-title">脚注</h2>' +
    '<ol class="md-footnotes-list">' + items.join("") + "</ol></section>";
  state.tokens.push(section);
}

/* ------------------------------------------------------------------ *
 * 成对行内标记：==高亮== / ++插入++ / ~下标~ / ^上标^
 * ------------------------------------------------------------------ */

function inlinePairRule(name: string, marker: string, tag: string) {
  const length = marker.length;
  return (state: InlineState, silent: boolean): boolean => {
    const start = state.pos;
    if (!state.src.startsWith(marker, start)) return false;
    // `~~删除线~~` 归 strikethrough，别被下标抢走
    if (marker === "~" && state.src.startsWith("~~", start)) return false;

    const from = start + length;
    const close = state.src.indexOf(marker, from);
    if (close <= from) return false;
    const content = state.src.slice(from, close);
    if (content.includes("\n")) return false;
    if (/^\s/.test(content) || /\s$/.test(content)) return false;
    if (silent) return true;

    const open = state.push(name + "_open", tag, 1);
    open.markup = marker;
    const inner: MdToken[] = [];
    state.md.inline.parse(content, state.md, state.env, inner as never);
    for (const token of inner) state.tokens.push(token);
    state.push(name + "_close", tag, -1);
    state.pos = close + length;
    return true;
  };
}

/* ------------------------------------------------------------------ *
 * 图表围栏：mermaid / markmap / chart
 * ------------------------------------------------------------------ */

/** 围栏语言 → 图表类型 + 占位文案 */
const DIAGRAM_KINDS: Record<string, { kind: string; label: string }> = {
  mermaid: { kind: "mermaid", label: "Mermaid 图表" },
  markmap: { kind: "markmap", label: "Markmap 导图" },
  chart: { kind: "chart", label: "Chart.js 图表" },
  "chart.js": { kind: "chart", label: "Chart.js 图表" },
  chartjs: { kind: "chart", label: "Chart.js 图表" },
};

/**
 * 图表占位块：固定高度让分页能把它当普通块测量，真正的图形由 diagrams.ts 异步填入。
 * 源码放在 data-code 里（转义后），渲染时才交给对应库。
 */
function diagramPlaceholder(kind: string, label: string, code: string): string {
  return (
    '<div class="md-diagram md-diagram-' + kind + '" data-diagram="' + kind + '"' +
    ' data-code="' + escapeHtml(code) + '" style="height: 360px">' +
    '<span class="md-diagram-loading" aria-hidden="true">' + label + "</span>" +
    "</div>"
  );
}

/* ------------------------------------------------------------------ *
 * 公式：markdown-it-mathjax3 负责解析，渲染这里接管
 * ------------------------------------------------------------------ */

let mathStylesInjected = false;

/**
 * MathJax SVG 需要一套样式表（mjx-container 的布局、字形定位，以及把辅助
 * MathML mjx-assistive-mml 裁剪隐藏）。mathxyjax3 的 tex2svgHtml 把样式表内联在
 * 每次公式输出的 <style> 里，外层还包了一个 <span id="mjx-…">，并在其作用域里
 * 把 mjx-assistive-mml 设成 `clip:auto`（便于复制，视觉上靠透明色隐藏）。
 *
 * renderMath 会去掉那个 <span> 包装（display:contents 没有盒子，getBoundingClientRect
 * 全为 0，会让分页测量把公式块高度算成巨大值）。一旦 span 被去掉，`#mjx-…` 作用域
 * 选择器就失效了：MathJax 的布局样式与 assistive-mml 的裁剪隐藏规则全部不生效，
 * 辅助 MathML 露出来，公式显示两份。
 *
 * 这里改成：从 <style> 里只提取 MathJax 的 svgStylesheet 本体（跳过 `#mjx-…` 作用域
 * 与 `clip:auto` 覆盖），注入 <head> 一次，再输出干净的 mjx-container 块。
 */
function ensureMathStyles(css: string): void {
  if (mathStylesInjected) return;
  mathStylesInjected = true;
  // 这里不直接用 document / Document 类型：根 tsconfig（无 DOM lib）也会编译到本文件
  const g = globalThis as {
    document?: {
      createElement(tag: string): { id: string; textContent: string };
      head: { appendChild(child: unknown): void };
    };
  };
  if (!g.document) return; // 单测（Node）无 DOM
  const style = g.document.createElement("style");
  style.id = "mjx-styles";
  style.textContent = css;
  g.document.head.appendChild(style);
}

/**
 * tex2svgHtml 的 <style> 内容形如
 * `#mjx-<id>{ display:contents; mjx-assistive-mml{ clip:auto … } <svgStylesheet> }`。
 * 这里裁掉前面的 `#mjx-<id>` 作用域包装（含 `clip:auto` 的 assistive-mml 覆盖）与末尾
 * 的闭合 `}`，只返回 MathJax 的 svgStylesheet 本体——它自带 mjx-container 布局与
 * assistive-mml 的裁剪隐藏规则。
 */
function extractSvgStylesheet(wrapped: string): string {
  const start = wrapped.indexOf("mjx-container");
  if (start < 0) return wrapped;
  return wrapped.slice(start).replace(/\s*\}\s*$/, "").trim();
}

/** 排版公式并去掉 tex2svgHtml 的 <span>/<style> 包装，输出可测量的干净容器 */
function renderMath(tex: string, display: boolean): string {
  const html = tex2svgHtml(tex, { display });
  const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (styleMatch) ensureMathStyles(extractSvgStylesheet(styleMatch[1]));
  const close = html.indexOf("</style>");
  const body = close < 0 ? html : html.slice(close + "</style>".length);
  return body.replace(/<\/span>\s*$/, "").trim();
}

/* ------------------------------------------------------------------ *
 * 组装
 * ------------------------------------------------------------------ */

/** 围栏渲染规则的签名（沿用 markdown-it 的 RenderRule） */
type RenderFence = NonNullable<MarkdownItInstance["renderer"]["rules"]["fence"]>;

/** 围栏代码块右上角标出语言；图表语言则换成占位块，交给 diagrams.ts 渲染 */
function fenceWithExtras(md: MarkdownItInstance): void {
  const base: RenderFence =
    md.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const info = tokens[idx].info.trim().split(/\s+/)[0].toLowerCase();
    const diagram = DIAGRAM_KINDS[info];
    if (diagram) return diagramPlaceholder(diagram.kind, diagram.label, tokens[idx].content);

    const html = base(tokens, idx, options, env, self);
    if (!info) return html;
    return (
      '<div class="md-code-block">' +
      '<span class="md-code-lang" aria-hidden="true">' + escapeHtml(info) + "</span>" +
      html +
      "</div>"
    );
  };
}

/** 预览用的 markdown-it：内置语法 + 与核心库对齐的扩展 */
export function createPreviewMarkdown(): MarkdownItInstance {
  const md = new MarkdownIt({ html: true, linkify: true });

  md.block.ruler.before("hr", "front_matter", frontMatterRule as never, { alt: ["paragraph"] });
  md.block.ruler.before("reference", "footnote_def", footnoteDefRule as never, {
    alt: ["paragraph"],
  });

  // 公式：math_inline / math_block 解析规则由插件提供，渲染这里接管
  md.use(mathjax3);
  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) => {
    const line = tokens[idx].attrGet("data-line");
    const attr = line === null ? "" : ' data-line="' + line + '"';
    const html = renderMath(tokens[idx].content, true);
    return attr ? html.replace(/^<mjx-container/, `<mjx-container${attr}`) : html;
  };

  md.inline.ruler.before("link", "footnote_ref", footnoteRefRule as never);
  md.inline.ruler.before("emphasis", "mark", inlinePairRule("mark", "==", "mark") as never);
  md.inline.ruler.before("emphasis", "ins", inlinePairRule("ins", "++", "ins") as never);
  md.inline.ruler.before("emphasis", "sup", inlinePairRule("sup", "^", "sup") as never);
  md.inline.ruler.after("strikethrough", "sub", inlinePairRule("sub", "~", "sub") as never);

  md.core.ruler.after("inline", "task_lists", taskListRule as never);
  md.core.ruler.after("task_lists", "footnote_tail", footnoteTailRule as never);

  md.renderer.rules.front_matter = (tokens, idx) => {
    const line = tokens[idx].attrGet("data-line");
    const attr = line === null ? "" : ' data-line="' + line + '"';
    return (
      '<div class="md-frontmatter"' + attr + ">" +
      '<span class="md-frontmatter-title">Front-matter · 文档配置</span>' +
      frontMatterHtml(tokens[idx].content) +
      "</div>"
    );
  };

  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const meta = tokens[idx].meta as { label: string; index: number };
    const slug = footnoteSlug(meta.label);
    return (
      '<sup class="md-footnote-ref">' +
      '<a href="#md-fn-' + slug + '" id="md-fnref-' + slug + '" role="doc-noteref">' +
      meta.index +
      "</a></sup>"
    );
  };

  fenceWithExtras(md);
  return md;
}
