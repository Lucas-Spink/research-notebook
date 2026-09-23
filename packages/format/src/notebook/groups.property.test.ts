import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { artefactsModel } from "../../test/evidence-arbitraries";
import { testEnv } from "../../test/notebook-support";
import { assertNever } from "../assert-never";
import { parseArtefacts, serialiseArtefacts } from "../files";
import type { Result } from "../result";
import type { ArtefactsFileModel, GroupModel } from "../schema";
import {
  addToGroup,
  createGroup,
  deleteGroup,
  moveGroup,
  moveToGroup,
  removeFromGroup,
  renameGroup,
  reorderItem,
} from "./groups";
import type { NotebookError } from "./types";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

/** An operation named by positions, resolved against whatever file it meets. */
const operationArb = fc.record({
  kind: fc.constantFrom(
    "create",
    "rename",
    "move",
    "delete",
    "add",
    "moveTo",
    "remove",
    "reorder",
  ),
  a: fc.nat(40),
  b: fc.nat(40),
  c: fc.integer({ min: -2, max: 8 }),
  toTop: fc.boolean(),
  name: fc.constantFrom("Plots", "Tables", "  Spaced ", "", "Line\nbreak"),
});

type Operation = typeof operationArb extends fc.Arbitrary<infer T> ? T : never;

function allGroups(groups: readonly GroupModel[]): GroupModel[] {
  return groups.flatMap((g) => [g, ...allGroups(g.groups)]);
}

function pick<T>(list: readonly T[], index: number): T | undefined {
  return list.length === 0 ? undefined : list[index % list.length];
}

const NONE = "01ZZZZZZZZZZZZZZZZZZZZZZZZ";

function apply(
  file: ArtefactsFileModel,
  op: Operation,
  env: ReturnType<typeof testEnv>,
): Result<ArtefactsFileModel, NotebookError> {
  const groups = allGroups(file.groups);
  const g1 = pick(groups, op.a)?.id ?? NONE;
  const g2 = pick(groups, op.b)?.id ?? NONE;
  const artefactId = pick(file.artefacts, op.b)?.id ?? NONE;
  const member = pick(groups, op.a)?.items[op.b % 4] ?? artefactId;
  switch (op.kind) {
    case "create": {
      const created = createGroup(
        file,
        { name: op.name, parent: op.toTop ? null : g1 },
        env,
      );
      return created.ok ? { ok: true, value: created.value.file } : created;
    }
    case "rename":
      return renameGroup(file, g1, op.name);
    case "move":
      return moveGroup(file, g1, op.toTop ? null : g2, op.c);
    case "delete":
      return deleteGroup(file, g1);
    case "add":
      return addToGroup(file, artefactId, g1, op.c);
    case "moveTo":
      return moveToGroup(file, member, op.toTop ? null : g1, g2, op.c);
    case "remove":
      return removeFromGroup(file, member, g1);
    case "reorder":
      return reorderItem(file, g1, member, op.c);
    default:
      return assertNever(op.kind);
  }
}

describe("group operations (S3-G02)", () => {
  it("keep every artefact and its bytes, stay valid, and never list an item twice in a group", () => {
    fc.assert(
      fc.property(
        artefactsModel(),
        fc.array(operationArb, { maxLength: 25 }),
        (start, operations) => {
          const env = testEnv();
          const artefactsText = JSON.stringify(start.artefacts);
          let file = start;
          for (const op of operations) {
            const input = JSON.stringify(file);
            const result = apply(file, op, env);
            // Operations never change the file they are given.
            expect(JSON.stringify(file)).toBe(input);
            if (!result.ok) continue;
            const next = result.value;

            // Groups never touch artefacts: same ids, order and bytes.
            expect(JSON.stringify(next.artefacts)).toBe(artefactsText);
            for (const group of allGroups(next.groups)) {
              expect(new Set(group.items).size).toBe(group.items.length);
            }
            // What is written reads back as the same file.
            const reread = parseArtefacts(serialiseArtefacts(next));
            expect(reread.ok && reread.value).toEqual(next);
            file = next;
          }
        },
      ),
      { numRuns },
    );
  });

  it("leave the order of groups and items an operation does not touch unchanged", () => {
    fc.assert(
      fc.property(artefactsModel(), operationArb, (start, op) => {
        const result = apply(start, op, testEnv());
        if (!result.ok) return;
        const before = new Map(
          allGroups(start.groups).map((g) => [g.id, g] as const),
        );
        for (const group of allGroups(result.value.groups)) {
          const old = before.get(group.id);
          if (old === undefined) continue;
          // Items kept from before stay in their relative order, unless the
          // operation was an explicit reorder or move within this group.
          const kept = group.items.filter((id) => old.items.includes(id));
          const oldKept = old.items.filter((id) => kept.includes(id));
          const reordering = op.kind === "reorder" || op.kind === "moveTo";
          if (!reordering) expect(kept).toEqual(oldKept);
          else expect([...kept].sort()).toEqual([...oldKept].sort());
          // Child groups kept from before stay in order unless groups moved.
          const keptChildren = group.groups
            .map((g) => g.id)
            .filter((id) => old.groups.some((g) => g.id === id));
          const oldChildren = old.groups
            .map((g) => g.id)
            .filter((id) => keptChildren.includes(id));
          if (op.kind !== "move") expect(keptChildren).toEqual(oldChildren);
        }
      }),
      { numRuns },
    );
  });
});
