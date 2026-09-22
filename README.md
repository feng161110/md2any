# md2any

> **Markdown 预览 · 转换 · 导出，一站式工具**
> **版本：v1.0.0**

[![version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![typescript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

网页里写 Markdown 就能实时预览、按 A4 纸张分页排版，顺手导出成思维导图或文档；命令行同样支持批量转换与 `.xmind` 反向解析。

| 能力 | 说明 |
| --- | --- |
| **Markdown 预览与导出** | 三视图实时预览，导出所见即所得（核心功能） |
| **多格式互转** | Markdown ↔ XMind / PNG / PDF / Markdown / JSON |
| **双向工作流** | `.xmind` 也能反向导回 Markdown |
| **双入口** | CLI 与网页共用同一套核心库 |

设计原则：**解析（Markdown）与导出（格式）彻底解耦**，中间用一层格式无关的 IR（中间表示）衔接 —— 新增导出格式、渲染后端或输入源，都不必改动核心转换逻辑。

---

## 功能

### 核心：Markdown 预览与导出

左侧编辑、右侧预览，导出结果与预览一致：

| 预览视图 | 说明 | 可导出格式 |
| --- | --- | --- |
| XMind 预览 | markmap 交互导图，鼠标 / 双指缩放平移 | XMind |
| 导图预览 | 自绘画布，与 PNG / PDF 输出同源，逐像素一致 | XMind / PNG / PDF |
| Markdown 预览 | A4 纸张分页排版，可手动增删分页 | Markdown / JSON |

预览端完整支持标题、有序 / 无序 / 任务 / 嵌套列表、表格、引用、代码块（高亮 + 语言标签）、脚注、行内标记（`==高亮==`、`++插入++`、`^上标^`、`~~删除线~~`）、公式（MathJax）与图表（Mermaid / Markmap / Chart.js）。

还有：深色模式、移动端 / 平板适配、全屏、缩放、预览内单击定位到左侧对应行、拖拽 `.md` 文件导入。

### 转换与导出

- **Markdown → `.xmind`**：标题层级与缩进列表自动转成导图层级，自动推断中心主题
- **Markdown → PNG / PDF / Markdown / JSON**：`png` / `pdf` 为 Node 专属（Canvas + pdfkit）
- **`.xmind` → Markdown**：新版 `content.json` 与 XMind 8 旧版 `content.xml` 都支持
- **配色自定义**：中心主题与一级主题独立配色（CLI 参数 / 网页色轮）

## 快速开始

### 安装与构建

仓库里**不含构建产物**，克隆后先装依赖并构建（CLI 入口就是构建出来的 `dist/cli.cjs`）：

```bash
npm install
npm run build
```

### CLI

构建完成后，三种用法任选：

```bash
node dist/cli.cjs ./note.md
npm run dev -- ./note.md
npm i -g .
md2any ./note.md
```

| 用法 | 说明 |
| --- | --- |
| `node dist/cli.cjs` | 直接跑构建产物，最直观 |
| `npm run dev --` | 用 `tsx` 直跑源码，改完即生效、免构建 |
| `npm i -g .` | 装成全局命令，之后直接用 `md2any` |

> `npx md2any` **暂时不可用**：包尚未发布到 npm；而且 npm 不会把「当前项目自己的 `bin`」链接进 `node_modules/.bin`，所以本地也解析不到。

常用示例（默认输出 `.xmind`，与源文件同目录同名；下面用 `md2any` 指代，没做全局安装时把它换成 `node dist/cli.cjs`）：

```bash
md2any ./note.md
md2any ./note.md -o ./out/note.xmind
md2any ./note.md --root-title "读书笔记"
md2any ./note.md -f png -o ./out/note.png
md2any ./note.md --dry-run
md2any ./out/note.xmind --reverse -o ./note.md
```

上面依次是：默认转 `.xmind`、指定输出路径、替换中心主题名、导出 PNG（换成 `-f pdf` 即导出 PDF）、只打印 IR 不写文件、把 `.xmind` 反向转回 Markdown。

| 参数 | 说明 |
| --- | --- |
| `-o, --output <path>` | 输出路径，缺省与输入同目录同名 |
| `-f, --format <format>` | `xmind`（默认）/ `json` / `markdown` / `png` / `pdf` |
| `--root-title <title>` | 覆盖中心主题标题 |
| `--central-color <hex>` | 中心主题颜色 |
| `--branch-colors <list>` | 一级主题配色，逗号分隔 |
| `--reverse` | 把 `.xmind` 反向转换为 Markdown |
| `--dry-run` | 只打印 IR，不写文件 |

### 网页端

```bash
npm run dev:web
```

然后浏览器打开 **http://localhost:5173/md/** —— 注意末尾的 `/md/` 路径。这是 `web/vite.config.ts` 里 `base: "/md/"` 决定的，直接访问 `http://localhost:5173/` 会 404。

构建静态产物（输出到 `web/dist`，可作纯前端站点直接部署，部署路径同样要对上 `/md/`）：

```bash
npm run build:web
```

界面细节、响应式与触屏适配、iframe 嵌入与宿主导出接管见 **[web/README.md](web/README.md)**。

### 库使用

```ts
import { convert, convertToIR, exportIR, parseXMind, irToMarkdown } from "md2any";

const buffer = await convert(markdownText, { rootTitle: "默认中心主题" }); // → .xmind 二进制
const ir = convertToIR(markdownText);                                     // → 中间表示
const json = await exportIR(ir, "json");                                  // IR → 任意格式
const md = irToMarkdown(await parseXMind(xmindBuffer));                   // .xmind → Markdown
```

> PNG / PDF 导出需要 Canvas 环境，从 `src/export/png.ts`、`src/export/pdf.ts` 单独导入（依赖 `@napi-rs/canvas`、`pdfkit`）。

## 目录结构

每个目录都有独立的说明文档，点进去看职责、文件清单与约定。

| 目录 | 职责 | 说明 |
| --- | --- | --- |
| `src/` | 核心库入口：`convert` / `convertToIR` / `exportIR`，Node 与浏览器共用 | [src/README.md](src/README.md) |
| `src/parser/` | Markdown → mdast（gfm + front-matter + 公式保护） | [README](src/parser/README.md) |
| `src/transform/` | mdast → IR（映射规则 + 后处理） | [README](src/transform/README.md) |
| `src/export/` | IR → `.xmind` / PNG / PDF / Markdown / JSON | [README](src/export/README.md) |
| `src/import/` | `.xmind` → IR | [README](src/import/README.md) |
| `src/render/` | 布局与画布绘制（导图、公式） | [README](src/render/README.md) |
| `src/theme/` | 配色与主题样式 | [README](src/theme/README.md) |
| `test/` | Vitest 全量测试与夹具 | [README](test/README.md) |
| `web/` | Vite 网页端：Markdown 预览与导出 | [README](web/README.md) |

## 架构

```
Markdown → parser（remark）→ transform（mdast → IR）→ IR
IR → export/xmindZen → .xmind
IR → export/png + pdf → PNG / PDF
IR → export/markdown → Markdown
IR → export/json → JSON
.xmind → import/xmind（unzip + 解析）→ IR
```

## 开发

```bash
npm test
npm run typecheck
npm run build
npm run build:web
npm run verify
```

| 命令 | 作用 |
| --- | --- |
| `npm test` | Vitest 全量测试 |
| `npm run typecheck` | `tsc --noEmit`（核心 + web） |
| `npm run build` | tsup 打包（cjs + esm + d.ts） |
| `npm run build:web` | 构建前端静态产物 |
| `npm run smoke` | 冒烟：加载 `dist/cli.cjs`，确认构建产物能跑起来 |
| `npm run verify` | 上面全跑一遍（类型 + 测试 + 构建 + 冒烟） |

> 冒烟这一步不是摆设：`unified` / `remark-*` 这类 ESM-only 依赖打成 CJS 后，`default` 导出会被多包一层，**源码直跑正常、构建产物直接崩**。`npm publish` 前会自动跑 `npm run build && npm run smoke` 挡住这种回归。

| 用途 | 依赖 |
| --- | --- |
| Markdown 解析 | `unified`、`remark-parse`、`remark-gfm`、`remark-frontmatter`、`js-yaml` |
| zip 打包 | `jszip`（Node 与浏览器通用） |
| CLI | `cac`、`picocolors` |
| Node 图像 / PDF | `@napi-rs/canvas`、`pdfkit` |
| Web | `vite`、`markdown-it`、`markdown-it-mathjax3`、`markmap-lib/view`、`mermaid`、`chart.js`、`jspdf`、`html2canvas` |
| 构建 / 测试 | `tsup`、`typescript`、`tsx`、`vitest` |

## 已知取舍

- 仅输出 XMind Zen / 2020+ 的 `content.json`；XMind 8 的 `content.xml` 只用于反向解析
- 标题一律输出纯文本，不写富文本，换取 XMind 客户端最大兼容性
- 图片以链接保留，不下载远端资源打包（避免 CLI 依赖网络、Web 受 CORS 限制）
- Markdown 纸张固定 A4 宽度，窄屏只做等比缩小，换来与导出一致的分页
- 公式由 `markdown-it-mathjax3` 以 MathJax SVG 排版；图表在导出（html2canvas）时 SVG 保真度有限，预览不受影响
