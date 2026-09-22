# src/import — `.xmind` → IR

| 文件 | 作用 |
| --- | --- |
| `xmind.ts` | `parseXMind`：解压 `.xmind` 后按版本分流 —— 新版读 `content.json`，XMind 8 旧版读 `content.xml`（`fast-xml-parser`），两种都还原成 IR |

拿到 IR 后，走 [../export/markdown](../export/README.md) 就能得到 Markdown —— 这就是 CLI `--reverse` 的完整路径。

`test/roundtrip.spec.ts` 用往返用例守着这条链：**Markdown → `.xmind` → Markdown** 不丢层级、不涨层级、表格与任务标记都能回来。
