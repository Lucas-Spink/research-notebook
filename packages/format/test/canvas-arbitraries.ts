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

function node(id: string): fc.Arbitrary<CanvasFileModel["nodes"][number]> {
  return fc.oneof(
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
        format_version: fc.constant(2 as const),
        id: ulid(),
        name: text(),
        nodes: fc.tuple(...nodeIds.map(node)),
        edges:
          nodeIds.length === 0
            ? fc.constant([])
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
    );
}

export { EDGE_LABELS };
