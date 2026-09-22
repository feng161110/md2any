import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertToIR } from "../src/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) =>
  fs.readFileSync(path.join(here, "fixtures", name), "utf8");

describe("body paragraphs", () => {
  it("merges consecutive paragraphs into a single topic", () => {
    const ir = convertToIR(read("long-paragraph.md"));
    expect(ir.sheets[0].root.title).toBe("二、项目背景与意义");
    const sections = ir.sheets[0].root.children ?? [];
    expect(sections.length).toBe(2);
    const body = sections[0];
    expect(body.title.split("\n").length).toBe(3);
    expect(body.title).toContain("第一段");
    expect(body.title).toContain("第二段");
    expect(body.title).toContain("第三段");
  });

  it("keeps the full text without truncation", () => {
    const ir = convertToIR(read("long-paragraph.md"));
    const body = ir.sheets[0].root.children?.[0];
    expect(body?.title.length).toBeGreaterThan(200);
    expect(body?.title.endsWith("…")).toBe(false);
    expect(body?.title).toContain("萱草纹银鎏金镂空香薰炉");
  });

  it("keeps later sections as their own topics", () => {
    const ir = convertToIR(read("long-paragraph.md"));
    const section = ir.sheets[0].root.children?.[1];
    expect(section?.title).toBe("三、实施计划");
    expect(section?.children?.map((child) => child.title)).toEqual([
      "第一阶段",
      "第二阶段",
    ]);
  });
});
