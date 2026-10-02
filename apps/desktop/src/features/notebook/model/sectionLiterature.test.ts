import type {
  ExperimentBodyModel,
  NotebookState,
} from "@research-notebook/format";
import { describe, expect, it, vi } from "vitest";
import { chooseBlock, literatureOptions } from "./sectionLiterature";

const KEY = "z:u:SMIT2222";

function stateWith(methods: string, literature: string | null = null) {
  const body: ExperimentBodyModel = {
    preamble: "",
    sections: [
      { key: "methods", body: methods },
      { key: "interpretation", body: "" },
    ],
    literature,
  };
  return {
    experiments: [{ file: { frontmatter: { id: "E1" }, body } }],
  } as unknown as NotebookState;
}

describe("chooseBlock", () => {
  it("asks the planner with the stored body and the text being saved", async () => {
    const planner = vi.fn(() =>
      Promise.resolve({ literature: "x", basis: "b" }),
    );
    const state = stateWith("old", "block");
    const choice = await chooseBlock(state, "E1", "methods", "new", planner);
    expect(choice).toEqual({ literature: "x", basis: "b" });
    expect(planner).toHaveBeenCalledWith(
      expect.objectContaining({ literature: "block" }),
      "methods",
      "new",
    );
  });

  it("chooses nothing without a planner, a state or the experiment", async () => {
    const planner = vi.fn(() =>
      Promise.resolve({ literature: "x", basis: "b" }),
    );
    expect(
      await chooseBlock(stateWith(""), "E1", "methods", "t", undefined),
    ).toBeNull();
    expect(await chooseBlock(null, "E1", "methods", "t", planner)).toBeNull();
    expect(
      await chooseBlock(stateWith(""), "other", "methods", "t", planner),
    ).toBeNull();
    expect(planner).not.toHaveBeenCalled();
  });

  it("chooses nothing when the planner fails", async () => {
    const planner = () => Promise.reject(new Error("boom"));
    expect(
      await chooseBlock(stateWith(""), "E1", "methods", "t", planner),
    ).toBeNull();
  });
});

describe("literatureOptions", () => {
  const text = `See [@${KEY}].`;
  const basis = JSON.stringify([
    {
      items: [{ prefix: "", suppressAuthor: false, citekey: KEY, suffix: "" }],
    },
  ]);

  it("passes the block on when the citations are still the ones it was computed from", () => {
    const options = literatureOptions(stateWith(""), "E1", "methods", text, {
      literature: "L",
      basis,
    });
    expect(options).toEqual({ literature: "L" });
  });

  it("drops the block when the citations changed since it was computed", () => {
    const changed = stateWith("");
    const options = literatureOptions(
      changed,
      "E1",
      "methods",
      "no citations",
      {
        literature: "L",
        basis,
      },
    );
    expect(options).toEqual({});
  });

  it("passes nothing when there is no choice or the experiment is gone", () => {
    expect(
      literatureOptions(stateWith(""), "E1", "methods", text, null),
    ).toEqual({});
    expect(
      literatureOptions(stateWith(""), "gone", "methods", text, {
        literature: "L",
        basis,
      }),
    ).toEqual({});
  });
});
