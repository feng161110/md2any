# src/transform/rules — 节点映射规则

按 mdast 节点类型拆分的映射规则，一个文件只负责一类节点，全部是纯函数 / 纯状态机。

| 文件 | 映射对象 | 产出 |
| --- | --- | --- |
| `heading.ts` | `heading` | `HeadingHierarchy` 类：维护祖先栈，决定新标题挂到哪一层（跳级时挂最近的祖先） |
| `list.ts` | `list` / `listItem` | 递归成子节点；任务列表写 `task-done` / `task-start` 标记 |
| `block.ts` | `blockquote` / `code` / `html` / `table` | 整块内容进 `note`；表格转 `TopicTable`；导出 `tableToMarkdown` 供 Markdown 导出复用 |
| `inline.ts` | 行内节点 | `toText` 取纯文本、`extractLink` 取整行链接的 href、`collectImages` 收集图片 |
| `position.ts` | 全部 | `lineOf` 把 mdast 的 1-based 行号转成 0-based，供前端定位 |

## 注意

- `rules/` 之间只允许单向依赖（`list` / `block` → `inline` / `position`），不要互相递归引用。
- `tableToMarkdown` 同时被 `export/markdown.ts` 和 `export/xmindZen.ts` 使用，改动会影响反向转换的往返一致性 —— 改完跑 `test/roundtrip.spec.ts`。
