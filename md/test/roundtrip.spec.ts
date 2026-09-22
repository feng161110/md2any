import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convert, convertToIR, parseXMind } from "../src/index";
import { irToMarkdown } from "../src/export/markdown";
import { splitMathSegments } from "../src/render/mathText";
import type { TopicNode } from "../src/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, "..");
const readFixture = (name: string) =>
  fs.readFileSync(path.join(here, "fixtures", name), "utf8");

describe("reverse conversion", () => {
  it("parses a zen xmind back into IR", async () => {
    const buffer = await convert(readFixture("basic.md"));
    const ir = await parseXMind(buffer);
    expect(ir.sheets[0].root.title).toBe("项目方案");
    expect(ir.sheets[0].root.children?.map((child) => child.title)).toEqual([
      "背景",
      "实施方案",
    ]);
  });

  it("parses a legacy XMind 8 file back into IR", async () => {
    const buffer = new Uint8Array(
      fs.readFileSync(path.join(here, "fixtures", "basic-legacy.xmind")),
    );
    const ir = await parseXMind(buffer);
    expect(ir.sheets[0].root.title).toBe("项目方案");
    expect(ir.sheets[0].root.children?.map((child) => child.title)).toEqual([
      "背景",
      "实施方案",
    ]);
  });

  it("round-trips markdown through IR", () => {
    const ir = convertToIR(readFixture("basic.md"));
    const markdown = irToMarkdown(ir);
    expect(markdown).toContain("# 项目方案");
    expect(markdown).toContain("## 背景");
    expect(markdown).toContain("### 现状");
    const again = convertToIR(markdown);
    expect(again.sheets[0].root.title).toBe("项目方案");
    expect(again.sheets[0].root.children?.map((child) => child.title)).toEqual([
      "背景",
      "实施方案",
    ]);
  });

  it("round-trips tables without losing them or growing a level", () => {
    const source = ["# T", "", "## 表", "", "| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const once = irToMarkdown(convertToIR(source));
    const again = convertToIR(once);
    const table = again.sheets[0].root.children?.[0].children?.[0];
    expect(table?.table).toEqual({ header: ["a", "b"], rows: [["1", "2"]] });
    // 幂等：再来一圈不能再长出新层级
    expect(irToMarkdown(again)).toBe(once);
  });

  it("round-trips rich notes without double-quoting them", () => {
    const source = [
      "# R", "", "## H", "",
      "> 引用正文", ">",
      "> ![架构图](https://example.com/a.png)", "",
      "```ts", "const a = 1;", "```",
    ].join("\n");
    const once = irToMarkdown(convertToIR(source));
    // 备注本身已经是 Markdown，再补一层 `> ` 会变成嵌套引用并打散代码块
    expect(once).not.toContain("> > ");
    expect(once).toContain("```ts");

    const node = convertToIR(once).sheets[0].root.children?.[0];
    expect(node?.note).toContain("引用正文");
    expect(node?.note).toContain("![架构图](https://example.com/a.png)");
    expect(node?.note).toContain("const a = 1;");
    expect(irToMarkdown(convertToIR(once))).toBe(once);
  });

  it("collapses multi-line titles so the tree does not grow per round trip", () => {
    const source = ["# R", "", "## H", "", "第一段", "", "第二段", "", "$$", "x = 1", "$$"].join("\n");
    const once = irToMarkdown(convertToIR(source));
    expect(once.split("\n").some((line) => line.startsWith("## ") && line.length > 3)).toBe(true);
    expect(irToMarkdown(convertToIR(once))).toBe(once);
  });

  it("round-trips math with asterisks and brackets intact", () => {
    // 导出的是原始 TeX，二次解析时 `*` 不能再被 markdown 当成强调吃掉
    const source = [
      "# R",
      "",
      "- 嵌入：  ",
      String.raw`  $$W^{k,p}(\mathbb R^n)\hookrightarrow L^{p^*}(\mathbb R^n),\quad \frac1{p^*}=\frac1p-\frac{k}{n}$$`,
      "",
    ].join("\n");
    const once = irToMarkdown(convertToIR(source));
    expect(once).toContain(String.raw`L^{p^*}(\mathbb R^n)`);
    const again = convertToIR(once);
    const collectTitles = (node: TopicNode): string[] => [
      node.title,
      ...(node.children ?? []).flatMap(collectTitles),
    ];
    const display = collectTitles(again.sheets[0].root)
      .flatMap((title) => splitMathSegments(title))
      .filter((segment) => segment.kind === "math")
      .map((segment) => segment.value);
    expect(display.some((tex) => tex.includes(String.raw`L^{p^*}`))).toBe(true);
    expect(irToMarkdown(again)).toBe(once);
  });

  it("restores task list markers in markdown", () => {
    const ir = convertToIR(readFixture("mixed.md"));
    const markdown = irToMarkdown(ir);
    expect(markdown).toContain("- [x] 已完成的任务");
    expect(markdown).toContain("- [ ] 待办任务");
  });

  it("runs the CLI in reverse mode", () => {
    const stamp = Date.now();
    const xmind = path.join(os.tmpdir(), "md2xmind-fwd-" + stamp + ".xmind");
    const output = path.join(os.tmpdir(), "md2xmind-rev-" + stamp + ".md");
    execSync(
      "npx tsx src/cli.ts test/fixtures/basic.md -o " + JSON.stringify(xmind),
      { cwd: projectRoot, stdio: "pipe" },
    );
    execSync(
      "npx tsx src/cli.ts " + JSON.stringify(xmind) + " --reverse -o " + JSON.stringify(output),
      { cwd: projectRoot, stdio: "pipe" },
    );
    expect(fs.readFileSync(output, "utf8")).toContain("# 项目方案");
    fs.rmSync(xmind, { force: true });
    fs.rmSync(output, { force: true });
  }, 180000);
});
