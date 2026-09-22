# src/transform — mdast → IR

把语法制导的 mdast 转成与格式无关的 IR（`MindMapIR`）。这是全项目唯一的「Markdown 语义 → 思维导图语义」翻译层。

| 文件 | 作用 |
| --- | --- |
| `mdastToIR.ts` | 主循环：按节点类型分派到 `rules/`，维护标题层级栈，读取 front-matter 标题 |
| `postprocess.ts` | 收尾：补全 id / 空标题，按 `maxDepth` 把过深内容折进父节点 `note`，保证不丢内容 |
| `rules/` | 各类节点的具体映射规则，见 [rules/README.md](rules/README.md) |

## 映射要点

- 首个 `# H1`（或 front-matter `title`）作中心主题；与中心同名的 H1 并进去，不重复出分支
- `##`~`######` 与列表缩进**共用同一套层级**：跳级标题挂到最近的祖先，不掉回根
- 段落成为一个子主题；引用、代码块整块并入 topic 的 `note`（保留 Markdown 源码）
- 表格转成 `TopicTable`，同时在 `note` 里留一份 Markdown 表格
- 每个节点记录源码行号，供网页端「预览点击 → 定位编辑区」使用

## 约定

- 映射规则必须放进 `rules/` 且保持纯函数，方便单测（`test/convert.spec.ts`、`test/paragraph.spec.ts`）。
- 这里**不关心输出格式**：任何「XMind 才有的东西」（如 structure-class、主题样式 id）都留给 `export/` 决定。
