import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertToIR } from "../src/index";
import { irToPng } from "../src/export/png";
import { irToPdf } from "../src/export/pdf";

const here = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  fs.readFileSync(path.join(here, "fixtures", name), "utf8");

describe("image rendering", () => {
  it("renders a png with expected size", async () => {
    const ir = convertToIR(readFixture("basic.md"));
    const png = await irToPng(ir);
    expect(png.width).toBeGreaterThan(200);
    expect(png.height).toBeGreaterThan(100);
    expect(png.buffer.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(png.buffer.subarray(1, 4)).toString()).toBe("PNG");
  });

  it("renders a pdf with %PDF header", async () => {
    const ir = convertToIR(readFixture("basic.md"));
    const pdf = await irToPdf(ir);
    expect(Buffer.from(pdf.subarray(0, 4)).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("renders alternative themes", async () => {
    const ir = convertToIR(readFixture("basic.md"));
    const ocean = await irToPng(ir, { centralColor: "#0f4c5c" });
    const forest = await irToPng(ir, { centralColor: "#33552e" });
    expect(ocean.buffer.byteLength).toBeGreaterThan(0);
    expect(forest.buffer.byteLength).toBeGreaterThan(0);
  });
});
