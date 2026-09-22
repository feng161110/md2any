import { describe, expect, it } from "vitest";
import { extractOuterSvg } from "../src/render/mathSvg";

/**
 * MathJax 对可伸缩元素（vmatrix 竖线、xrightarrow 箭头）会在内部再嵌一层 <svg>，
 * 非贪婪正则会截断成残缺 SVG，导致画布的 <img> 加载失败、公式退回原始 TeX。
 */
describe("extractOuterSvg", () => {
  it("takes the outermost svg when MathJax nests one inside", () => {
    const html = [
      '<span id="mjx-1"><style>#mjx-1{display:contents;}</style>',
      '<mjx-container><svg style="vertical-align: -2.1ex;" xmlns="http://www.w3.org/2000/svg"',
      ' width="16.249ex" height="5.43ex" viewBox="0 0 7182 2400">',
      '<g data-mml-node="mo"><svg width="2ex" height="5ex" viewBox="0 0 500 2000">',
      '<path d="M0 0"></path></svg></g>',
      '<g data-mml-node="mi"><path d="M1 1"></path></g>',
      "</svg></mjx-container></span>",
    ].join("");
    const svg = extractOuterSvg(html);
    expect(svg).not.toBeNull();
    // 内层 </svg> 不能被当成结尾：整棵树都要在
    expect(svg?.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('<path d="M1 1">');
    expect(svg?.match(/<svg/g)).toHaveLength(2);
    expect(svg?.match(/<\/svg>/g)).toHaveLength(2);
  });

  it("returns null when there is no svg or the tag is unbalanced", () => {
    expect(extractOuterSvg("<mjx-container>no svg here</mjx-container>")).toBeNull();
    expect(extractOuterSvg("<svg width='1ex'><g></g>")).toBeNull();
  });

  it("does not mistake a longer tag name for an svg element", () => {
    expect(extractOuterSvg("<svgfoo></svgfoo>")).toBeNull();
    expect(extractOuterSvg("<svgfoo></svgfoo><svg width='1ex'></svg>")).toBe(
      "<svg width='1ex'></svg>",
    );
  });
});
