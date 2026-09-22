import { describe, expect, it } from "vitest";
import { containsMathText, splitMathSegments } from "../src/render/mathText";
import { wrapText } from "../src/render/layout";

describe("math text segmentation", () => {
  it("splits inline formulas out of plain text", () => {
    expect(splitMathSegments("已知 $a^2 + b^2 = c^2$，求 $x_1$")).toEqual([
      { kind: "text", value: "已知 " },
      { kind: "math", value: "a^2 + b^2 = c^2" },
      { kind: "text", value: "，求 " },
      { kind: "math", value: "x_1" },
    ]);
  });

  it("keeps currency amounts as plain text", () => {
    expect(containsMathText("价格 $5 到 $10 元")).toBe(false);
    expect(splitMathSegments("价格 $5 到 $10 元")).toEqual([
      { kind: "text", value: "价格 $5 到 $10 元" },
    ]);
  });

  it("treats an unterminated dollar as plain text", () => {
    expect(containsMathText("成本是 $100")).toBe(false);
  });

  it("rejects formulas with whitespace hugging the delimiters", () => {
    expect(containsMathText("公式 $ x + y $ 无效")).toBe(false);
  });

  it("keeps formula tokens unbroken while wrapping", () => {
    const measure = (text: string) => text.length * 10;
    const lines = wrapText("开头 $a^2+b^2=c^2$ 结尾", 150, 14, false, measure);
    expect(lines.join("\n")).toContain("$a^2+b^2=c^2$");
  });

  it("splits block formulas as display math", () => {
    expect(
      splitMathSegments(String.raw`期望 $$\mathbb{E}[X] = \int_{-\infty}^{\infty} x f_X(x) \, dx$$ 结束`),
    ).toEqual([
      { kind: "text", value: "期望 " },
      { kind: "math", value: String.raw`\mathbb{E}[X] = \int_{-\infty}^{\infty} x f_X(x) \, dx`, display: true },
      { kind: "text", value: " 结束" },
    ]);
  });

  it("detects block formulas via containsMathText", () => {
    expect(containsMathText(String.raw`$$\mathbb{E}[X]$$`)).toBe(true);
  });

  it("merges a multi-line block formula while wrapping", () => {
    const measure = (text: string) => text.length;
    const tex = String.raw`$$\mathbb{E}[X] = \int_{-\infty}^{\infty} x f_X(x) \, dx$$`;
    const input = "$$\n" + String.raw`\mathbb{E}[X] = \int_{-\infty}^{\infty} x f_X(x) \, dx` + "\n$$";
    const lines = wrapText(input, 5000, 14, false, measure);
    expect(lines.join("\n")).toContain(tex);
  });

  it("normalizes whitespace so raw and wrapped block formulas stay identical", () => {
    // 跨行块级公式：原始 title 与 wrapText 合并后的字符串必须提取出同一个公式，
    // 否则预渲染缓存 key 对不上（见 draw.ts 的 MathPainter）
    const raw = "$$\n" + String.raw`\begin{pmatrix}
a_{11} & a_{12} \\
a_{21} & a_{22}
\end{pmatrix}` + "\n$$";
    const wrapped = String.raw`$$\begin{pmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{pmatrix}$$`;

    const fromRaw = splitMathSegments(raw).find((s) => s.kind === "math");
    const fromWrapped = splitMathSegments(wrapped).find((s) => s.kind === "math");
    expect(fromRaw?.value).toBe(String.raw`\begin{pmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{pmatrix}`);
    expect(fromRaw?.value).toBe(fromWrapped?.value);
  });
});
