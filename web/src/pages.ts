export interface PageBlock {
  /** 该块占用的高度（含与下一块之间的间距） */
  height: number;
  /** 标签名（小写），用于识别标题 */
  tag: string;
  /** 源 Markdown 行号，用于跳转与标识 */
  line: number;
}

export interface PageSlice {
  /** 该页包含的块索引区间 [start, end) */
  start: number;
  end: number;
  /** 实际占用高度 */
  used: number;
  /** 该页容量（页高） */
  capacity: number;
}

export interface PaginateOptions {
  /** 默认页容量（即一页的可用高度） */
  defaultCapacity: number;
  /** 用户逐页调整过的容量，索引对应页序号；缺失则用默认值 */
  capacities?: number[];
  /** 页容量下限倍率（相对默认值） */
  minRatio?: number;
  /** 页容量上限倍率（相对默认值） */
  maxRatio?: number;
  maxPages?: number;
  /**
   * 智能配页：为了把断点让到标题之前，页高相对基准允许的下浮比例。
   * 对齐会让页尾留白，所以低于这个比例就不对齐了，免得页面被切得又短又多。
   */
  smartMinRatio?: number;
  /**
   * 智能配页：页高相对基准允许的上浮比例。默认 1 —— 纸张恒为基准大小（A4），
   * 一页装不下就换页；调到 1.1 之类可以让「一节的尾巴」留在本页（该页会变高）。
   */
  smartMaxRatio?: number;
  /** 智能配页时视为「可分页边界」的块标签，默认 h1～h3 */
  breakTags?: string[];
}

/** 把页面容量夹在允许区间内（默认 0.3×～3×） */
export function clampCapacity(
  value: number | undefined,
  defaultCapacity: number,
  minRatio = 0.3,
  maxRatio = 3,
): number {
  const min = defaultCapacity * minRatio;
  const max = defaultCapacity * maxRatio;
  const target = Number.isFinite(value) ? (value as number) : defaultCapacity;
  return Math.min(max, Math.max(min, target));
}

/** 智能配页里给「必须变高的页」留的页尾余量（与容量计算里的余量同量级） */
const SMART_SLACK = 6;
const DEFAULT_BREAK_TAGS = ["h1", "h2", "h3"];

/** 从 start 起按容量装填，返回装到哪、用了多高；首块一定收下，所以永远不会原地打转 */
function fillTo(
  blocks: PageBlock[],
  start: number,
  limit: number,
): { end: number; used: number } {
  let end = start;
  let used = 0;
  while (end < blocks.length) {
    const next = used + blocks[end].height;
    if (used > 0 && next > limit + 0.5) break;
    used = next;
    end += 1;
    if (used > limit) break; // 单块超上限：独占一页
  }
  return { end, used };
}

function sumHeights(blocks: PageBlock[], start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i += 1) total += blocks[i].height;
  return total;
}

/**
 * 在 [start, end) 里找最靠后的「可在其前面断页的标题」下标：断在它之前，下一页就从标题开始，
 * 标题也不会孤零零留在页尾。收尾后本页高度不能低于 floor，否则宁可不对齐
 * ——对齐的代价是多分一页，不能为了好看把页面切碎。找不到合适的就返回 0。
 */
function headingBreak(
  blocks: PageBlock[],
  start: number,
  end: number,
  floor: number,
  breakTags: string[],
): number {
  let height = sumHeights(blocks, start, end);
  for (let cut = end - 1; cut > start; cut -= 1) {
    height -= blocks[cut].height;
    if (height >= floor && breakTags.includes(blocks[cut].tag)) return cut;
  }
  return 0;
}

/**
 * 按"每页容量"把内容块顺序分配到各页，并尽量把断点让到标题上。
 *
 * 与"给定断点"的做法不同，这里是**按容量装填**：
 * 拖动页边界改变的正是某一页的容量，装填结果随之变化，后面的内容自然前后移动。
 *
 * 三步走：
 * 1. **装填**：在「允许的最高页高」内尽量多装（默认上限就是基准，即一页一张 A4）；
 * 2. **对齐**：如果本页能在某个标题之前收尾，就把断点挪到那里（挑最靠后、也就是最满的那个），
 *    下一页于是从标题开始；没有合适标题时按基准容量装填；
 * 3. **定高**：页高恒为基准（A4 纸张大小统一），页尾留白不另作补偿。
 *
 * 手动拖过高度的页（capacities 里有值）完全按用户给的高度装填，不参与对齐。
 *
 * 另外三条硬规则：
 * 1. 每页至少放一个块（单个块超过容量时独占一页，不会被无限循环卡住）；
 * 2. 放不下下一个块就在此断页，因此不会把块切一半；
 * 3. 容量受 minRatio / maxRatio 约束（默认 0.3×～3× 默认高度）。
 * 唯一会让纸张变高的例外：单个块本身就比一页还高 —— 这时宁可这张纸长一点，
 * 也不把它裁掉。
 */
export function paginate(blocks: PageBlock[], options: PaginateOptions): PageSlice[] {
  const {
    defaultCapacity,
    capacities = [],
    minRatio = 0.3,
    maxRatio = 3,
    maxPages = 500,
    smartMinRatio = 0.9,
    smartMaxRatio = 1,
    breakTags = DEFAULT_BREAK_TAGS,
  } = options;
  const slices: PageSlice[] = [];
  let index = 0;

  while (index < blocks.length && slices.length < maxPages) {
    const requested = capacities[slices.length];
    const fixed = Number.isFinite(requested);
    const base = clampCapacity(requested, defaultCapacity, minRatio, maxRatio);
    const start = index;

    // 1) 装填：手动定高的页按用户高度装，其余按允许的最高页高装
    const window = fillTo(blocks, start, fixed ? base : base * smartMaxRatio);
    let end = window.end;

    // 2) 对齐：末页没有下一页，不必对齐
    if (!fixed && end < blocks.length) {
      const cut = headingBreak(blocks, start, end, base * smartMinRatio, breakTags);
      if (cut > start) end = cut;
    }

    // 3) 定高：恒定基准（A4）；只有单个块本身超高时才长到刚好装下
    const used = sumHeights(blocks, start, end);
    const capacity = used > base ? used + SMART_SLACK : base;
    slices.push({ start, end, used, capacity });
    index = end;
  }

  return slices;
}

/** 每页的标题：取该页第一个标题块，否则取第一个块，用于右侧页面导航 */
export function pageTitles(blocks: PageBlock[], slices: PageSlice[]): string[] {
  return slices.map((slice) => {
    const sliceBlocks = blocks.slice(slice.start, slice.end);
    const heading = sliceBlocks.find((block) => /^h[1-6]$/.test(block.tag));
    const picked = heading ?? sliceBlocks[0];
    return picked ? picked.tag.toUpperCase() : "";
  });
}
