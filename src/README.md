# src — 核心库

`src/` 是与运行环境无关的核心实现：把 Markdown 解析成一棵格式无关的 IR，再由各导出器把 IR 渲染成具体格式。整条链路不碰 DOM，**Node 与浏览器共用同一份代码** —— 这也是「网页预览所见即所得」的前提。

## 入口

| 文件 | 作用 |
| --- | --- |
| `index.ts` | 库入口：`convert` / `convertToIR` / `exportIR`，并 re-export 全部子模块 |
| `cli.ts` | 命令行入口（`cac` + `picocolors`），参数表见根 [README](../README.md) |
| `config.ts` | `ConvertOptions` → `ResolvedOptions`：默认值、`maxDepth`、`sheetTitle`、`layout` 的合并与校验 |
| `types.ts` | 公共类型：`MindMapIR`、`Sheet`、`TopicNode`、`TopicTable`、`ConvertOptions`、`ExportFormat` |

## 子目录

| 目录 | 职责 |
| --- | --- |
| [parser/](parser/README.md) | Markdown → mdast |
| [transform/](transform/README.md) | mdast → IR |
| [export/](export/README.md) | IR → `.xmind` / PNG / PDF / Markdown / JSON |
| [import/](import/README.md) | `.xmind` → IR |
| [render/](render/README.md) | 布局与画布绘制 |
| [theme/](theme/README.md) | 配色与主题样式常量 |

## 约定

- 内部 import 一律带 `.js` 后缀（NodeNext 风格），由 `tsup` 打包时解析 —— 重命名文件时记得同步引用。
- 只有 `cli.ts`、`export/png.ts`、`export/pdf.ts` 依赖 Node 内置模块 / Canvas；其余模块必须保持环境无关。
- IR 是唯一的「中间契约」：新增导出格式只需新增一个 export 模块，不要在 transform 里开格式相关的分支。
- 源码注释与文档用中文，标识符与 API 用英文。
