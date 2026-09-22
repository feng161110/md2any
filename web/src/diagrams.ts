import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

/**
 * 图表渲染：把 md-extras 埋好的占位块（data-diagram）替换成真实图形。
 *
 * - Markmap：复用 XMind 预览已经在用的 markmap-lib / markmap-view，不新增成本；
 * - Mermaid / Chart.js：体积较大，走动态 import —— 文档里真的出现图表才加载对应库。
 *
 * 渲染失败不打断预览，占位块会转成一行错误提示。
 */

let mermaidReady = false;
let diagramSeq = 0;
// 在途的渲染任务：导出（PNG / PDF）要在捕获画面前等它们完成，否则图是空的
const inFlight = new Set<Promise<unknown>>();

export interface DiagramRenderOptions {
  /**
   * 关掉入场动画（导出时用）。
   *
   * Chart.js 默认把柱子/线从 0 长到最终高度，markmap 也有过渡 ——
   * 「创建完成」远早于「画到最终形态」，而截图是紧接着发生的，
   * 于是导出图里经常只剩半截柱子（设备越慢越明显）。
   */
  instant?: boolean;
}

/**
 * 渲染 root 里所有未渲染的图表占位块。
 * 返回的 Promise 会等「全部在途渲染」结束 —— 预览里可以 fire-and-forget，
 * 导出时 `await` 它，保证 mermaid / markmap / chart 都画完再截图。
 */
export function renderDiagrams(
  root: HTMLElement,
  options: DiagramRenderOptions = {},
): Promise<void> {
  const nodes = root.querySelectorAll<HTMLElement>("[data-diagram]");
  for (const node of Array.from(nodes)) {
    if (node.dataset.rendered === "1") continue;
    node.dataset.rendered = "1";
    const task = renderDiagram(
      node,
      node.dataset.diagram ?? "",
      node.dataset.code ?? "",
      options.instant === true,
    );
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  }
  // 等全部在途渲染结束；任务本身不 reject（renderDiagram 内部已捕获），补一个 void 收口
  return Promise.all([...inFlight]).then(() => undefined);
}

async function renderDiagram(
  node: HTMLElement,
  kind: string,
  code: string,
  instant: boolean,
): Promise<void> {
  try {
    if (kind === "markmap") await renderMarkmap(node, code, instant);
    else if (kind === "mermaid") await renderMermaid(node, code);
    else if (kind === "chart") await renderChart(node, code, instant);
  } catch (error) {
    node.classList.add("md-diagram-error");
    node.textContent = "图表渲染失败：" + (error instanceof Error ? error.message : String(error));
  }
}

async function renderMarkmap(node: HTMLElement, code: string, instant: boolean): Promise<void> {
  const transformer = new Transformer();
  const { root } = transformer.transform(code);
  node.innerHTML = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Markmap 导图");
  node.appendChild(svg);
  // duration: 0 → 不做过渡，数据一到位就是最终形态
  const view = Markmap.create(svg, instant ? { autoFit: true, duration: 0 } : { autoFit: true });
  await view.setData(root);
}

async function renderMermaid(node: HTMLElement, code: string): Promise<void> {
  const mermaid = (await import("mermaid")).default;
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false });
    mermaidReady = true;
  }
  const id = "md-mmd-" + (diagramSeq += 1);
  const { svg, bindFunctions } = await mermaid.render(id, code);
  node.innerHTML = svg;
  bindFunctions?.(node);
}

async function renderChart(node: HTMLElement, code: string, instant: boolean): Promise<void> {
  const Chart = (await import("chart.js/auto")).default;

  let config: unknown;
  try {
    config = JSON.parse(code);
  } catch {
    throw new Error("配置不是合法的 JSON");
  }
  if (!config || typeof config !== "object") throw new Error("Chart.js 需要 JSON 对象配置");

  const cfg = config as { options?: Record<string, unknown> };
  if (!cfg.options) cfg.options = {};
  // 默认铺满占位块；配置里显式给了 maintainAspectRatio 就尊重它
  if (cfg.options.maintainAspectRatio === undefined) cfg.options.maintainAspectRatio = false;
  // 导出时关掉入场动画：`new Chart()` 只是创建实例，柱子还在从 0 长高，截图会抓到中途
  if (instant) cfg.options.animation = false;

  node.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Chart.js 图表");
  node.appendChild(canvas);
  new Chart(canvas, config as never);
}
