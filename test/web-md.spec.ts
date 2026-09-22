import { describe, expect, it } from "vitest";
import { createPreviewMarkdown } from "../web/src/md-extras";

const render = (source: string): string => createPreviewMarkdown().render(source);

describe("markdown preview syntax coverage", () => {
  it("renders task lists as real, read-only checkboxes", () => {
    const html = render("- [x] 完成\n- [ ] 待办\n");
    expect(html).toContain('class="md-task"');
    expect(html).toContain("checked");
    expect(html).toContain("md-task-item");
    expect(html).not.toContain("[x]");
    expect(html).not.toContain("[ ]");
  });

  it("shows front-matter as a config panel instead of body text", () => {
    const html = render("---\ntitle: 项目方案\nlayout: map\n---\n\n# 标题\n");
    expect(html).toContain("md-frontmatter");
    expect(html).toContain("项目方案");
    expect(html).toContain("<h1>");
    expect(html).not.toContain("<hr>");
  });

  it("keeps a lone --- as a horizontal rule", () => {
    expect(render("a\n\n---\n\nb\n")).toContain("<hr>");
  });

  it("renders footnotes with numbering and an endnotes list", () => {
    const html = render("正文[^note]\n\n[^note]: 脚注内容\n");
    expect(html).toContain('class="md-footnote-ref"');
    expect(html).toContain('href="#md-fn-note"');
    expect(html).toContain('class="md-footnotes"');
    expect(html).toContain("脚注内容");
    expect(html).toContain("md-footnote-back");
  });

  it("keeps an undefined footnote reference as plain text", () => {
    const html = render("看这里[^nope]\n");
    expect(html).toContain("[^nope]");
    expect(html).not.toContain("md-footnote-ref");
  });

  it("numbers footnotes in reference order", () => {
    const html = render("A[^b] B[^a]\n\n[^a]: 甲\n[^b]: 乙\n");
    expect(html.indexOf('id="md-fn-b"')).toBeLessThan(html.indexOf('id="md-fn-a"'));
    expect(html).toMatch(/id="md-fnref-b"[^>]*>1</);
    expect(html).toMatch(/id="md-fnref-a"[^>]*>2</);
  });

  it("renders mark, insert, subscript and superscript", () => {
    expect(render("==高亮==")).toContain("<mark>高亮</mark>");
    expect(render("++插入++")).toContain("<ins>插入</ins>");
    expect(render("H~2~O")).toContain("<sub>2</sub>");
    expect(render("E=mc^2^")).toContain("<sup>2</sup>");
  });

  it("keeps strikethrough working next to subscript", () => {
    expect(render("~~删掉~~")).toContain("<s>删掉</s>");
  });

  it("labels fenced code with its language", () => {
    const html = render("```ts\nconst a = 1;\n```\n");
    expect(html).toContain("md-code-lang");
    expect(html).toContain(">ts<");
  });

  it("typesets math with MathJax without eating currency amounts", () => {
    const inline = render("$a^2$");
    expect(inline).toContain("<mjx-container");
    expect(inline).toContain("<svg");
    const block = render("$$\na = b\n$$");
    expect(block).toContain("<mjx-container");
    expect(block).toContain('display="true"');
    expect(render("价格 $5 到 $10 元")).not.toContain("mjx");
  });

  it("emits a single clean mjx-container per formula (no inline style/span wrapper)", () => {
    // 回归：样式表应从 tex2svgHtml 的 <style> 提取注入 <head>，
    // 输出里不能残留 <style> 或 <span id="mjx-…">，否则辅助 MathML 会露出来、公式显示两份
    const html = render("$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}\n$$\n");
    expect((html.match(/<mjx-container/g) ?? []).length).toBe(1);
    expect(html).not.toContain("<style>");
    expect(html).not.toContain("<span id=\"mjx-");
  });

  it("keeps the gfm basics working", () => {
    expect(render("| a | b |\n| - | - |\n| 1 | 2 |\n")).toContain("<table>");
    expect(render("https://example.com\n")).toContain('href="https://example.com"');
  });

  it("turns mermaid / markmap / chart fences into render placeholders", () => {
    expect(render("```mermaid\ngraph TD; A-->B\n```\n")).toContain('data-diagram="mermaid"');
    expect(render("```markmap\n- a\n  - b\n```\n")).toContain('data-diagram="markmap"');
    expect(render('```chart\n{"type":"bar"}\n```\n')).toContain('data-diagram="chart"');
    expect(render('```chartjs\n{"type":"line"}\n```\n')).toContain('data-diagram="chart"');
  });

  it("escapes the diagram source into its data attribute", () => {
    const html = render('```mermaid\ngraph TD;\nA["<b>B</b>"] --> C\n```\n');
    expect(html).toContain("data-code=");
    expect(html).toContain("&lt;b&gt;");
  });

  it("keeps a normal code fence as code, not a diagram", () => {
    const html = render("```ts\nconst a = 1;\n```\n");
    expect(html).not.toContain("data-diagram");
    expect(html).toContain("md-code-lang");
  });
});
