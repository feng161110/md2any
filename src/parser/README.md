# src/parser — Markdown → mdast

把 Markdown 源码解析成标准 [mdast](https://github.com/syntax-tree/mdast) 语法树。这一层只负责「读」，不掺任何导图概念。

| 文件 | 作用 |
| --- | --- |
| `parseMarkdown.ts` | 组装 `unified` 流水线（`remark-parse` + `remark-gfm` + `remark-frontmatter`），产出 `Root` |
| `frontmatter.ts` | `extractFrontmatter` 取出整块 YAML，`pickString` 按点号路径取字符串值（如 `title`） |

## 为什么公式要单独保护

Markdown 会把 `*`、`_`、`{}`、`\` 当作标记吃掉，而公式里全是这些字符。`parseMarkdown` 在交给 remark **之前**先把数学片段（`$...$` / `$$...$$`）转义保护起来，解析完再还原 —— 否则 `$a*b*c$` 会被当成强调拆碎。

`test/parse-math.spec.ts` 专门盯着这件事：TeX 命令、`\{`、矩阵里的孤立 `=`（会被误认成 setext 标题）、以及代码块里不能重复转义。

## 约定

- 只输出 mdast，**不做剪裁与合并**：层级归并、`maxDepth` 折叠都归 [../transform/](../transform/README.md) 管。
