import { z } from "zod";
import {
  ArtefactMode,
  ArtefactRole,
  Count,
  FormatVersion,
  Provenance,
  RelativePath,
  Sha256,
  SingleLine,
  Source,
  Timestamp,
  Ulid,
} from "./common";

export const ARTEFACT_TYPES = [
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

// Captured files live under the experiment folder in evidence/ or methods/ (spec 5.1).
const VersionFile = RelativePath.refine(
  (path) => path.startsWith("evidence/") || path.startsWith("methods/"),
  "expected a path under evidence/ or methods/",
);

/** Spec 5.8 `versions[]`: one immutable captured copy. */
const Version = z.looseObject({
  v: z.number().int().min(1),
  file: VersionFile,
  sha256: Sha256,
  size: Count,
  captured: Timestamp,
  provenance: Provenance.optional(),
});

/** Spec 5.8 `link`: what was observed of a linked file. */
const LinkRecord = z.looseObject({
  sha256: Sha256,
  size: Count,
  observed_mtime: Timestamp,
  checked: Timestamp,
});

const artefactBase = {
  id: Ulid,
  name: SingleLine,
  role: ArtefactRole,
  type: z.enum(ARTEFACT_TYPES),
  source: Source,
  created: Timestamp,
};

// Versions ascend strictly but need not be contiguous: deleting a version
// moves its file to .trash/ (FR-EVD-10) and its number is never reused.
const CopyArtefact = z.looseObject({
  ...artefactBase,
  mode: z.literal(ArtefactMode.enum.copy),
  versions: z
    .array(Version)
    .min(1)
    .superRefine((versions, ctx) => {
      versions.forEach((version, index) => {
        const previous = versions[index - 1];
        if (previous !== undefined && version.v <= previous.v) {
          ctx.addIssue({
            code: "custom",
            path: [index, "v"],
            message: "version numbers must be strictly ascending",
          });
        }
      });
    }),
  link: z.never().optional(),
});

const LinkArtefact = z.looseObject({
  ...artefactBase,
  mode: z.literal(ArtefactMode.enum.link),
  link: LinkRecord,
  versions: z.never().optional(),
});

/** Spec 5.8: an artefact is either captured (copy) or recorded in place (link). */
export const Artefact = z.discriminatedUnion("mode", [
  CopyArtefact,
  LinkArtefact,
]);

/** Spec 5.8 `groups[]`: a node in the virtual tree; groups never touch real files. */
export const Group = z.looseObject({
  id: Ulid,
  name: SingleLine,
  items: z.array(Ulid),
  get groups() {
    return z.array(Group);
  },
});

type GroupNode = z.infer<typeof Group>;

/**
 * Spec 5.8: `experiments/<ref>/artefacts.yaml`. Constraints that span
 * entries (unique ids, group membership rules) are checked here; ones that
 * span files (artefact ids unique project-wide, `source.root` naming a real
 * external root) are not, and belong to the project loader.
 */
export const ArtefactsFile = z
  .looseObject({
    format_version: FormatVersion,
    artefacts: z.array(Artefact),
    groups: z.array(Group),
  })
  .superRefine((file, ctx) => {
    const roles = new Map<string, "result" | "method">();
    file.artefacts.forEach((artefact, index) => {
      if (roles.has(artefact.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["artefacts", index, "id"],
          message: "artefact id is used more than once",
        });
      }
      roles.set(artefact.id, artefact.role);
    });

    const groupIds = new Set<string>();
    const visit = (group: GroupNode, path: (string | number)[]): void => {
      if (groupIds.has(group.id)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "id"],
          message: "group id is used more than once",
        });
      }
      groupIds.add(group.id);
      const members = new Set<string>();
      group.items.forEach((id, index) => {
        const itemPath = [...path, "items", index];
        const role = roles.get(id);
        if (role === undefined) {
          ctx.addIssue({
            code: "custom",
            path: itemPath,
            message: "item is not an artefact in this file",
          });
        } else if (role !== "result") {
          ctx.addIssue({
            code: "custom",
            path: itemPath,
            message: "method artefacts cannot be group members",
          });
        }
        if (members.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: itemPath,
            message: "artefact is listed twice in one group",
          });
        }
        members.add(id);
      });
      group.groups.forEach((child, index) =>
        visit(child, [...path, "groups", index]),
      );
    };
    file.groups.forEach((group, index) => visit(group, ["groups", index]));
  });

export type ArtefactsFileModel = z.infer<typeof ArtefactsFile>;
export type ArtefactModel = z.infer<typeof Artefact>;
export type GroupModel = GroupNode;
