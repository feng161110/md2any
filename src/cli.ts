#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import cac from "cac";
import pc from "picocolors";
import { convertToIR, exportIR, parseXMind } from "./index.js";
import { irToJson } from "./export/json.js";
import { irToMarkdown } from "./export/markdown.js";
import { irToPng } from "./export/png.js";
import { irToPdf } from "./export/pdf.js";
import type { ExportFormat } from "./types.js";

const cli = cac("md2any");

cli
  .command("<input>", "Convert a Markdown file to XMind (or back)")
  .option("-o, --output <path>", "Output file path")
  .option("-f, --format <format>", "Output format: xmind | json | markdown | png | pdf", { default: "xmind" })
  .option("--root-title <title>", "Override the central topic title")
  .option("--central-color <hex>", "Central topic color, e.g. #1f4e79")
  .option("--branch-colors <colors>", "Comma separated branch colors, e.g. #e05a47,#2e9e8f")
  .option("--reverse", "Convert .xmind back to Markdown")
  .option("--dry-run", "Print the intermediate representation only")
  .action(async (input: string, opts) => {
    try {
      const source = path.resolve(process.cwd(), input);
      if (!fs.existsSync(source)) {
        console.error(pc.red("Input not found: " + source));
        process.exit(1);
      }
      const fallbackTitle = path.basename(source, path.extname(source));
      const format = String(opts.format) as ExportFormat;

      if (opts.reverse) {
        const buffer = new Uint8Array(fs.readFileSync(source));
        const ir = await parseXMind(buffer);
        const output = resolveOutput(source, opts.output, "markdown");
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, irToMarkdown(ir), "utf8");
        console.log(pc.green("Generated: " + output));
        return;
      }

      const markdown = fs.readFileSync(source, "utf8");
      const branchColors = parseColors(opts.branchColors);
      const options = {
        rootTitle: opts.rootTitle,
        centralColor: opts.centralColor,
        branchColors,
      };

      if (opts.dryRun) {
        console.log(irToJson(convertToIR(markdown, options, fallbackTitle)));
        return;
      }

      const ir = convertToIR(markdown, options, fallbackTitle);
      let result: Uint8Array | string;
      if (format === "png") {
        result = (await irToPng(ir, { centralColor: opts.centralColor, branchColors })).buffer;
      } else if (format === "pdf") {
        result = await irToPdf(ir, { centralColor: opts.centralColor, branchColors });
      } else {
        result = await exportIR(ir, format, options);
      }

      const output = resolveOutput(source, opts.output, format);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(
        output,
        result instanceof Uint8Array ? result : Buffer.from(String(result), "utf8"),
      );
      console.log(pc.green("Generated: " + output));
    } catch (error) {
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

cli.help();
cli.version("1.0.0");
cli.parse();

function resolveOutput(source: string, output: unknown, format: ExportFormat): string {
  if (typeof output === "string" && output.length > 0) {
    return path.resolve(process.cwd(), output);
  }
  const extensions: Record<string, string> = {
    xmind: ".xmind",
    json: ".json",
    markdown: ".md",
    png: ".png",
    pdf: ".pdf",
  };
  const ext = extensions[format] ?? ".xmind";
  return path.join(path.dirname(source), path.basename(source, path.extname(source)) + ext);
}


function parseColors(value: unknown): string[] | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const colors = value.split(",").map((item) => item.trim()).filter(Boolean);
  return colors.length > 0 ? colors : undefined;
}
