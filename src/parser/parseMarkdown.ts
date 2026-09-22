import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type { Root } from "mdast";

/**
 * 拆掉打包器的 default 包装，取回真正的插件函数。
 *
 * `remark-parse` / `remark-gfm` / `remark-frontmatter` 都是 ESM-only 包。
 * tsup 打成 CJS 时，esbuild 会用 `__toESM(require(mod), 1)` 转换，而 `default`
 * 这一项会停在「模块命名空间对象」上、不再往下取一层，于是 `.use()` 收到的是
 * `{ default: 插件 }` 而不是插件本身，unified 直接抛：
 *
 *   Expected usable value but received an empty preset
 *
 * 这个错只在构建产物里出现（`tsx` 直跑源码、ESM 产物都正常），所以必须在这里兜住。
 * 三种情形下都成立：源码里是函数、CJS 产物里是命名空间（取其 default）、
 * 若上游某天改成 CJS 则原样返回。
 */
function asPlugin<T>(plugin: T): T {
  const boxed = plugin as { default?: T } | null;
  return boxed && typeof boxed === "object" && boxed.default ? boxed.default : plugin;
}

const processor = unified()
  .use(asPlugin(remarkParse))
  .use(asPlugin(remarkGfm))
  .use(asPlugin(remarkFrontmatter), ["yaml"]);

export function parseMarkdown(markdown: string): Root {
  return processor.parse(protectMathEscapes(markdown));
}

/**
 * 私有区字符，用作占位定界符：remark/micromark 不会转义或替换它
 * （只有 U+0000 NUL 会被替换成 U+FFFD），正常文档里几乎不可能出现。
 */
const MARK = "\uE000";

/**
 * 公式里会被 CommonMark / GFM 当成行内标记的 ASCII 标点：
 * `*` `_` 强调、`` ` `` 行内代码、`[` `]` 链接、`!` 图片、`<` 自动链接 / HTML、
 * `&` 字符引用、`~` 删除线、`|` 表格分列。
 *
 * 典型故障：`L^{p^*}(\mathbb R^n) … \frac1{p^*}` 里的两个 `*` 会被当成一组强调，
 * 标记被吃掉后 TeX 变成 `p^`，MathJax 直接报错、KaTeX 抛
 * "Expected group after '^'"。
 */
const MATH_MARKUP_PUNCTUATION = /[*_`[\]<&!~|]/g;

/**
 * remark-parse 遵循 CommonMark，会把 `\` + ASCII 标点转义成标点本身
 * （`\,`→`,`、`\{`→`{`、`\_`→`_`），这会破坏 `$…$` / `$$…$$` 里的 TeX 命令
 * （如 `\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}` 里的 `\,`）。
 *
 * 这里在解析前把公式段内的每个 `\` 双写成 `\\`：remark 转义后 `\\`→`\`，
 * 公式 TeX 原样还原；`\` + 字母（`\int`）转义后同样还原，两种情形都成立。
 * 同时给公式里的行内标记标点补一个 `\`（`*`→`\*`），remark 转义后同样还原成
 * 原字符，但不会再参与强调 / 链接 / 表格等行内解析。只做同字符替换、不引入换行，
 * 因此行号（`lineOf`）不受影响。
 *
 * 此外，块级 `$$…$$` 内部单独成行的 `=` / `-` 会被 remark 当作 setext 标题底线
 * （上一行被并成标题、公式被拆成多个节点，如矩阵乘法的等号行）。这里给这些行
 * 前缀一个 `\` 转义（`\=` / `\-`），remark 转义后原样还原，公式保持为一个段落。
 *
 * 代码块（fence）与行内代码的内容原样保留、不做转义，先占位保护以免被误双写。
 */
function protectMathEscapes(markdown: string): string {
  const code: string[] = [];

  const masked = markdown
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (block) => mask(code, block))
    .replace(/`[^`\n]+`/g, (inline) => mask(code, inline));

  const doubled = masked.replace(
    /(\$\$?)([\s\S]*?)\1/g,
    (_match, delim: string, body: string) => {
      // 先双写反斜杠（还原 TeX 命令），再补标点转义 ——
      // 顺序不能反：否则新加的 `\` 会被当成 TeX 的反斜杠一起双写
      let tex = body.replace(/\\/g, "\\\\");
      tex = tex.replace(MATH_MARKUP_PUNCTUATION, "\\$&");
      if (delim === "$$") {
        // setext 底线：单独成行的 = / - 前缀反斜杠，避免被当标题底线拆散公式
        tex = tex.replace(/(^|\n)([ \t]*)(=+|-+)([ \t]*)(?=\n|$)/g, "$1$2\\$3$4");
      }
      return delim + tex + delim;
    },
  );

  return doubled.replace(
    new RegExp(MARK + "(\\d+)" + MARK, "g"),
    (_match, index: string) => code[Number(index)] ?? "",
  );
}

function mask(code: string[], value: string): string {
  const index = code.length;
  code.push(value);
  return MARK + index + MARK;
}
