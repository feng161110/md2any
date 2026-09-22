export interface TopicStyle {
  fill: string;
  color: string;
  border: string;
  shape: string;
  fontSize: number;
  lineWidth: number;
  bold: boolean;
}

export const TOPIC_SHAPE = {
  roundedRect: "org.xmind.topicShape.roundedRect",
  rect: "org.xmind.topicShape.rect",
  pill: "org.xmind.topicShape.pill",
  underline: "org.xmind.topicShape.underline",
} as const;
