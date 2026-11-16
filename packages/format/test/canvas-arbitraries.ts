import fc from "fast-check";
import { HANDLE_SIDES, type CanvasFileModel } from "../src/schema";
import { text } from "./file-arbitraries";
import { ulid } from "./arbitraries";

/**
 * Generators for canvas files (ADR-0064). Ids are drawn from a small pool per
 * file so edges can name nodes that exist, as the schema requires.
 */

const EDGE_LABELS = [
  "supports",
  "contradicts",
  "derived-from",
  "related-to",
  "requires-investigation",
] as const;

// Whole and half numbers only: they print identically after a JSON round trip.
const coordinate = fc.integer({ min: -20_000, max: 20_000 });
const extent = fc.integer({ min: 40, max: 4_000 });

const position = fc.record({ x: coordinate, y: coordinate });
const size = fc.record({ width: extent, height: extent });

/** A table whose cells are a subset of its rows by columns, one figure each. */
function table(id: string): fc.Arbitrary<CanvasFileModel["nodes"][number]> {
  const line = fc.record({ id: ulid(), label: text() });
  return fc
    .tuple(
      fc.uniqueArray(line, { maxLength: 3, selector: (l) => l.id }),
      fc.uniqueArray(line, { maxLength: 3, selector: (l) => l.id }),
    )
    .chain(([rows, columns]) => {
      // Row and column ids may not repeat across the two, to keep the pool simple.
      const clash = new Set(rows.map((r) => r.id));
      const cols = columns.filter((c) => !clash.has(c.id));
      const pairs = rows.flatMap((r) => cols.map((c) => [r.id, c.id] as const));
      return fc.record({
        id: fc.constant(id),
        type: fc.constant("table" as const),
        rows: fc.constant(rows),
        columns: fc.constant(cols),
        cells: fc
          .tuple(
            ...pairs.map(([row, column]) =>
              fc.option(
                fc.record(
                  {
                    row: fc.constant(row),
                    column: fc.constant(column),
                    experiment_id: ulid(),
                    artefact_id: ulid(),
                    version: fc.integer({ min: 1, max: 50 }),
                    aspect: fc.constantFrom(0.5, 1, 1.5, 2),
                  },
                  {
                    requiredKeys: [
                      "row",
                      "column",
                      "experiment_id",
                      "artefact_id",
                    ],
                  },
                ),
                { nil: undefined },
              ),
            ),
          )
          .map((cells) => cells.filter((cell) => cell !== undefined)),
        fit: fc.constantFrom("row" as const, "column" as const),
        position,
        size,
      });
    });
}

function node(id: string): fc.Arbitrary<CanvasFileModel["nodes"][number]> {
  return fc.oneof(
    table(id),
    fc.record({
      id: fc.constant(id),
      type: fc.constant("artefact" as const),
      experiment_id: ulid(),
      artefact_id: ulid(),
      version: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
      position,
      size,
    }),
    fc.record({
      id: fc.constant(id),
      type: fc.constant("note" as const),
      text: fc.oneof(text(), fc.constant(""), fc.constant("a\nb")),
      position,
      size,
    }),
    fc.record({
      id: fc.constant(id),
      type: fc.constant("region" as const),
      label: text(),
      position,
      size,
    }),
  );
}

/** A valid canvas with 0 to 8 nodes and edges only between those nodes. */
export function canvasModel(): fc.Arbitrary<CanvasFileModel> {
  return fc
    .uniqueArray(ulid(), { minLength: 0, maxLength: 8 })
    .chain((nodeIds) =>
      fc.record({
        // Set below from what the canvas holds, as `serialiseCanvas` does.
        format_version: fc.constant(2 as const),
        id: ulid(),
        name: text(),
        nodes: fc.tuple(...nodeIds.map(node)),
        edges:
          nodeIds.length === 0
            ? fc.constant<CanvasFileModel["edges"]>([])
            : fc.uniqueArray(
                fc.record(
                  {
                    id: ulid(),
                    source: fc.constantFrom(...nodeIds),
                    target: fc.constantFrom(...nodeIds),
                    source_handle: fc.constantFrom(...HANDLE_SIDES),
                    target_handle: fc.constantFrom(...HANDLE_SIDES),
                  },
                  { requiredKeys: ["id", "source", "target"] },
                ),
                { maxLength: 6, selector: (edge) => edge.id },
              ),
        viewport: fc.record({
          x: coordinate,
          y: coordinate,
          zoom: fc.constantFrom(0.25, 0.5, 1, 1.5, 2),
        }),
      }),
    )
    .map((file): CanvasFileModel => ({
      ...file,
      // A canvas with a table is version 3; any other stays 2 (ADR-0071).
      format_version: file.nodes.some((n) => n.type === "table") ? 3 : 2,
    }));
}

export { EDGE_LABELS };
