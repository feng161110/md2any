import { describe, expect, it } from "vitest";
import { convertToIR } from "../src/index";

describe("source line mapping", () => {
  it("records markdown lines for headings and list items", () => {
    const markdown = ["# 标题", "", "## 小节", "", "- 项目一", "- 项目二"].join("\n");
    const ir = convertToIR(markdown);
    const root = ir.sheets[0].root;
    expect(root.line).toBe(0);
    const section = root.children?.[0];
    expect(section?.title).toBe("小节");
    expect(section?.line).toBe(2);
    expect(section?.children?.[0].line).toBe(4);
    expect(section?.children?.[1].line).toBe(5);
  });

  it("records the line for body paragraphs and tables", () => {
    const markdown = ["# 报告", "", "正文段落。", "", "| 列A | 列B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const ir = convertToIR(markdown);
    const root = ir.sheets[0].root;
    expect(root.children?.[0].line).toBe(2);
    expect(root.children?.[1].table?.header).toEqual(["列A", "列B"]);
    expect(root.children?.[1].line).toBe(4);
  });
});
