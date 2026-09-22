import { describe, expect, it } from "vitest";
import { convertToIR } from "../src/index";
import { parseMarkdown } from "../src/parser/parseMarkdown";
import { splitMathSegments } from "../src/render/mathText";
import type { MindMapIR, TopicNode } from "../src/types";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function collectTitles(ir: MindMapIR): string[] {
  const out: string[] = [];
  const walk = (node: TopicNode): void => {
    if (node.title) out.push(node.title);
    for (const child of node.children ?? []) walk(child);
  };
  for (const sheet of ir.sheets) walk(sheet.root);
  return out;
}

describe("markdown math TeX escaping", () => {
  it("keeps TeX backslash commands inside inline math", () => {
    const tex = String.raw`积分 $\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}$`;
    const ir = convertToIR("# " + tex);
    expect(ir.sheets[0].root.title).toBe(tex);
  });

  it("keeps escaped punctuation like \\{ \\} inside math", () => {
    const tex = String.raw`集合 $\{x \mid x \in \mathbb{R}\}$`;
    const ir = convertToIR("# " + tex);
    expect(ir.sheets[0].root.title).toBe(tex);
  });

  it("does not break block math backslashes", () => {
    const tex = String.raw`\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}`;
    const ir = convertToIR(String.raw`$$\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}$$`);
    expect(collectTitles(ir).join("\n")).toContain(tex);
  });

  it("keeps a block matrix with a lone '=' line (setext heading) intact", () => {
    const src = String.raw`$$
\begin{bmatrix}
a & b \\
c & d
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
=
\begin{bmatrix}
ax + by \\
cx + dy
\end{bmatrix}
$$`;
    const ir = convertToIR(src);
    const joined = collectTitles(ir).join("\n");
    // `=` 单独成行不应被 remark 当成 setext 标题底线拆散公式
    expect(joined).toContain(String.raw`ax + by`);
    expect(joined).toContain(String.raw`cx + dy`);
    // 整条矩阵公式应被识别为单个 display 公式
    const display = collectTitles(ir)
      .flatMap((title) => splitMathSegments(title))
      .filter((segment) => segment.kind === "math" && segment.display)
      .map((segment) => segment.value);
    expect(display.some((tex) => tex.includes("ax + by") && tex.includes("\\end{bmatrix}"))).toBe(true);
  });

  it("keeps asterisks inside math (markdown would eat them as emphasis)", () => {
    // `L^{p^*}` 与 `\frac1{p^*}` 里的两个 `*` 曾被当成一组强调标记吃掉，
    // TeX 变成 `p^` → MathJax 报错（导图预览显示错误）。
    const src = String.raw`$$W^{k,p}(\mathbb R^n)\hookrightarrow L^{p^*}(\mathbb R^n),\quad \frac1{p^*}=\frac1p-\frac{k}{n}$$`;
    const ir = convertToIR(String.raw`# 嵌入定理` + "\n\n" + "- 索伯列夫：  \n  " + src);
    const display = collectTitles(ir)
      .flatMap((title) => splitMathSegments(title))
      .filter((segment) => segment.kind === "math")
      .map((segment) => segment.value);
    expect(display.some((tex) => tex.includes(String.raw`L^{p^*}`))).toBe(true);
    expect(display.some((tex) => tex.includes(String.raw`\frac1{p^*}`))).toBe(true);
  });

  it("keeps inline math punctuation that markdown treats as markup", () => {
    const cases = [
      String.raw`$p^*$`,
      String.raw`$a_1 b_2$`,
      String.raw`$a*b*c$`,
      String.raw`$\left[\frac12\right]$`,
      String.raw`$x<y$ 与 $A \& B$`,
    ];
    for (const tex of cases) {
      const ir = convertToIR("# " + tex);
      expect(ir.sheets[0].root.title).toBe(tex);
    }
  });

  it("does not double backslashes in fenced code", () => {
    const src = "```ts\nconst s = \"$\\alpha$\" + \"\\,\";\n```\n";
    const root = parseMarkdown(src);
    const code = root.children.find((c) => (c as { type: string }).type === "code") as {
      value: string;
    };
    expect(code.value).toBe("const s = \"$\\alpha$\" + \"\\,\";");
  });

  it("does not double backslashes in inline code", () => {
    const src = "text `$\\alpha$` end";
    const root = parseMarkdown(src);
    const para = root.children[0] as { children: { type: string; value?: string }[] };
    const code = para.children.find((c) => c.type === "inlineCode") as { value: string };
    expect(code.value).toBe("$\\alpha$");
  });

  it("preserves every formula in the comprehensive sample", () => {
    const doc = fs.readFileSync(path.join(here, "fixtures", "comprehensive.md"), "utf8");
    const ir = convertToIR(doc);
    const joined = collectTitles(ir).join("\n");

    // 代表性的块级公式（含矩阵 / 多行对齐）与行内公式都必须原样保留 TeX
    expect(joined).toContain(String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`);
    expect(joined).toContain(String.raw`e^{i\pi} + 1 = 0`);
    expect(joined).toContain(String.raw`\begin{pmatrix}`);
    expect(joined).toContain(String.raw`\begin{aligned}`);
    expect(joined).toContain(String.raw`\mathbb{E}[X] = \int_{-\infty}^{\infty} x f_X(x) \, dx`);
    expect(joined).toContain("$E = mc^2$");

    // 矩阵 / 对齐经分段后应能被识别为 display 公式
    const displayFormulas = collectTitles(ir)
      .flatMap((title) => splitMathSegments(title))
      .filter((segment) => segment.kind === "math" && segment.display)
      .map((segment) => segment.value);
    expect(displayFormulas.some((tex) => tex.includes("\\begin{pmatrix}"))).toBe(true);
    expect(displayFormulas.some((tex) => tex.includes("\\begin{aligned}"))).toBe(true);
  });
});
