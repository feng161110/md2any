import type { MindMapIR, Sheet, TopicNode } from "../types.js";
import { DEFAULT_CENTRAL_COLOR, resolveBranchColors, topicStyle } from "../theme/colors.js";
import { tableToMarkdown } from "../transform/rules/block.js";
import type { TopicStyle } from "../theme/presets.js";

export interface XMindImage {
  src: string;
  width?: number;
  height?: number;
}

export interface XMindStyle {
  id: string;
  properties: Record<string, string | number>;
}

export interface XMindTopic {
  id: string;
  class: "topic";
  title: string;
  "structure-class"?: string;
  notes?: { plain: { content: string } };
  href?: string;
  image?: XMindImage;
  markers?: Array<{ markerId: string }>;
  style?: XMindStyle;
  children?: { attached: XMindTopic[] };
}

export interface XMindSheet {
  id: string;
  class: "sheet";
  title: string;
  rootTopic: XMindTopic;
  topicPositioning: "fixed";
}

export interface XMindExportOptions {
  centralColor?: string;
  branchColors?: string[];
  version?: string;
}

export const XMIND_FILES = {
  content: "content.json",
  metadata: "metadata.json",
  manifest: "manifest.json",
} as const;

/**
 * 布局 → XMind 的 structure-class。
 * 取值见 XMind Zen 的 content.json；缺省与自绘布局一致（左右两侧平衡）。
 */
const STRUCTURE_CLASS: Record<NonNullable<Sheet["layout"]>, string> = {
  "logic-right": "org.xmind.ui.logic.right",
  map: "org.xmind.ui.map.unbalanced",
  "org-chart": "org.xmind.ui.org-chart.down",
  "tree-left": "org.xmind.ui.tree.left",
};

export function irToXMindContent(ir: MindMapIR, options: XMindExportOptions = {}): XMindSheet[] {
  const centralColor = options.centralColor ?? DEFAULT_CENTRAL_COLOR;
  return ir.sheets.map((sheet, index) => {
    const branchColors = resolveBranchColors(
      (sheet.root.children ?? []).length,
      options.branchColors,
    );
    const rootTopic = topicToXMind(sheet.root, 0, -1, centralColor, branchColors);
    // 没有布局信息时保持左右平衡，和自绘（render/layout）的分边结果对齐
    rootTopic["structure-class"] =
      STRUCTURE_CLASS[sheet.layout ?? "map"] ?? STRUCTURE_CLASS.map;
    return {
      id: sheet.id ?? "sheet-" + (index + 1),
      class: "sheet" as const,
      title: sheet.title,
      rootTopic,
      topicPositioning: "fixed" as const,
    };
  });
}

export function buildXMindFiles(
  ir: MindMapIR,
  options: XMindExportOptions = {},
): Record<string, string> {
  const version = options.version ?? "0.1.0";
  const content = JSON.stringify(irToXMindContent(ir, options), null, 2);
  const metadata = JSON.stringify({ creator: { name: "md2any", version } }, null, 2);
  const manifest = JSON.stringify({
    "file-entries": {
      [XMIND_FILES.content]: {},
      [XMIND_FILES.metadata]: {},
    },
  }, null, 2);

  return {
    [XMIND_FILES.content]: content,
    [XMIND_FILES.metadata]: metadata,
    [XMIND_FILES.manifest]: manifest,
  };
}

function topicToXMind(
  topic: TopicNode,
  depth: number,
  branchIndex: number,
  centralColor: string,
  branchColors: string[],
): XMindTopic {
  const visual = topicStyle(centralColor, branchColors, depth, branchIndex);
  const result: XMindTopic = {
    id: topic.id ?? randomId(),
    class: "topic",
    title: topic.title,
    style: buildStyle(visual, depth),
  };

  const notes = topic.table ? tableToMarkdown(topic.table) : topic.note;
  if (notes) result.notes = { plain: { content: notes } };
  if (topic.href) result.href = topic.href;
  if (topic.image) result.image = topic.image;
  if (topic.markers?.length) {
    result.markers = topic.markers.map((markerId) => ({ markerId }));
  }
  const children = topic.children ?? [];
  if (children.length > 0) {
    result.children = {
      attached: children.map((child, index) =>
        topicToXMind(
          child,
          depth + 1,
          depth === 0 ? index : branchIndex,
          centralColor,
          branchColors,
        ),
      ),
    };
  }
  return result;
}

function buildStyle(style: TopicStyle, depth: number): XMindStyle {
  return {
    id: depth === 0 ? "md2any-central" : "md2any-level-" + depth,
    properties: {
      "svg:fill": style.fill,
      "color": style.color,
      "border-line-color": style.border,
      "border-line-width": style.lineWidth,
      "shape-class": style.shape,
      "font-size": style.fontSize,
      "fo:font-weight": style.bold ? "bold" : "normal",
      "line-class": "org.xmind.topicLine.rounded",
      "text-align": "center",
    },
  };
}

function randomId(): string {
  return "t" + Math.random().toString(36).slice(2, 10);
}
