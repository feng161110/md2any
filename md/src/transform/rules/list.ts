import type { List, ListItem } from "mdast";
import { collectImages, extractLink, toText } from "./inline.js";
import { lineOf } from "./position.js";
import type { TopicNode } from "../../types.js";

export function listToNodes(list: List): TopicNode[] {
  return list.children.map((item) => listItemToNode(item));
}

function listItemToNode(item: ListItem): TopicNode {
  const node: TopicNode = { title: "", line: lineOf(item) };
  const notes: string[] = [];
  let paragraphSeen = false;

  for (const child of item.children) {
    if (child.type === "paragraph" && !paragraphSeen) {
      paragraphSeen = true;
      node.title = toText(child).trim();
      const link = extractLink(child);
      if (link && node.title === link.text) node.href = link.url;
      for (const image of collectImages(child)) {
        notes.push("![" + image.alt + "](" + image.url + ")");
      }
    } else if (child.type === "list") {
      const nested = listToNodes(child);
      if (nested.length > 0) node.children = (node.children ?? []).concat(nested);
    } else {
      const text = toText(child).trim();
      if (text) notes.push(text);
    }
  }

  node.title = stripCheckbox(node.title, node);
  if (notes.length > 0) node.note = notes.join("\n");
  if (typeof item.checked === "boolean") {
    node.markers = [item.checked ? "task-done" : "task-start"];
  }
  return node;
}

function stripCheckbox(title: string, node: TopicNode): string {
  const matched = /^\[( |x|X)\]\s*/.exec(title);
  if (!matched) return title;
  if (!node.markers) {
    node.markers = [matched[1] === " " ? "task-start" : "task-done"];
  }
  return title.slice(matched[0].length).trim();
}
