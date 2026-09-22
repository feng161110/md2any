import PDFDocument from "pdfkit";
import type { MindMapIR } from "../types.js";
import { irToPng, type PngOptions } from "./png.js";

export async function irToPdf(ir: MindMapIR, options: PngOptions = {}): Promise<Uint8Array> {
  const { buffer, width, height } = await irToPng(ir, options);

  const doc = new PDFDocument({
    size: [Math.max(1, width), Math.max(1, height)],
    margin: 0,
    info: {
      Title: ir.sheets[0]?.root.title ?? "Mind Map",
      Creator: "md2any",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  doc.image(Buffer.from(buffer), 0, 0, { width, height });
  doc.end();
  await finished;

  return new Uint8Array(Buffer.concat(chunks));
}
