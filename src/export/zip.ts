import JSZip from "jszip";

export async function zipFiles(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [filePath, content] of Object.entries(files)) {
    zip.file(filePath, content);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/**
 * 解出文本条目。
 *
 * `only` 用来指定只要哪几个条目：`.xmind` 里除了 content.json / content.xml，
 * 还可能有缩略图、resources 图片等二进制条目，逐个按 UTF-8 解码既慢又产出乱码字符串。
 * 不传 `only` 时保持原有行为（全部按字符串读出）。
 */
export async function unzipFiles(
  buffer: Uint8Array,
  only?: readonly string[],
): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const result: Record<string, string> = {};
  const entries = only ?? Object.keys(zip.files);
  for (const entry of entries) {
    const file = zip.files[entry];
    if (!file || file.dir) continue;
    result[entry] = await file.async("string");
  }
  return result;
}
