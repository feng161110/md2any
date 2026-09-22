# test/fixtures — 测试夹具

Markdown 样例与 `.xmind` 样例，全部由 `test/*.spec.ts` 通过 `readFixture("<文件名>")` 读取。

| 文件 | 用途 | 使用方 |
| --- | --- | --- |
| `basic.md` | 最小可用文档（1 个 H1 + 2 个 H2） | `convert` / `roundtrip` / `render` / `syntax` / `cli` |
| `basic-legacy.xmind` | XMind 8 旧版 `content.xml` 格式样例 | `cli.spec.ts`（反向转换） |
| `nested-list.md` | 多层嵌套列表 | `convert.spec.ts` |
| `no-h1.md` | 没有 H1，验证回退到首个标题 | `convert.spec.ts` |
| `mixed.md` | front-matter `title` + 任务列表 | `convert.spec.ts`、`roundtrip.spec.ts` |
| `long-paragraph.md` | 超长段落不截断 | `paragraph.spec.ts` |
| `syntax-full.md` | 语法大杂烩：代码块、引用、表格、链接、图片 | `syntax.spec.ts` |
| `comprehensive.md` | 公式全覆盖样例 | `parse-math.spec.ts` |

## 约定

- 新增夹具后，请在上表登记，并在对应 `*.spec.ts` 里引用。
- 夹具只放**被用例读取**的文件；一次性的临时样例直接写在用例里的字符串，不要落盘。
