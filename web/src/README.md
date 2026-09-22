# web/src — 页面逻辑

| 文件 | 作用 |
| --- | --- |
| `main.ts` | 页面主逻辑：三视图切换、编辑区与预览联动、导出编排（`deliverFile`）、A4 分页交互、缩放与手势、深色模式、颜色选择器 |
| `md-extras.ts` | 预览端 markdown-it 扩展：任务列表、脚注、行内标记（`==高亮==`、`++插入++`、`^上标^`）、front-matter 面板、图表占位块 |
| `math-draw.ts` | 导图画布的公式绘制器：MathJax SVG → `drawImage`，通过 `MathPainter` 注入 `src/render/draw.ts` |
| `diagrams.ts` | mermaid / markmap / chart 三类占位块的渲染 |
| `pages.ts` | A4 分页算法：`paginate` 按容量装填、`clampCapacity` 限制页面拉伸范围、`pageTitles` 取页码标签 |
| `sample.md` | 首屏示例文稿，覆盖全部语法，可直接当模板改 |
| `style.css` | 全部样式与设计令牌 |

## 约定

- `main.ts` 是唯一的「胶水层」，其余模块尽量保持纯函数 —— 这样 `test/pages.spec.ts`、`test/web-md.spec.ts` 才能脱离 DOM 单测。
- 分页容量换算依赖 `style.css` 里的 `--page-width`（A4 宽度的唯一真源），改纸张尺寸要同时看这两处。
- 预览端的能力边界与核心库**刻意不一致**：这里渲染的是「给人看」的富文本（高亮、脚注、图表），导出到 XMind 时这些标记会保留原样，不追求与预览逐字一致。
