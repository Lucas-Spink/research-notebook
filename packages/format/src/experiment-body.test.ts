import { describe, expect, it } from "vitest";
import {
  parseExperimentBody,
  serialiseExperimentBody,
} from "./experiment-body";
import type { ExperimentBodyModel } from "./schema";

/** The body grammar of format-v1.md section 4.3, with CommonMark fence rules. */

function parsed(text: string): ExperimentBodyModel {
  const result = parseExperimentBody(text);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function keys(body: ExperimentBodyModel): string[] {
  return body.sections.map((section) =>
    section.key === "unknown" ? `unknown:${section.heading}` : section.key,
  );
}

describe("sections and preamble", () => {
  it("returns an empty model for an empty body", () => {
    expect(parsed("")).toEqual({
      preamble: "",
      sections: [],
      literature: null,
    });
    expect(parsed("\n\n")).toEqual({
      preamble: "",
      sections: [],
      literature: null,
    });
  });

  it("keeps text before the first heading as the preamble", () => {
    const body = parsed(
      "\n\nHand-written intro.\n\nSecond line.\n\n## Methods\n\nA",
    );
    expect(body.preamble).toBe("Hand-written intro.\n\nSecond line.");
    expect(keys(body)).toEqual(["methods"]);
  });

  it("puts an early unknown section after the preamble, not inside it", () => {
    const body = parsed("intro\n\n## Notes\n\nn\n\n## Methods\n\nm");
    expect(body.preamble).toBe("intro");
    expect(keys(body)).toEqual(["unknown:Notes", "methods"]);
  });

  it("recognises headings ignoring case and surrounding spaces, and keeps stored order", () => {
    const body = parsed(
      "## interpretation\n\ni\n\n##  METHODS  \n\nm\n\n## Results Notes\n\nr",
    );
    expect(keys(body)).toEqual(["interpretation", "methods", "results_notes"]);
  });

  it("strips leading and trailing blank lines from a section but keeps inner blank lines and trailing spaces", () => {
    const body = parsed("## Methods\n\n\nfirst  \n\n\nsecond\n\n\n## Notes\n");
    expect(body.sections[0]).toEqual({
      key: "methods",
      body: "first  \n\n\nsecond",
    });
    expect(body.sections[1]).toEqual({
      key: "unknown",
      heading: "Notes",
      body: "",
    });
  });

  it("keeps an unknown heading verbatim, including closing hashes and padding", () => {
    const body = parsed("## Related Work ##\n\na\n\n## Padded  \n\nb");
    expect(keys(body)).toEqual(["unknown:Related Work ##", "unknown:Padded  "]);
  });

  it("allows the same unknown heading more than once", () => {
    const body = parsed("## Notes\n\na\n\n## Notes\n\nb");
    expect(keys(body)).toEqual(["unknown:Notes", "unknown:Notes"]);
  });

  it.each([
    ["a level-3 heading", "### Methods"],
    ["an indented heading", " ## Methods"],
    ["a heading without a space", "##Methods"],
    ["a heading in a block quote", "> ## Methods"],
    ["a heading in a list", "- ## Methods"],
    ["a setext heading", "Methods\n-------"],
  ])("does not treat %s as a section", (_name, line) => {
    const body = parsed(`intro\n\n${line}\n\ntext`);
    expect(body.sections).toEqual([]);
    expect(body.preamble).toContain(line);
  });
});

describe("fenced code", () => {
  it.each([
    ["a backtick fence", "```\n## Methods\n```"],
    ["a tilde fence", "~~~\n## Methods\n~~~"],
    ["a fence with an info string", "```r\n## Methods\n```"],
    ["a fence indented three spaces", "   ```\n## Methods\n   ```"],
    ["a closing fence longer than the opening", "```\n## Methods\n`````"],
    [
      "a longer fence containing a shorter one",
      "````\n```\n## Methods\n```\n````",
    ],
    [
      "a tilde fence containing a backtick fence",
      "~~~\n```\n## Methods\n```\n~~~",
    ],
  ])("does not read a heading inside %s", (_name, block) => {
    const body = parsed(`## Notes\n\n${block}\n\nafter`);
    expect(keys(body)).toEqual(["unknown:Notes"]);
    expect(body.sections[0]?.body).toBe(`${block}\n\nafter`);
  });

  it("reads a heading after the fence closes", () => {
    const body = parsed("```\n## Methods\n```\n\n## Methods\n\nreal");
    expect(keys(body)).toEqual(["methods"]);
    expect(body.preamble).toBe("```\n## Methods\n```");
  });

  it("does not open a fence indented four spaces", () => {
    const body = parsed("    ```\n## Methods\n\nreal");
    expect(keys(body)).toEqual(["methods"]);
  });

  it("does not open a backtick fence whose info string contains a backtick", () => {
    const body = parsed("```a`b\n## Methods\n\nreal");
    expect(keys(body)).toEqual(["methods"]);
  });

  it("does not close a fence with a line that has an info string", () => {
    const body = parsed("```\n```x\n## Methods\n```\n\nafter");
    expect(body.sections).toEqual([]);
  });

  it("does not close a fence with a shorter fence", () => {
    const body = parsed("````\n```\n## Methods\n");
    expect(body.sections).toEqual([]);
  });

  it("lets an unclosed fence run to the end of the file", () => {
    const body = parsed(
      "## Notes\n\n```\ncode\n\n## Methods\n\n<!-- literature:start -->",
    );
    expect(keys(body)).toEqual(["unknown:Notes"]);
    expect(body.literature).toBeNull();
  });
});

describe("literature block", () => {
  it("returns null when there is none", () => {
    expect(parsed("## Methods\n\nm").literature).toBeNull();
  });

  it("keeps the content between the markers, trimmed of blank edge lines", () => {
    const body = parsed(
      "## Methods\n\nm\n\n<!-- literature:start -->\n\n## Literature\n\n1. A.\n\n<!-- literature:end -->\n\n",
    );
    expect(body.literature).toBe("## Literature\n\n1. A.");
    expect(body.sections[0]?.body).toBe("m");
  });

  it("does not treat the heading inside the block as a section", () => {
    const body = parsed(
      "<!-- literature:start -->\n## Literature\n\n## Methods\n<!-- literature:end -->",
    );
    expect(body.sections).toEqual([]);
    expect(body.literature).toBe("## Literature\n\n## Methods");
  });

  it("treats a Literature heading outside the block as an unknown section", () => {
    expect(keys(parsed("## Literature\n\nx"))).toEqual(["unknown:Literature"]);
  });

  it("gives an empty block the empty string, not null", () => {
    expect(
      parsed("<!-- literature:start -->\n<!-- literature:end -->").literature,
    ).toBe("");
  });

  it("ignores a marker inside a fence", () => {
    const body = parsed(
      "```\n<!-- literature:start -->\n```\n\n<!-- literature:start -->\nx\n<!-- literature:end -->",
    );
    expect(body.literature).toBe("x");
    expect(body.preamble).toBe("```\n<!-- literature:start -->\n```");
  });

  it("does not treat a marker with trailing spaces as a marker", () => {
    const body = parsed("<!-- literature:start --> \nx");
    expect(body.literature).toBeNull();
    expect(body.preamble).toBe("<!-- literature:start --> \nx");
  });
});

describe("serialiseExperimentBody", () => {
  it("writes nothing for an empty body", () => {
    expect(
      serialiseExperimentBody({ preamble: "", sections: [], literature: null }),
    ).toBe("");
  });

  it("separates blocks with one blank line and writes an empty section as its heading alone", () => {
    const text = serialiseExperimentBody({
      preamble: "intro",
      sections: [
        { key: "results_notes", body: "" },
        { key: "unknown", heading: "Notes ##", body: "n" },
        { key: "methods", body: "m" },
      ],
      literature: "## Literature\n\n1. A.",
    });
    expect(text).toBe(
      [
        "intro",
        "",
        "## Results notes",
        "",
        "## Notes ##",
        "",
        "n",
        "",
        "## Methods",
        "",
        "m",
        "",
        "<!-- literature:start -->",
        "## Literature",
        "",
        "1. A.",
        "<!-- literature:end -->",
      ].join("\n"),
    );
  });

  it("writes an empty literature block as two consecutive marker lines", () => {
    const text = serialiseExperimentBody({
      preamble: "",
      sections: [],
      literature: "",
    });
    expect(text).toBe("<!-- literature:start -->\n<!-- literature:end -->");
  });

  it("writes recognised headings in canonical case", () => {
    const text = serialiseExperimentBody(
      parsed("## INTERPRETATION\n\ni\n\n##  results notes\n\nr"),
    );
    expect(text).toBe("## Interpretation\n\ni\n\n## Results notes\n\nr");
  });
});
