# md2xmind

把 Markdown 一键转换成 XMind 思维导图（`.xmind`），支持导出 PNG / PDF / Markdown / JSON，以及 `.xmind` 反向转回 Markdown。

设计原则：**解析（Markdown）与导出（格式）彻底解耦**，中间用一层格式无关的 IR（中间表示）衔接——新增导出格式、渲染后端或输入源，都不必改动核心转换逻辑。

## 特性

- **结构映射**：标题层级与缩进列表自动转成导图层级，自动推断中心主题
- **全量语法**：标题、有序/无序/嵌套/任务列表、链接、图片、代码块、表格、引用、Front-matter
- **多格式导出**：`.xmind`（XMind Zen / 2020+）、PNG、PDF、Markdown、JSON
- **双向工作流**：`.xmind → Markdown` 反向解析，新版 `content.json` 与 XMind 8 旧版 `content.xml` 都支持
- **配色自定义**：中心主题与一级主题独立配色（CLI 参数 / 网页色轮）
- **Web 界面**：三视图预览（markmap 交互图 / 自绘导图 / A4 纸张分页）、所见即所得导出、公式（MathJax）与图表（Mermaid / Markmap / Chart.js）渲染、深色模式、移动端适配

## 快速开始

```bash
npm install
```

### CLI

```bash
npx md2xmind ./note.md                          # → .xmind（与源文件同目录同名）
npx md2xmind ./note.md -o ./out/note.xmind      # 指定输出路径
npx md2xmind ./note.md --root-title "读书笔记"   # 指定中心主题名
npx md2xmind ./note.md -f png -o ./out/note.png # 导出 PNG / PDF
npx md2xmind ./note.md --dry-run                # 只打印 IR，不写文件
npx md2xmind ./out/note.xmind --reverse -o ./note.md  # 反向：.xmind → Markdown
```

| 参数 | 说明 |
| --- | --- |
| `-o, --output <path>` | 输出路径，缺省与输入同目录同名 |
| `-f, --format <format>` | `xmind`（默认）/ `json` / `markdown` / `png` / `pdf` |
| `--root-title <title>` | 覆盖中心主题标题 |
| `--central-color <hex>` | 中心主题颜色 |
| `--branch-colors <list>` | 一级主题配色，逗号分隔 |
| `--reverse` | 把 `.xmind` 反向转换为 Markdown |
| `--dry-run` | 只打印 IR，不写文件 |

### Web 页面

```bash
npm run dev:web     # 本地开发，默认 http://localhost:5173
npm run build:web   # 构建静态产物到 web/dist，可作纯前端站点直接部署
```

支持拖拽 / 选择导入 `.md`，左侧编辑、右侧预览，导出格式随预览视图联动（所见即所得）。

响应式与触屏：

| 形态 | 布局 | 说明 |
| --- | --- | --- |
| 桌面（> 1024px） | 左右两栏 | 38% 编辑区 + 预览区 |
| 横屏平板（901–1024px） | 左右两栏 | 预览头部放不下时自动换成两行，不横向滚动 |
| 竖屏平板 / 手机（≤ 900px） | 单栏 | 顶部「编辑 / 预览」切换，避免两栏各自过窄 |
| 手机（≤ 720px） | 单栏 | 额外收起副标题、页脚提示，标签用短名 |

命中区按**指针类型**给（`@media (pointer: coarse)`），不按屏宽 —— 平板天生是「宽屏 + 粗指针」，横屏 1024px 也还是手指在点：按钮 `--tap` 提到 44px，缩放、标签、分页条、配色色块统一放大，并给可点控件加 `touch-action: manipulation` 去掉双击缩放与点击延迟。XMind 预览与导图预览的平移 / 双指缩放由 pointer 事件接管，鼠标与触摸各走各的，平板无需额外适配。

### 嵌入 iframe（宿主页需要配合的部分）

