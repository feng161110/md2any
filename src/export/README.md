# src/export — IR → 目标格式

每个导出器只吃 IR、只吐字节流或字符串，彼此不依赖（只有 `pdf` 复用 `png` 的画布）。

| 文件 | 产出 | 依赖 |
| --- | --- | --- |
| `xmindZen.ts` | XMind Zen / 2020+ 的 `content.json` + `metadata.json` + `manifest.json`：`buildXMindFiles` 组文件、`irToXMindContent` 组内容 | 无（纯 JSON 拼装） |
| `zip.ts` | `zipFiles` 打包 / `unzipFiles` 解包 | `jszip`，Node 与浏览器通用 |
| `markdown.ts` | `irToMarkdown`：层级还原成标题与列表 | `transform/rules/block.ts` 的 `tableToMarkdown` |
| `json.ts` | `irToJson`：缩进 JSON，便于调试与二次加工 | 无 |
| `png.ts` | `irToPng`：离屏画布绘制导图 | `@napi-rs/canvas` + `render/draw.ts` |
| `pdf.ts` | `irToPdf`：把 PNG 按原尺寸放进 PDF | `pdfkit` + `png.ts` |

## 平台限制

`png.ts` / `pdf.ts` 需要 Canvas 与文件系统，**只能在 Node 侧用**；`index.ts` 的 `exportIR` 遇到这两种格式会直接抛错，提示从对应模块导入。

`xmindZen` / `json` / `markdown` 是纯计算，浏览器端（网页导出）直接复用 —— 所以同一份 IR 在网页里也能导出 `.xmind`、Markdown、JSON。

## 约定

- 标题一律输出**纯文本**，不写 XMind 富文本，换取客户端最大兼容性
- 图片只保留链接，不下载远端资源打包
- 主题 id 由 `xmindZen` 生成（`md2any-central` / `md2any-level-N`），保持稳定便于比对产物
