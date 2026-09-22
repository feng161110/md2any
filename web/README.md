# web — 网页端（Markdown 预览与导出）

Vite 前端，复用 `../src` 的核心库（别名 `@core`）。这是项目的两个入口之一：**在浏览器里编辑 Markdown、实时预览、所见即所得导出**。

## 运行

首次使用，先在仓库根目录装依赖（只有第一次需要，**等它彻底跑完**再执行下面的命令）：

```bash
npm install
```

之后按需执行下面这一组 —— 三条互相独立，用哪条就跑哪条，不是依次执行：

```bash
npm run dev:web
npm run build:web
npm run preview:web
```

| 命令 | 作用 |
| --- | --- |
| `npm run dev:web` | 开发服务器 |
| `npm run build:web` | 构建静态产物到 `web/dist`，可作纯前端站点直接部署 |
| `npm run preview:web` | 本地预览构建产物 |

> **访问地址是 http://localhost:5173/md/**，末尾的 `/md/` 不能少 —— `vite.config.ts` 里 `base: "/md/"`，直接开根路径会 404。部署时站点也要挂在 `/md/` 下。

> 从 README 复制命令时注意别把行尾注释一起粘进去：Windows 上 `npm run` 走 cmd，`#` 不是注解字符，会被当成参数传给脚本（典型症状是 Vite 报 `The project root contains the "#" character`）。

## 目录

| 路径 | 作用 |
| --- | --- |
| `index.html` | 页面骨架：三视图、工具栏、分页导航、颜色选择器、导出面板 |
| `vite.config.ts` | `base: "/md/"`、`@core` → `../src`、target `es2022`（mathjax3 含顶层 await） |
| `tsconfig.json` | 前端类型检查（`npm run typecheck` 会连它一起跑） |
| [src/](src/README.md) | 页面逻辑（视图联动、导出编排、分页、手势） |
| `public/` | 静态资源原样拷到站点根，如示例插图 `md2any-sample.svg` |

> `public/` 里的文件会被**原样复制**进 `dist/`，所以那里只放真资源，不要放说明文档。

## 预览与导出的对应关系

| 预览视图 | 可导出格式 | 说明 |
| --- | --- | --- |
| XMind 预览 | `.xmind` | markmap 渲染，仅用于查看 |
| 导图预览 | `.xmind` / PNG / PDF | 与 `src/render` 同源，导出的图与预览逐像素一致 |
| Markdown 预览 | Markdown / JSON | A4 分页排版，导出 PDF / PNG 时按分页出图 |

## 响应式与触屏

| 形态 | 布局 | 说明 |
| --- | --- | --- |
| 桌面（> 1024px） | 左右两栏 | 38% 编辑区 + 预览区 |
| 横屏平板（901–1024px） | 左右两栏 | 预览头部放不下时自动换成两行，不横向滚动 |
| 竖屏平板 / 手机（≤ 900px） | 单栏 | 顶部「编辑 / 预览」切换，避免两栏各自过窄 |
| 手机（≤ 720px） | 单栏 | 额外收起副标题、页脚提示，标签用短名 |

命中区按**指针类型**给（`@media (pointer: coarse)`），不按屏宽 —— 平板天生是「宽屏 + 粗指针」，横屏 1024px 也还是手指在点：按钮 `--tap` 提到 44px，缩放、标签、分页条、配色色块统一放大，并给可点控件加 `touch-action: manipulation` 去掉双击缩放与点击延迟。XMind 预览与导图预览的平移 / 双指缩放由 pointer 事件接管，鼠标与触摸各走各的，平板无需额外适配。

## 嵌入 iframe（宿主页需要配合的部分）

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
  const data = event.data; // { type: "md2any:download", name, mime, size, blob }
  if (!data || data.type !== "md2any:download") return;
  const url = URL.createObjectURL(data.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = data.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  event.source.postMessage({ type: "md2any:download:done", name: data.name }, event.origin);
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
> 所以 xmind 这类二进制文件在 sandbox 里只有上面两条宿主配合的路。

## 移动端导出

**能直接下载就一律直接下载** —— 桌面、Android、iPhone / iPad 走的是同一条 `<a download>`，行为一致。只有宿主页确实拦了下载时才另找出口。

导出落到哪里由 `main.ts` 的 `deliverFile` 统一编排：

| 顺序 | 条件 | 出口 |
| --- | --- | --- |
| 1 | 宿主页拦了下载（`sandbox` 缺 `allow-downloads`，或跨源读不到属性）且宿主实现了接管 | 交给宿主页保存 |
| 2 | 同上，但宿主没接管、且设备支持文件分享 | 系统分享（沙箱里手机上唯一能落地的入口） |
| 3 | 其余情况 | `<a download>` 直接下载 |

若最终落在第 3 步、而宿主页 `sandbox` 明确拦了下载，则在当前界面展开「导出文件」面板兜底。

> 曾给 iOS 单独留过「提前开好标签页、再把它的地址设成 `blob:`」的兜底，结果苹果设备看到的是「跳转到一个 blob 页面」而不是下载，与预期相反 —— 已删除，现在代码里不再有 `window.open` 兜底。
