import fc from "fast-check";
import { ArtefactsFile, InboxRequest } from "../src/schema";
import { sha256, timestamp, ulid } from "./arbitraries";
import {
  fileName,
  ulidPool,
  pathText,
  text,
  unknownFields,
  withUnknown,
} from "./file-arbitraries";

/** Generators for artefacts.yaml and request.json (S2-T02); see file-arbitraries.ts. */

const SOURCE_ROOT = (): fc.Arbitrary<string> =>
  fc.oneof(fc.constant("project"), ulid());

function source(): fc.Arbitrary<Record<string, unknown>> {
  return withUnknown(fc.record({ root: SOURCE_ROOT(), path: pathText() }));
}

function provenance(): fc.Arbitrary<Record<string, unknown>> {
  return withUnknown(
    fc.record({
      repo: fc.oneof(fc.constant("."), pathText()),
      commit: fc
        .array(fc.constantFrom(..."0123456789abcdef"), {
          minLength: 40,
          maxLength: 40,
        })
        .map((chars) => chars.join("")),
      path_in_repo: pathText(),
      file_dirty: fc.boolean(),
      tree_dirty: fc.boolean(),
    }),
  );
}

function versions(): fc.Arbitrary<Record<string, unknown>[]> {
  return fc
    .uniqueArray(fc.integer({ min: 1, max: 60 }), {
      minLength: 1,
      maxLength: 3,
    })
    .map((numbers) => numbers.sort((a, b) => a - b))
    .chain((numbers) =>
      fc.tuple(
        ...numbers.map((v) =>
          withUnknown(
            fc.record(
              {
                v: fc.constant(v),
                file: fc
                  .tuple(fc.constantFrom("evidence", "methods"), pathText())
                  .map(([dir, rest]) => `${dir}/${rest}`),
                sha256: sha256(),
                size: fc.nat(1_000_000_000),
                captured: timestamp(),
                provenance: provenance(),
              },
              { requiredKeys: ["v", "file", "sha256", "size", "captured"] },
            ),
          ),
        ),
      ),
    );
}

const ARTEFACT_TYPES = [
  "image",
  "pdf",
  "svg",
  "table",
  "script",
  "notebook",
  "text",
  "html",
  "other",
] as const;

interface GroupSpec {
  name: string;
  picks: number[];
  children: GroupSpec[];
}

function groupSpec(): fc.Arbitrary<GroupSpec> {
  return fc.letrec<{ group: GroupSpec }>((tie) => ({
    group: fc.record({
      name: text(),
      picks: fc.array(fc.nat(9), { maxLength: 4 }),
      children: fc.oneof(
        { maxDepth: 2, depthIdentifier: "group-depth" },
        fc.constant<GroupSpec[]>([]),
        fc.array(tie("group"), { maxLength: 2 }),
      ),
    }),
  })).group;
}

/** artefacts.yaml (spec 5.8): mixed copy and link artefacts and a group tree. */
export function artefactsModel(): fc.Arbitrary<
  ReturnType<typeof ArtefactsFile.parse>
> {
  const artefactSpec = fc.record({
    name: text(),
    role: fc.constantFrom("result", "method"),
    type: fc.constantFrom(...ARTEFACT_TYPES),
    created: timestamp(),
    source: source(),
    isLink: fc.boolean(),
    versions: versions(),
    link: withUnknown(
      fc.record({
        sha256: sha256(),
        size: fc.nat(1_000_000_000),
        observed_mtime: timestamp(),
        checked: timestamp(),
      }),
    ),
    extra: unknownFields(),
  });
  return fc
    .tuple(
      ulidPool(40),
      fc.array(artefactSpec, { maxLength: 4 }),
      fc.array(groupSpec(), { maxLength: 2 }),
      unknownFields(),
    )
    .map(([ids, specs, groups, extra]) => {
      const artefacts = specs.map((spec, index) => ({
        id: ids[index],
        name: spec.name,
        role: spec.role,
        mode: spec.isLink ? "link" : "copy",
        type: spec.type,
        source: spec.source,
        created: spec.created,
        ...(spec.isLink ? { link: spec.link } : { versions: spec.versions }),
        ...spec.extra,
      }));
      const results = artefacts
        .filter((a) => a.role === "result")
        .map((a) => a.id);
      let nextId = 10;
      const build = (spec: GroupSpec): Record<string, unknown> => ({
        id: ids[nextId++],
        name: spec.name,
        items: [
          ...new Set(
            spec.picks.flatMap((pick) =>
              results.length === 0 ? [] : [results[pick % results.length]],
            ),
          ),
        ],
        groups: spec.children.map(build),
      });
      return ArtefactsFile.parse({
        format_version: 1,
        artefacts,
        groups: groups.map(build),
        ...extra,
      });
    });
}

/** request.json (spec 5.10), copy or link mode. */
export function requestModel(): fc.Arbitrary<
  ReturnType<typeof InboxRequest.parse>
> {
  return fc
    .tuple(
      fc.boolean(),
      fileName(),
      fc.option(provenance(), { nil: null }),
      fc.option(fc.array(text(), { maxLength: 3 }), { nil: undefined }),
    )
    .chain(([isCopy, payload, prov, groupPath]) =>
      withUnknown(
        fc.record({
          format_version: fc.constant(1),
          request_id: ulid(),
          created: timestamp(),
          created_by: text(),
          experiment_id: ulid(),
          role: fc.constantFrom("result", "method"),
          mode: fc.constant(isCopy ? "copy" : "link"),
          source: source(),
          payload: fc.constant(isCopy ? payload : null),
          sha256: sha256(),
          size: fc.nat(1_000_000_000),
          provenance: fc.constant(prov),
          ...(groupPath === undefined
            ? {}
            : { group_path: fc.constant(groupPath) }),
        }),
      ),
    )
    .map((request) => InboxRequest.parse(request));
}
