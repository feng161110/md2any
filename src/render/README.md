# src/render — 布局与绘制

Node 与浏览器共用的渲染层：先算布局，再画到画布。网页「导图预览」和 CLI 的 PNG / PDF 导出走的是同一份代码，所以**预览与导出必然一致**。

| 文件 | 作用 |
| --- | --- |
| `layout.ts` | `layoutTree` 计算每个主题的位置与尺寸；`wrapText` 按宽度折行 |
| `draw.ts` | `drawMindMap` 实际绘制；`measureMindMapSize` / `createMeasure` 量文本尺寸；`MathPainter` 是公式绘制的插槽接口 |
| `mathText.ts` | `splitMathSegments` / `containsMathText`：把文本切成「普通文本 / 行内公式 / 块级公式」片段 |
| `mathSvg.ts` | `extractOuterSvg`：从 MathJax 产出的嵌套 SVG 里取出最外层那一个 |

## 关键设计

- **`draw.ts` 不认识 MathJax**：公式怎么排版由调用方通过 `MathPainter` 注入 —— Node 侧在 `export/png.ts` 里注入，浏览器侧在 `web/src/math-draw.ts` 里注入。核心渲染因此不绑定任何公式库。
- 公式片段先由 `mathText.ts` 标记出来，`wrapText` 再按片段折行，避免 `$` 与 `\` 被行宽切碎；`containsMathText` 决定一个主题是否要走公式渲染路径。
- 折行时要区分「货币金额 `$5`」和「真公式」，这个判断在 `mathText.ts` 里，`test/math-text.spec.ts` 有对应用例。
