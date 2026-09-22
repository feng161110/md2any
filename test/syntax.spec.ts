import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertToIR } from "../src/index";
import { buildXMindFiles } from "../src/export/xmindZen";
import { unzipFiles, zipFiles } from "../src/export/zip";

const here = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  fs.readFileSync(path.join(here, "fixtures", name), "utf8");

describe("syntax coverage", () => {
  it("degrades code blocks and quotes into notes, expands tables", () => {
    const ir = convertToIR(readFixture("syntax-full.md"));
    const root = ir.sheets[0].root;
    expect(root.children?.map((child) => child.title)).toEqual([
      "代码块",
      "表格",
      "引用",
      "链接与图片",
      "分割之后",
    ]);
    expect(root.children?.[0].note).toContain("const total");
    expect(root.children?.[0].note).toContain("```ts");
    const table = root.children?.[1].children?.[0];
    expect(table?.table?.header).toEqual(["语法", "映射"]);
    expect(table?.table?.rows).toEqual([
      ["标题", "层级"],
      ["列表", "子节点"],
    ]);
  });

  it("turns links into href and images into notes", () => {
    const ir = convertToIR(readFixture("syntax-full.md"));
    const section = ir.sheets[0].root.children?.[3];
    expect(section?.children?.[0].title).toBe("官方文档");
    expect(section?.children?.[0].href).toBe("https://example.com/docs");
    expect(section?.note).toContain("![架构图]");
  });

  it("always produces a single sheet", () => {
    const ir = convertToIR(readFixture("syntax-full.md"));
    expect(ir.sheets.length).toBe(1);
  });

  it("writes themed styles into content.json", async () => {
    const ir = convertToIR(readFixture("basic.md"));
    const buffer = await zipFiles(buildXMindFiles(ir));
    const files = await unzipFiles(buffer);
    const sheets = JSON.parse(files["content.json"]);
    expect(sheets[0].rootTopic.title).toBe("项目方案");
    expect(sheets[0].rootTopic.style.properties["svg:fill"]).toBeTruthy();
    expect(sheets[0].rootTopic.children.attached[0].style.properties["shape-class"]).toBeTruthy();
  });
});
