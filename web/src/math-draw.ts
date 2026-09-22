import type { MathPainter } from "@core/render/draw";
import { splitMathSegments } from "@core/render/mathText";
import { extractOuterSvg } from "@core/render/mathSvg";
import type { MindMapIR, TopicNode } from "@core/types";

/**
 * 导图画布的公式绘制器。
 *
 * 遍历 IR 收集所有公式片段，用 mathxyjax3（MathJax）同步排版成 SVG，
 * 转成 <img> 缓存起来；绘制时按 MathJax 给出的 ex 尺寸换算成像素，
 * 用 drawImage 画进节点行内。SVG 是矢量，任意缩放都清晰。
 * `$…$` 用行内排版，`$$…$$` 用块级（display）排版（积分上下限在符号上下方）。
 *
 * mathxyjax3 体积较大且含顶层 await，走动态 import：只有文档里真的出现公式才加载。
 */

const EX_RATIO = 0.5; // MathJax 的 ex 单位 ≈ 0.5em
const BASE_FONT = 32; // SVG 光栅化基准字号（仅决定 <img> 固有尺寸，绘制时按需缩放）

interface FormulaAsset {
  image: HTMLImageElement | null;
  widthEx: number;
  heightEx: number;
}

interface MathItem {
  tex: string;
  display: boolean;
}

const formulaCache = new Map<string, FormulaAsset>();
let mathjaxModule: Promise<typeof import("mathxyjax3")> | null = null;

function cacheKey(tex: string, display: boolean): string {
  return (display ? "D:" : "I:") + tex;
}

/** 收集 IR 中所有主题标题里的公式片段（去重，行内 / 块级分别保留） */
export function collectMathTexts(ir: MindMapIR): MathItem[] {
  const found: MathItem[] = [];
  const walk = (node: TopicNode): void => {
    for (const segment of splitMathSegments(node.title ?? "")) {
      if (segment.kind === "math") {
        found.push({ tex: segment.value, display: segment.display ?? false });
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const sheet of ir.sheets) walk(sheet.root);

  const seen = new Set<string>();
  return found.filter((item) => {
    const key = cacheKey(item.tex, item.display);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 为当前 IR 构建公式绘制器；文档不含公式时返回 undefined（画布行为与原先完全一致）。
 * 渲染失败的单条公式会退化为普通文本（去掉 $ 定界符）。
 */
export async function createMathPainter(ir: MindMapIR): Promise<MathPainter | undefined> {
  const list = collectMathTexts(ir);
  if (list.length === 0) return undefined;
  await Promise.all(list.map((item) => ensureFormula(item.tex, item.display)));

  return {
    width(tex, fontSize, display = false) {
      const asset = formulaCache.get(cacheKey(tex, display));
      if (!asset?.image) return tex.length * fontSize * 0.62;
      return asset.widthEx * EX_RATIO * fontSize + fontSize * 0.12;
    },
    paint(ctx, tex, x, centerY, fontSize, display = false) {
      const asset = formulaCache.get(cacheKey(tex, display));
      if (!asset?.image) {
        ctx.fillText(tex, x, centerY);
        return;
      }
      const width = asset.widthEx * EX_RATIO * fontSize + fontSize * 0.12;
      const height = asset.heightEx * EX_RATIO * fontSize;
      ctx.drawImage?.(asset.image, x + (fontSize * 0.12) / 2, centerY - height / 2, width, height);
    },
  };
}

async function ensureFormula(tex: string, display: boolean): Promise<void> {
  const key = cacheKey(tex, display);
  if (formulaCache.has(key)) return;
  try {
    if (!mathjaxModule) mathjaxModule = import("mathxyjax3");
    const { tex2svgHtml } = await mathjaxModule;

    const html = tex2svgHtml(tex, { display });
    // 必须取最外层 svg：可伸缩元素（vmatrix 竖线、xrightarrow 箭头）内部还嵌着 <svg>，
    // 用非贪婪正则会截断，残缺 SVG 会让 <img> 加载失败、公式退回原始 TeX。
    const outer = extractOuterSvg(html);
    if (!outer) throw new Error("公式 SVG 解析失败");
    const widthMatch = /width="([\d.]+)ex"/.exec(outer);
    const heightMatch = /height="([\d.]+)ex"/.exec(outer);
    if (!widthMatch || !heightMatch) throw new Error("公式 SVG 解析失败");

    const widthEx = Number(widthMatch[1]);
    const heightEx = Number(heightMatch[1]);
    let svg = outer;
    if (!svg.includes("xmlns=")) {
      svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    // <img> 加载 SVG 需要确定的像素尺寸；矢量内容在 drawImage 时仍按目标尺寸重采样
    const widthPx = Math.max(1, Math.round(widthEx * EX_RATIO * BASE_FONT));
    const heightPx = Math.max(1, Math.round(heightEx * EX_RATIO * BASE_FONT));
    svg = svg
      .replace(/\swidth="[^"]*"/, ` width="${widthPx}"`)
      .replace(/\sheight="[^"]*"/, ` height="${heightPx}"`);

    const image = await loadImage(
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
    );
    formulaCache.set(key, { image, widthEx, heightEx });
  } catch {
    formulaCache.set(key, { image: null, widthEx: 0, heightEx: 0 });
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("公式 SVG 加载失败"));
    image.src = src;
  });
}
