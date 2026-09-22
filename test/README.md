# test — 测试

`vitest` 全量测试，`npm test` 运行。按「一条链路一个文件」组织：

| 文件 | 覆盖内容 |
| --- | --- |
| `convert.spec.ts` | mdast → IR：标题层级、列表嵌套、跳级标题、`maxDepth` 折叠、front-matter / 任务标记；以及 `.xmind` 打包与 CLI 端到端 |
| `syntax.spec.ts` | 语法覆盖：代码块 / 引用降级为 note、表格展开、链接转 href、图片进 note、主题样式写入 `content.json` |
| `line.spec.ts` | 源码行号映射（网页端点击定位依赖它） |
| `paragraph.spec.ts` | 连续段落合并、长段落不截断 |
| `parse-math.spec.ts` | 公式转义保护：`\` 命令、`{}`、`*`、setext 干扰、代码块不重复转义 |
| `math-text.spec.ts` | 公式片段切分与折行（含货币金额 `$5` 不误判） |
| `math-svg.spec.ts` | MathJax 嵌套 SVG 的取外层逻辑 |
| `render.spec.ts` | PNG / PDF 真实产出（尺寸、`%PDF` 头、换配色） |
| `roundtrip.spec.ts` | `.xmind` → IR → Markdown 往返一致性（新版 + XMind 8 旧版 + CLI 反向） |
| `pages.spec.ts` | A4 分页算法：容量装填、拉伸 / 收缩、标题对齐 |
| `web-md.spec.ts` | 预览端 markdown-it 扩展：任务列表、脚注、行内标记、公式、图表占位 |
| `web.spec.ts` | 网页端可导出格式与核心链路一致 |

## 约定

- 夹具统一放 [fixtures/](fixtures/README.md)，用 `readFixture("<名字>")` 读取，**不要写绝对路径**。
- CLI 相关用例会真起子进程（`npx tsx src/cli.ts`），所以超时给到 180s，整套跑完偏慢属正常。
- 新增语法支持时，请同时补 `test/fixtures/` 里的样例和本目录的用例。
