import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import type { NotebookActions } from "../useNotebook";
import {
  mountNotebook,
  openCell,
  prepareInteractiveTable,
  tableOf as table,
  typeInto,
} from "./tableTesting";

/**
 * FR-CIT-10: every section save carries the Literature planner, so the block
 * is regenerated in the same write as the text that changed it.
 */

const { state } = sampleNotebook();

prepareInteractiveTable();

describe("saving a section regenerates Literature (FR-CIT-10)", () => {
  it("hands the planner to the save, so the block is written with the text", async () => {
    const planners: unknown[] = [];
    const actions: NotebookActions = {
      ...stubActions,
      editExperimentSection: (_id, _key, _text, literature) => {
        planners.push(literature);
        return Promise.resolve({ ok: true });
      },
    };
    const { view } = mountNotebook(state, { actions });
    await openCell(view, "EXP-001", "methods");
    typeInto(table(view), "Typed. ");
    await openCell(view, "EXP-002", "methods");
    expect(planners).toHaveLength(1);
    expect(typeof planners[0]).toBe("function");
  });
});
