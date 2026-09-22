# src/theme — 配色与主题样式

| 文件 | 作用 |
| --- | --- |
| `colors.ts` | 默认配色 `DEFAULT_CENTRAL_COLOR` / `DEFAULT_BRANCH_COLORS`；`resolveBranchColors` 把用户给的配色补齐到实际分支数；`topicStyle` 按层级取样式；`hexToHsl` / `hslToHex` 等换算供网页色轮使用 |
| `presets.ts` | `TopicStyle` 接口与形状 / 字号常量（`TOPIC_SHAPE`）—— 中心主题与各级分支的外形在这里定义 |

配色对 `.xmind`、PNG、PDF、网页导图预览**同时生效**：CLI 用 `--central-color` / `--branch-colors`，网页用色轮点选，两条路最终都汇到 `resolveBranchColors`。

改配色只需要动这两个文件，不要在渲染或导出模块里写死颜色。
