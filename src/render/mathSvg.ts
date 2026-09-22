/**
 * 从 MathJax（mathxyjax3 的 tex2svgHtml）输出里取出**最外层**的 `<svg>`。
 *
 * 不能用非贪婪正则 `/<svg[\s\S]*?<\/svg>/`：
 * MathJax 遇到可伸缩元素时会在内部再嵌一层 `<svg>`（例如 `\begin{vmatrix}` 的高竖线、
 * `\xrightarrow` 的长箭头、`\left(…\right)` 的高括号），非贪婪匹配会在**内层** `</svg>`
 * 处提前收尾，得到的是一个残缺的 SVG —— 浏览器用 `<img>` 解析它是严格的 XML，
 * 直接触发 onerror，公式于是退化成原始 TeX 文本。
 *
 * 这里按标签配对记深度，取到真正闭合的那一层。
 */

/** `<svg` / `</svg` 之后必须是空白或 `>`，否则是 `<svgfoo>` 这类别的标签名 */
function isOpenTag(html: string, index: number): boolean {
  return html.startsWith("<svg", index) && /[\s>]/.test(html[index + 4] ?? ">");
}

function isCloseTag(html: string, index: number): boolean {
  return html.startsWith("</svg", index) && /[\s>]/.test(html[index + 5] ?? ">");
}

export function extractOuterSvg(html: string): string | null {
  const first = /<svg(?=[\s>])/.exec(html);
  if (!first) return null;
  const start = first.index;

  let depth = 0;
  let i = start;
  while (i < html.length) {
    if (isOpenTag(html, i)) {
      depth += 1;
      i += 4;
      continue;
    }
    if (isCloseTag(html, i)) {
      const close = html.indexOf(">", i);
      if (close < 0) return null;
      depth -= 1;
      i = close + 1;
      if (depth === 0) return html.slice(start, i);
      continue;
    }
    i += 1;
  }
  return null;
}
