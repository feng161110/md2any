
export interface TopicTable {
  header: string[];
  rows: string[][];
}

export interface TopicNode {
  id?: string;
  title: string;
  children?: TopicNode[];
  note?: string;
  href?: string;
  image?: { src: string; width?: number; height?: number };
  labels?: string[];
  markers?: string[];
  line?: number;
  table?: TopicTable;
  folded?: boolean;
}

export interface Sheet {
  id?: string;
  title: string;
  root: TopicNode;
  layout?: "logic-right" | "map" | "org-chart" | "tree-left";
  centralColor?: string;
}

export interface MindMapIR {
  sheets: Sheet[];
  meta: {
    generator: string;
    createdAt?: string;
    source?: string;
  };
}

export type ExportFormat = "xmind" | "json" | "markdown" | "png" | "pdf";

export interface ConvertOptions {
  rootTitle?: string;
  layout?: Sheet["layout"];
  centralColor?: string;
  maxDepth?: number;
  sheetTitle?: string;
  source?: string;
  imageScale?: number;
  branchColors?: string[];
}
