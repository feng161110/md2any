import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convert, convertToIR } from "../src/index";
import { unzipFiles } from "../src/export/zip";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, "..");
const readFixture = (name: string) =>
  fs.readFileSync(path.join(here, "fixtures", name), "utf8");

describe("convertToIR", () => {
  it("builds the hierarchy from headings", () => {
    const ir = convertToIR(readFixture("basic.md"));
    const root = ir.sheets[0].root;
    expect(root.title).toBe("项目方案");
    expect(root.children?.map((child) => child.title)).toEqual(["背景", "实施方案"]);
    expect(root.children?.[0].children?.map((child) => child.title)).toEqual(["现状", "目标"]);
  });

  it("maps nested lists to nested topics", () => {
    const ir = convertToIR(readFixture("nested-list.md"));
    const root = ir.sheets[0].root;
    expect(root.title).toBe("购物清单");
    expect(root.children?.map((child) => child.title)).toEqual(["水果", "蔬菜"]);
    const fruit = root.children?.[0];
    expect(fruit?.children?.map((child) => child.title)).toEqual(["苹果", "香蕉"]);
    expect(fruit?.children?.[0].children?.map((child) => child.title)).toEqual(["红富士"]);
  });

  it("falls back to the first heading when there is no H1", () => {
    const ir = convertToIR(readFixture("no-h1.md"), {}, "no-h1");
    const root = ir.sheets[0].root;
    expect(root.title).toBe("模块 A");
    expect(root.children?.map((child) => child.title)).toEqual(["子项 1", "子项 2", "模块 B"]);
  });

  it("attaches a skipped heading level to the nearest existing ancestor", () => {
    // `## B` 之后直接 `#### D`：D 应挂在 B 下，而不是掉回根变成 B 的兄弟
    const ir = convertToIR(["# A", "", "## B", "", "#### D", "", "### C"].join("\n"));
    const root = ir.sheets[0].root;
    expect(root.children?.map((child) => child.title)).toEqual(["B"]);
    expect(root.children?.[0].children?.map((child) => child.title)).toEqual(["D", "C"]);
  });

  it("keeps content deeper than maxDepth inside the parent note", () => {
    // 超过 maxDepth 的部分会折进 note，更深层的内容不能因此丢掉
    const deep = ["# R", "## 1", "### 1.1", "#### 1.1.1", "##### 1.1.1.1", "###### 1.1.1.1.1"].join("\n");
    const root = convertToIR(deep, { maxDepth: 4 }).sheets[0].root;
    const truncated = root.children?.[0].children?.[0].children?.[0];
    expect(truncated?.children).toBeUndefined();
    expect(truncated?.note).toContain("- 1.1.1.1");
    expect(truncated?.note).toContain("- 1.1.1.1.1");
  });

  it("honours front-matter and task list markers", () => {
    const ir = convertToIR(readFixture("mixed.md"));
    const root = ir.sheets[0].root;
    expect(root.title).toBe("读书笔记");
    expect(root.children?.map((child) => child.title)).toEqual(["第一章"]);
    const chapter = root.children?.[0];
    expect(chapter?.children?.map((child) => child.title)).toEqual([
      "这是一段正文，会变成子主题。",
      "要点",
      "参考",
    ]);
    const tasks = chapter?.children?.[1].children ?? [];
    expect(tasks.map((task) => task.title)).toEqual(["已完成的任务", "待办任务"]);
    expect(tasks[0].markers).toEqual(["task-done"]);
    expect(tasks[1].markers).toEqual(["task-start"]);
    expect(tasks[1].children?.map((child) => child.title)).toEqual(["子步骤一", "子步骤二"]);
  });
});

describe("xmind output", () => {
  it("produces a zip containing content.json, metadata.json and manifest.json", async () => {
    const buffer = await convert(readFixture("basic.md"));
    const files = await unzipFiles(buffer);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["content.json", "metadata.json", "manifest.json"]),
    );
    const sheets = JSON.parse(files["content.json"]);
    expect(Array.isArray(sheets)).toBe(true);
    expect(sheets[0].class).toBe("sheet");
    expect(sheets[0].rootTopic.title).toBe("项目方案");
    expect(sheets[0].rootTopic.children.attached.length).toBe(2);
  });

  it("runs the CLI end to end", async () => {
    const output = path.join(os.tmpdir(), "md2xmind-cli-" + Date.now() + ".xmind");
    execSync("npx tsx src/cli.ts test/fixtures/basic.md -o " + JSON.stringify(output), { cwd: projectRoot, stdio: "pipe" });
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.statSync(output).size).toBeGreaterThan(0);
    const header = fs.readFileSync(output).subarray(0, 2);
    expect([header[0], header[1]]).toEqual([0x50, 0x4b]);
    const zipped = await unzipFiles(new Uint8Array(fs.readFileSync(output)));
    expect(Object.keys(zipped)).toContain("content.json");
    fs.rmSync(output, { force: true });
  }, 180000);
});