被 iframe 嵌入时，子页面里的下载会被宿主页的 `sandbox` 规则拦掉：`sandbox` 少了 `allow-downloads`，浏览器会**直接丢弃这次下载**，只在控制台留一句

```
Download is disallowed. The frame initiating or instantiating the download is sandboxed,
but the flag 'allow-downloads' is not set.
```

页面上毫无反应 —— 这就是「嵌进去以后点了导出没动静」的原因。纯前端应用没法绕过这条规则，所以提供两条互补的路：

**其一：给 iframe 补上标志（宿主页改一行）**

```html
<iframe
  src="https://your.site/md/"
  allow="web-share"
  sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox"
></iframe>
```

| 标志 | 作用 |
| --- | --- |
| `allow-downloads` | 让子页面自己下载；缺了它导出按钮点了没反应 |
| `allow-popups` / `allow-popups-to-escape-sandbox` | 让提示条里的「在新标签页打开」这个手动出口可用 |
| `allow="web-share"` | 手机端才用得上系统分享（跨源 iframe 里 `navigator.share` 需要这个授权，没有就自动跳过） |

**其二：宿主页接管下载（sandbox 改不动时用这条）**

导出时应用会先把文件 `postMessage` 给父页面，父页面回执即视为已接管；父页面自己不在沙箱里，下载不受限。宿主页加这几行即可：

```js
window.addEventListener("message", (event) => {
  const data = event.data; // { type: "md2xmind:download", name, mime, size, blob }
  if (!data || data.type !== "md2xmind:download") return;
  const url = URL.createObjectURL(data.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = data.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  event.source.postMessage({ type: "md2xmind:download:done", name: data.name }, event.origin);
});
```

回执要在 **500ms** 内到达，超时应用就按下不表、继续走自己的兜底。

**两条都没生效时**：只有当宿主 iframe 的 `sandbox` **明确拦了下载**（写了 `sandbox` 却缺 `allow-downloads`；同源嵌入时应用能通过 `frameElement` 读到这个属性）才会展开下面的「导出文件」面板 —— 宿主放行下载、或没写 `sandbox`、或跨源读不到属性时，都直接下载、不打扰用户。面板按类型给出就地保存的方式：

| 类型 | 面板内容 | 就地保存方式 |
| --- | --- | --- |
| PNG | 原图 `<img>` | 长按图片（手机）/ 右键（电脑）→ 另存为 |
| PDF | `<iframe>` 浏览器查看器 | 查看器自带的下载 / 打印 |
| Markdown / JSON | 文本 + 「复制内容」 | 框选复制或点复制 |
| XMind 等二进制 | 文件名 + 大小 + 「下载文件」 | 需要宿主页放开下载（见上表） |

> 实测结论：**新开标签页和当前界面导航都绕不过沙箱** —— 拦的是「下载」这个行为本身，不是打开方式。
> 在 `sandbox` 缺 `allow-downloads` 时，`location.href = blob:` 同样被取消（控制台仍是
> `Download is disallowed`）；换成 PDF / PNG 虽然能在当前 frame 渲染出来，但会把应用整个顶掉。
> 所以 xmind 这类二进制文件在sandbox 里只有上面两条宿主配合的路。

移动端导出：**能直接下载就一律直接下载** —— 桌面、Android、iPhone / iPad 走的是同一条 `<a download>`，行为一致。只有宿主页确实拦了下载时才另找出口（见下面的 `deliverFile` 顺序）。

导出落到哪里由 `deliverFile` 统一编排：

| 顺序 | 条件 | 出口 |
| --- | --- | --- |
| 1 | 宿主页拦了下载（`sandbox` 缺 `allow-downloads`，或跨源读不到属性）且宿主实现了接管 | 交给宿主页保存 |
| 2 | 同上，但宿主没接管、且设备支持文件分享 | 系统分享（沙箱里手机上唯一能落地的入口） |
| 3 | 其余情况 | `<a download>` 直接下载 |

