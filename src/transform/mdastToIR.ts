import type { Heading, List, Root, RootContent } from "mdast";
import type { MindMapIR, Sheet, TopicNode } from "../types.js";
import type { ResolvedOptions } from "../config.js";
import { extractFrontmatter, pickString } from "../parser/frontmatter.js";
import { HeadingHierarchy } from "./rules/heading.js";
import { listToNodes } from "./rules/list.js";
import { collectImages, extractLink, toText, type ImageInfo } from "./rules/inline.js";
import { handleBlock } from "./rules/block.js";
import { lineOf } from "./rules/position.js";
import { postprocess } from "./postprocess.js";

export function mdastToIR(
  root: Root,
  options: ResolvedOptions,
  fallbackTitle = "Markdown",
): MindMapIR {
  const frontmatter = extractFrontmatter(root);
  const minDepth = findMinHeadingDepth(root);
  const rootTitle =
    options.rootTitle ??
    pickString(frontmatter, "title") ??
    firstHeadingText(root, minDepth) ??
    fallbackTitle;

  const sheet = createSheet(options, rootTitle);
  const hierarchy = new HeadingHierarchy(sheet.root);
  let rootHeadingConsumed = false;
  let bodyTopic: TopicNode | null = null;
  let bodyParent: TopicNode | null = null;

  for (const node of root.children) {
    const kind = node.type as string;
    if (kind === "yaml" || kind === "thematicBreak") continue;

    if (kind === "heading") {
      const heading = node as Heading;
      const text = toText(heading).trim();
      if (!text) continue;
      const link = extractLink(heading);
      if (!rootHeadingConsumed && heading.depth === minDepth && text === rootTitle) {
        rootHeadingConsumed = true;
        if (link && text === link.text) sheet.root.href = link.url;
        continue;
      }
      const topic: TopicNode = { title: text, line: lineOf(node) };
      if (link && text === link.text) topic.href = link.url;
      hierarchy.attach(heading.depth - minDepth + 1, topic);
      bodyTopic = null;
      bodyParent = null;
      continue;
    }

    if (kind === "list") {
      bodyTopic = null;
      bodyParent = null;
      appendChildren(hierarchy.current(), listToNodes(node as List));
      continue;
    }

    const target = hierarchy.current();

    if (kind === "paragraph") {
      const text = toText(node).trim();
      const images = collectImages(node);
      const link = extractLink(node);
      const imageText = images.length > 0 ? imageMarkdown(images) : "";

      if (link && text === link.text && images.length === 0) {
        if (!target.href) target.href = link.url;
        continue;
      }

      if (!text && imageText) {
        appendNote(target, imageText);
        continue;
      }

      if (!text) continue;

      if (bodyTopic && bodyParent === target) {
        bodyTopic.title = bodyTopic.title + "\n" + text;
        if (imageText) appendNote(bodyTopic, imageText);
        continue;
      }

      const topic: TopicNode = { title: text, line: lineOf(node) };
      if (imageText) topic.note = imageText;
      appendChildren(target, [topic]);
      bodyTopic = topic;
      bodyParent = target;
      continue;
    }

    bodyTopic = null;
    bodyParent = null;
    const result = handleBlock(node as RootContent);
    if (result.note) appendNote(target, result.note);
    if (result.children && result.children.length > 0) {
      appendChildren(target, result.children);
      bodyTopic = null;
      bodyParent = null;
    }
  }

  return postprocess({ sheets: [sheet], meta: { generator: "md2any" } }, options);
}

function imageMarkdown(images: ImageInfo[]): string {
  return images.map((image) => "![" + image.alt + "](" + image.url + ")").join("\n");
}

function createSheet(options: ResolvedOptions, rootTitle: string): Sheet {
  return {
    title: options.sheetTitle,
    root: { title: rootTitle, line: 0 },
    layout: options.layout,
    centralColor: options.centralColor,
  };
}

function findMinHeadingDepth(root: Root): number {
  let min = 7;
  for (const node of root.children) {
    if ((node.type as string) === "heading") {
      min = Math.min(min, (node as Heading).depth);
    }
  }
  return min === 7 ? 2 : min;
}

function firstHeadingText(root: Root, minDepth: number): string | undefined {
  for (const node of root.children) {
    if ((node.type as string) === "heading" && (node as Heading).depth === minDepth) {
      const text = toText(node as Heading).trim();
      if (text) return text;
    }
  }
  return undefined;
}

function appendChildren(parent: TopicNode, children: TopicNode[]): void {
  if (children.length === 0) return;
  parent.children = (parent.children ?? []).concat(children);
}

/**
 * 追加一段备注。
 *
 * 每段都是独立的 Markdown 块（引用 / 代码块 / 图片），用空行分隔：
 * 只换一行的话，下一块会被当成上一块的「惰性延续」并入同一个块，
 * 导出后二次解析会把两块内容粘在一起、甚至丢掉其中的图片。
 */
function appendNote(node: TopicNode, text: string): void {
  node.note = node.note ? node.note + "\n\n" + text : text;
}
