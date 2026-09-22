import { describe, expect, it } from "vitest";
import { convertToIR, exportIR } from "../src/index";
import type { ExportFormat } from "../src/types";

/**
 * web 端的「真测试」：走核心库的真实管线，验证导出格式与产物。
 * 其余界面行为由浏览器承担（本文件早先的源码字符串断言已删除 ——
 * 它们不验证行为，只检查 main.ts 里有没有某段文本，重构即挂，没有保护价值）。
 */
describe("web export pipeline", () => {
  it("supports the formats exposed by the web page", async () => {
    const ir = convertToIR("# 中心\n\n## 分支\n\n- [x] 完成\n");
    const formats: ExportFormat[] = ["xmind", "json", "markdown"];
    for (const format of formats) {
      const output = await exportIR(ir, format);
      const size = typeof output === "string" ? output.length : output.byteLength;
      expect(size).toBeGreaterThan(0);
    }
  });
});
