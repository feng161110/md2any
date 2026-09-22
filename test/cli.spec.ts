import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("cli formats", () => {
  it("reverse-converts a legacy XMind 8 file back to markdown", () => {
    const output = path.join(os.tmpdir(), "md2any-reverse-" + Date.now() + ".md");
    execSync(
      "npx tsx src/cli.ts test/fixtures/basic-legacy.xmind --reverse -o " +
        JSON.stringify(output),
      { cwd: projectRoot, stdio: "pipe" },
    );
    const markdown = fs.readFileSync(output, "utf8");
    expect(markdown).toContain("# 项目方案");
    expect(markdown).toContain("## 背景");
    fs.rmSync(output, { force: true });
  }, 180000);

  it("writes IR json with -f json", () => {
    const output = path.join(os.tmpdir(), "md2any-json-" + Date.now() + ".json");
    execSync(
      "npx tsx src/cli.ts test/fixtures/basic.md -f json -o " + JSON.stringify(output),
      { cwd: projectRoot, stdio: "pipe" },
    );
    const parsed = JSON.parse(fs.readFileSync(output, "utf8"));
    expect(parsed.sheets[0].root.title).toBe("项目方案");
    fs.rmSync(output, { force: true });
  }, 180000);

  it("writes a PNG image with -f png", () => {
    const output = path.join(os.tmpdir(), "md2any-png-" + Date.now() + ".png");
    execSync(
      "npx tsx src/cli.ts test/fixtures/basic.md -f png -o " + JSON.stringify(output),
      { cwd: projectRoot, stdio: "pipe" },
    );
    const header = fs.readFileSync(output).subarray(0, 4);
    expect([header[0], header[1], header[2], header[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    fs.rmSync(output, { force: true });
  }, 180000);

  it("writes a real PDF document with -f pdf", () => {
    const output = path.join(os.tmpdir(), "md2any-pdf-" + Date.now() + ".pdf");
    execSync(
      "npx tsx src/cli.ts test/fixtures/basic.md -f pdf -o " + JSON.stringify(output),
      { cwd: projectRoot, stdio: "pipe" },
    );
    const header = fs.readFileSync(output).subarray(0, 4).toString("latin1");
    expect(header).toBe("%PDF");
    fs.rmSync(output, { force: true });
  }, 180000);
});
