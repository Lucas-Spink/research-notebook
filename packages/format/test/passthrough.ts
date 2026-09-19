/**
 * Markdown the editor does not model (spec FR-EDT-02). The format layer keeps
 * section text as opaque text, so each of these must come out of an edit
 * byte for byte. None contains a level-2 heading or a literature marker
 * outside a fence, so each is valid section text under the body grammar.
 */
export const PASSTHROUGH_BLOCKS: readonly string[] = [
  "| Sample | Reads |\n| ------ | ----- |\n| A      | 10    |\n| B      | 12    |",
  "<details>\n<summary>Raw output</summary>\n\n<p>Unmodified.</p>\n\n</details>",
  "<table>\n  <tr><td>1</td></tr>\n</table>",
  "<!-- reviewer: check the batch column -->",
  "    indented code\n    ## not a heading, it is code",
  "Setext heading\n==============",
  "* * *",
  "Text with a footnote.[^1]\n\n[^1]: The footnote.",
  "$$\nx = \\frac{a}{b}\n$$",
  "A marker inside a line, <!-- literature:start --> is only text.",
  "  ## indented, so not a heading",
  "##Not a heading either",
  "### A level-3 heading",
];