若最终落在第 3 步、而宿主页 `sandbox` 明确拦了下载，则在当前界面展开「导出文件」面板兜底。

> 曾给 iOS 单独留过「提前开好标签页、再把它的地址设成 `blob:`」的兜底，结果苹果设备看到的是「跳转到一个 blob 页面」而不是下载，与预期相反 —— 已删除，现在代码里不再有 `window.open` 兜底。

### 库使用

```ts
import { convert, convertToIR, exportIR, parseXMind, irToMarkdown } from 'md2xmind';

const buffer = await convert(markdownText, { rootTitle: '默认中心主题' }); // → .xmind 二进制
const ir = convertToIR(markdownText);                                     // → 中间表示
const json = await exportIR(ir, 'json');                                  // IR → 任意格式
const md = irToMarkdown(await parseXMind(xmindBuffer));                   // .xmind → Markdown
```

> PNG / PDF 导出需要 Canvas 环境，由 `src/export/png.ts`、`src/export/pdf.ts` 提供（依赖 `@napi-rs/canvas`、`pdfkit`）。

## 目录结构

```
md2xmind/
├─ src/
│  ├─ index.ts               # 库入口：convert / convertToIR / exportIR / parseXMind / irToMarkdown
│  ├─ types.ts               # IR 与配置类型
│  ├─ config.ts              # 默认配置解析与合并
│  ├─ cli.ts                 # 命令行入口（cac）
│  ├─ parser/                # remark → mdast（gfm + frontmatter、公式转义保护）
│  ├─ transform/             # mdast → IR（规则 + 后处理）
│  ├─ export/                # xmind / json / markdown / png / pdf 导出
│  ├─ import/                # .xmind → IR（新版 JSON 与旧版 XML）
│  ├─ render/                # 布局与画布绘制（Node 与浏览器共用）
│  └─ theme/                 # 配色与主题常量
├─ test/
│  ├─ fixtures/              # Markdown 样例 + 旧版 xmind 样例
│  └─ *.spec.ts              # 转换 / 语法 / 渲染 / 往返 / CLI / Web
└─ web/                      # Vite 前端（复用 src/ 核心）
   ├─ index.html
   ├─ vite.config.ts         # @core 别名指向 src/
   ├─ public/                # 示例用到的本地图片（如 md2xmind-sample.svg）
   └─ src/
      ├─ main.ts             # 页面逻辑：三视图、导出、分页、手势
      ├─ md-extras.ts        # 预览端 markdown-it 扩展（任务列表 / 脚注 / 公式 / 行内标记）
      ├─ math-draw.ts        # 导图画布的公式绘制器（MathJax SVG → drawImage）
      ├─ diagrams.ts         # mermaid / markmap / chart 占位块渲染
      ├─ pages.ts            # A4 分页算法：按容量装填 + 标题对齐
      ├─ sample.md           # 首屏演示文稿：覆盖全部语法，可直接当模板改
      └─ style.css
```

## 架构

```
Markdown → parser（remark）→ transformer（mdast → IR）→ IR
IR → exporter → .xmind / JSON / Markdown
IR → renderer（layout + draw）→ PNG / PDF
.xmind → importer（unzip + 解析）→ IR
```

Markdown → 思维导图的核心映射：首个 `# H1`（或 Front-matter `title`）作中心主题；`##`~`######` 与列表缩进映射层级（跳级标题挂到最近的祖先）；任务列表加勾选图标；链接 / 图片挂到主题；段落成为子主题，引用与代码块并入主题备注；表格渲染为真实表格。`layout` 决定 `.xmind` 的 `structure-class`（默认 `map`，与自绘预览一致）。

## 开发

```bash
npm test           # Vitest 全量测试
npm run typecheck  # tsc --noEmit（核心 + web）
npm run build      # tsup 打包（cjs + esm + d.ts）
npm run build:web  # 构建前端静态产物
```

主要依赖：

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
