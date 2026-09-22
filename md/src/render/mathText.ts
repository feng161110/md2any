/**
 * 把一行文本拆成「普通文本 + 公式」的段。
 *
 * 画布侧没有 markdown-it 的分词器，布局测量与绘制需要各自感知公式边界，
 * 这里提供统一的分段口径，供 layout / draw / Web 端共用。
 */

export interface MathSegment {
  kind: "text" | "math";
  /** 公式内容（不含 `$` / `$$` 定界符） */
  value: string;
  /** true 表示 `$$…$$` 块级（display）公式，缺省为行内 */
  display?: boolean;
}

/**
 * 扫描一行文本，把 `$$…$$` 拆成块级 math 段、`$…$` 拆成行内 math 段，其余为 text 段。
 * 与 Markdown 预览侧的公式判定保持一致：内容为空、含换行（行内）、
 * 首尾紧邻空白，或闭合 `$` 后紧跟数字（`$5$10`）的都不当公式。
 */
export function splitMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let plain = "";
  let i = 0;

  const flushText = (): void => {
    if (plain) {
      segments.push({ kind: "text", value: plain });
      plain = "";
    }
  };

  while (i < text.length) {
    // 块级 `$$…$$`：允许跨行，内容规范化（换行→空格）后作为 display 公式。
    // 规范化是为了和 layout 里 wrapText 合并跨行公式后的字符串保持一致，
    // 否则预渲染缓存 key 与绘制时的公式对不上，跨行公式会退化成原始 TeX。
    if (text.startsWith("$$", i)) {
      const close = text.indexOf("$$", i + 2);
      if (close > i + 2) {
        const content = text.slice(i + 2, close).replace(/\s+/g, " ").trim();
        if (content.length > 0) {
          flushText();
          segments.push({ kind: "math", value: content, display: true });
          i = close + 2;
          continue;
        }
      }
    }

    // 行内 `$…$`
    if (text[i] === "$") {
      const close = text.indexOf("$", i + 1);
      if (close < 0) {
        plain += text.slice(i);
        break;
      }
      const content = text.slice(i + 1, close);
      const after = text[close + 1];
      const valid =
        content.length > 0 &&
        !content.includes("\n") &&
        !/^\s/.test(content) &&
        !/\s$/.test(content) &&
        !(after !== undefined && /[0-9]/.test(after));

      if (valid) {
        flushText();
        segments.push({ kind: "math", value: content });
      } else {
        plain += text.slice(i, close + 1);
      }
      i = close + 1;
      continue;
    }

    plain += text[i];
    i += 1;
  }

  flushText();
  return segments.filter((segment) => segment.value.length > 0);
}

export function containsMathText(text: string): boolean {
  return splitMathSegments(text).some((segment) => segment.kind === "math");
}
