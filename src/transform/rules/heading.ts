import type { TopicNode } from "../../types.js";

export class HeadingHierarchy {
  private stack: TopicNode[] = [];

  constructor(private readonly root: TopicNode) {
    this.stack[0] = root;
  }

  /**
   * 挂载到第 level 层。
   *
   * Markdown 允许跳级（`##` 之后直接 `####`），此时 `stack[level - 1]` 是空的。
   * 若直接回退到 root，跳级标题会变成根的直接子节点、丢失父主题，
   * 所以这里找「不高于 level 的最近已存在的祖先」当父节点。
   */
  attach(level: number, node: TopicNode): TopicNode {
    const safeLevel = Math.max(1, level);
    const parent = this.nearest(safeLevel - 1);
    if (!parent.children) parent.children = [];
    parent.children.push(node);
    this.stack = this.stack.slice(0, safeLevel);
    this.stack[safeLevel] = node;
    return node;
  }

  /** stack 里下标 ≤ index 且最靠后的已存在节点（可能有跳级留下的空洞） */
  private nearest(index: number): TopicNode {
    for (let i = Math.min(index, this.stack.length - 1); i >= 0; i -= 1) {
      const node = this.stack[i];
      if (node) return node;
    }
    return this.root;
  }

  current(): TopicNode {
    for (let i = this.stack.length - 1; i >= 0; i -= 1) {
      const node = this.stack[i];
      if (node) return node;
    }
    return this.root;
  }
}
