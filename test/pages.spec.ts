import { describe, expect, it } from "vitest";
import { clampCapacity, pageTitles, paginate, type PageBlock } from "../web/src/pages";

const block = (height: number, tag = "p", line = 0): PageBlock => ({ height, tag, line });

describe("clampCapacity", () => {
  it("falls back to the default when no override is given", () => {
    expect(clampCapacity(undefined, 1000)).toBe(1000);
  });

  it("clamps into the 0.3x - 3x window", () => {
    expect(clampCapacity(100, 1000)).toBe(300);
    expect(clampCapacity(9999, 1000)).toBe(3000);
    expect(clampCapacity(1500, 1000)).toBe(1500);
  });
});

describe("paginate", () => {
  it("fills each page up to the default capacity", () => {
    const blocks = [block(100), block(100), block(100), block(100)];
    const slices = paginate(blocks, { defaultCapacity: 250 });
    expect(slices.length).toBe(2);
    expect(slices[0]).toMatchObject({ start: 0, end: 2, used: 200 });
    expect(slices[1]).toMatchObject({ start: 2, end: 4 });
  });

  it("pushes content to later pages when a page is stretched", () => {
    const blocks = [block(100), block(100), block(100), block(100)];
    const slices = paginate(blocks, { defaultCapacity: 250, capacities: [400] });
    expect(slices.length).toBe(1);
    expect(slices[0]).toMatchObject({ start: 0, end: 4, capacity: 400 });
  });

  it("pulls content back to earlier pages when a page is shrunk", () => {
    const blocks = [block(100), block(100), block(100), block(100)];
    const slices = paginate(blocks, { defaultCapacity: 250, capacities: [120, 120, 120] });
    expect(slices.length).toBe(4);
    expect(slices[0]).toMatchObject({ start: 0, end: 1, capacity: 120 });
  });

  it("gives an oversized block a page of its own", () => {
    const blocks = [block(900), block(50)];
    const slices = paginate(blocks, { defaultCapacity: 400 });
    expect(slices[0]).toMatchObject({ start: 0, end: 1 });
    expect(slices[1]).toMatchObject({ start: 1, end: 2 });
  });

  it("returns an empty plan for empty content", () => {
    expect(paginate([], { defaultCapacity: 300 })).toEqual([]);
  });
});

describe("paginate smart matching", () => {
  const heading = (height: number, tag = "h2", line = 0): PageBlock => ({ height, tag, line });

  it("moves a subheading to the next page instead of letting it hang at the tail", () => {
    const blocks = [block(900), heading(40), block(600)];
    const slices = paginate(blocks, { defaultCapacity: 1000 });
    expect(slices[0]).toMatchObject({ start: 0, end: 1, used: 900, capacity: 1000 });
    expect(slices[1]).toMatchObject({ start: 1, end: 3, used: 640, capacity: 1000 });
  });

  it("keeps the base height when the page already ends before a subheading", () => {
    const blocks = [block(950), heading(50), block(950)];
    const slices = paginate(blocks, { defaultCapacity: 1000 });
    expect(slices[0]).toMatchObject({ start: 0, end: 1, used: 950, capacity: 1000 });
    expect(slices[1]).toMatchObject({ start: 1, end: 3, capacity: 1000 });
  });

  it("keeps every page at the base (A4) height instead of growing for a section tail", () => {
    const blocks = [block(1000), block(150), heading(30), block(600)];
    const slices = paginate(blocks, { defaultCapacity: 1000 });
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ start: 0, end: 1, used: 1000, capacity: 1000 });
    expect(slices[1]).toMatchObject({ start: 1, end: 4, used: 780, capacity: 1000 });
  });

  it("lets the paper grow only for a single block taller than a page", () => {
    const blocks = [block(1400), block(50)];
    const slices = paginate(blocks, { defaultCapacity: 1000 });
    expect(slices[0]).toMatchObject({ start: 0, end: 1, used: 1400, capacity: 1406 });
    expect(slices[1]).toMatchObject({ start: 1, end: 2, capacity: 1000 });
  });

  it("does not shave a page down to an alignment that wastes too much space", () => {
    const blocks = [block(400), heading(50), block(400), block(400)];
    const slices = paginate(blocks, { defaultCapacity: 1000 });
    expect(slices[0]).toMatchObject({ start: 0, end: 3, used: 850, capacity: 1000 });
  });

  it("ignores headings below the break level", () => {
    const blocks = [block(600), heading(50, "h4"), block(600)];
    const slices = paginate(blocks, { defaultCapacity: 1000 });
    expect(slices[0]).toMatchObject({ start: 0, end: 2, used: 650 });
  });

  it("still honours a manually dragged page height", () => {
    const blocks = [block(300), heading(50), block(300), block(300)];
    const slices = paginate(blocks, { defaultCapacity: 1000, capacities: [500] });
    expect(slices[0]).toMatchObject({ start: 0, end: 2, used: 350, capacity: 500 });
  });
});

describe("pageTitles", () => {
  it("labels a page with its first heading when there is one", () => {
    const blocks = [block(10, "p"), block(10, "h2"), block(10, "p")];
    const slices = paginate(blocks, { defaultCapacity: 300 });
    expect(pageTitles(blocks, slices)).toEqual(["H2"]);
  });
});
