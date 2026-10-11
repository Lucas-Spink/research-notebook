import { describe, expect, it } from "vitest";
import { parseNotebook, type NotebookDoc } from "./notebook";

const notebook = (cells: unknown[], extra: object = {}) =>
  JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { language_info: { name: "python" } },
    cells,
    ...extra,
  });

function parsed(text: string): NotebookDoc {
  const result = parseNotebook(text);
  if (!result.ok) throw new Error(`expected a notebook, got ${result.error}`);
  return result.value;
}

const outputsOf = (doc: NotebookDoc) => {
  const cell = doc.cells[0];
  return cell?.kind === "code" ? cell.outputs : [];
};

describe("parsing a Jupyter notebook (issue #104)", () => {
  it("keeps the cells in order, with their kinds and source", () => {
    const doc = parsed(
      notebook([
        { cell_type: "markdown", source: ["# Title\n", "text"] },
        { cell_type: "code", source: "x = 1", execution_count: 2, outputs: [] },
        { cell_type: "raw", source: ["raw"] },
      ]),
    );
    expect(doc.cells).toEqual([
      { kind: "markdown", source: "# Title\ntext" },
      { kind: "code", source: "x = 1", executionCount: 2, outputs: [] },
      { kind: "raw", source: "raw" },
    ]);
    expect(doc.language).toBe("python");
  });

  it("treats a missing execution count and outputs as not run", () => {
    const doc = parsed(notebook([{ cell_type: "code", source: "" }]));
    expect(doc.cells).toEqual([
      { kind: "code", source: "", executionCount: null, outputs: [] },
    ]);
  });

  it("shows stream text, and removes terminal colour codes", () => {
    const doc = parsed(
      notebook([
        {
          cell_type: "code",
          source: "",
          execution_count: 1,
          outputs: [
            {
              output_type: "stream",
              name: "stdout",
              text: ["a\n", "\u001b[31mb\u001b[0m"],
            },
          ],
        },
      ]),
    );
    expect(outputsOf(doc)).toEqual([
      { kind: "text", text: "a\nb", stream: "stdout", cut: false },
    ]);
  });

  it("shows the plain text of a result, which is how tables are saved too", () => {
    const doc = parsed(
      notebook([
        {
          cell_type: "code",
          source: "df",
          execution_count: 3,
          outputs: [
            {
              output_type: "execute_result",
              execution_count: 3,
              data: {
                "text/plain": ["  a  b\n", "0 1  2"],
                "text/html": "<table><script>alert(1)</script></table>",
              },
            },
          ],
        },
      ]),
    );
    expect(outputsOf(doc)).toEqual([
      { kind: "text", text: "  a  b\n0 1  2", stream: null, cut: false },
    ]);
  });

  it("never carries HTML or script from an output into what is shown", () => {
    const doc = parsed(
      notebook([
        {
          cell_type: "code",
          source: "",
          outputs: [
            {
              output_type: "display_data",
              data: { "text/html": "<img src=x onerror=alert(1)>" },
            },
            {
              output_type: "display_data",
              data: { "application/javascript": "alert(1)" },
            },
          ],
        },
      ]),
    );
    expect(JSON.stringify(doc)).not.toContain("alert");
    expect(outputsOf(doc)).toEqual([
      { kind: "html" },
      { kind: "unsupported", mime: "application/javascript" },
    ]);
  });

  it("notes a saved image without loading it", () => {
    const doc = parsed(
      notebook([
        {
          cell_type: "code",
          source: "plt.plot()",
          outputs: [
            {
              output_type: "display_data",
              data: { "image/png": "iVBORw0KGgo=", "text/plain": "<Figure>" },
            },
          ],
        },
      ]),
    );
    expect(outputsOf(doc)).toEqual([{ kind: "image", mime: "image/png" }]);
    expect(JSON.stringify(doc)).not.toContain("iVBOR");
  });

  it("shows an error output with its traceback", () => {
    const doc = parsed(
      notebook([
        {
          cell_type: "code",
          source: "1/0",
          outputs: [
            {
              output_type: "error",
              ename: "ZeroDivisionError",
              evalue: "division by zero",
              traceback: ["\u001b[1mTraceback\u001b[0m", "line 1"],
            },
          ],
        },
      ]),
    );
    expect(outputsOf(doc)).toEqual([
      {
        kind: "error",
        name: "ZeroDivisionError",
        value: "division by zero",
        traceback: "Traceback\nline 1",
        cut: false,
      },
    ]);
  });

  it("cuts an output that is very long and says so", () => {
    const doc = parsed(
      notebook([
        {
          cell_type: "code",
          source: "",
          outputs: [
            {
              output_type: "stream",
              name: "stdout",
              text: "x".repeat(500_000),
            },
          ],
        },
      ]),
    );
    const [output] = outputsOf(doc);
    expect(output).toMatchObject({ kind: "text", cut: true });
    expect(output?.kind === "text" ? output.text.length : 0).toBeLessThan(
      100_000,
    );
  });

  it("copes with an empty notebook and hundreds of cells", () => {
    expect(parsed(notebook([])).cells).toEqual([]);
    const many = Array.from({ length: 500 }, () => ({
      cell_type: "markdown",
      source: "x",
    }));
    expect(parsed(notebook(many)).cells).toHaveLength(500);
  });
});

describe("refusing what is not a usable notebook", () => {
  it.each([
    ["", "notJson"],
    ["{not json", "notJson"],
    ["[]", "notNotebook"],
    ["null", "notNotebook"],
    ['{"nbformat": 4}', "notNotebook"],
    [notebook([{ cell_type: "video", source: "" }]), "notNotebook"],
    [notebook([{ cell_type: "code", source: 5 }]), "notNotebook"],
    [notebook(["cell"]), "notNotebook"],
    [
      notebook([{ cell_type: "code", source: "", outputs: "x" }]),
      "notNotebook",
    ],
    [notebook([], { nbformat: 3 }), "unsupportedVersion"],
    [notebook([], { nbformat: 5 }), "unsupportedVersion"],
    [notebook([], { nbformat: "4" }), "notNotebook"],
  ])("reports %j as %s", (text, error) => {
    expect(parseNotebook(text)).toEqual({ ok: false, error });
  });
});
