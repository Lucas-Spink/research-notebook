/**
 * The canonical key order of each object in each file (format-v1.md
 * section 4). `keys` lists the known keys in order; `children` gives the
 * shape of the value under a key. Arrays are transparent: a child shape
 * applies to every element.
 */
export interface Shape {
  readonly keys: readonly string[];
  readonly children?: Readonly<Record<string, Shape>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a copy of `value` with known keys first, in the shape's order, and
 * unknown keys after them in their original relative order (spec 5.2).
 * Values under unknown keys are left exactly as they are. The input is not
 * mutated.
 */
export function orderByShape(value: unknown, shape: Shape): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => orderByShape(item, shape));
  }
  if (!isRecord(value)) return value;

  const known = new Set(shape.keys);
  const entries: [string, unknown][] = [];
  for (const key of shape.keys) {
    if (!Object.hasOwn(value, key)) continue;
    const child = shape.children?.[key];
    const inner = value[key];
    entries.push([
      key,
      child === undefined ? inner : orderByShape(inner, child),
    ]);
  }
  for (const [key, inner] of Object.entries(value)) {
    if (!known.has(key)) entries.push([key, inner]);
  }
  // fromEntries defines own properties, so a key such as "__proto__" survives.
  return Object.fromEntries(entries);
}

const PROVENANCE: Shape = {
  keys: ["repo", "commit", "path_in_repo", "file_dirty", "tree_dirty"],
};

const SOURCE: Shape = { keys: ["root", "path"] };

const GROUP: Shape = {
  keys: ["id", "name", "items", "groups"],
  get children() {
    return { groups: GROUP };
  },
};

export const PROJECT_SHAPE: Shape = {
  keys: [
    "format_version",
    "id",
    "name",
    "created",
    "last_written_by",
    "archived",
    "locale",
    "citation_style",
    "capture",
    "numbering",
    "order",
    "table",
    "external_roots",
  ],
  children: {
    capture: { keys: ["copy_threshold_mb", "evidence_in_git"] },
    numbering: { keys: ["next_question", "next_experiment"] },
    order: { keys: ["question", "experiments"] },
    table: {
      keys: ["columns", "collapsed_questions"],
      children: { columns: { keys: ["key", "width", "hidden"] } },
    },
    external_roots: { keys: ["id", "label"] },
  },
};

export const QUESTION_SHAPE: Shape = {
  keys: ["id", "ref", "title", "created"],
};

export const EXPERIMENT_SHAPE: Shape = {
  keys: [
    "id",
    "ref",
    "question",
    "title",
    "status",
    "started",
    "completed",
    "created",
    "updated",
  ],
};

export const ARTEFACTS_SHAPE: Shape = {
  keys: ["format_version", "artefacts", "groups"],
  children: {
    artefacts: {
      keys: [
        "id",
        "name",
        "role",
        "mode",
        "type",
        "source",
        "created",
        "versions",
        "link",
      ],
      children: {
        source: SOURCE,
        versions: {
          keys: ["v", "file", "sha256", "size", "captured", "provenance"],
          children: { provenance: PROVENANCE },
        },
        link: { keys: ["sha256", "size", "observed_mtime", "checked"] },
      },
    },
    groups: GROUP,
  },
};

export const REQUEST_SHAPE: Shape = {
  keys: [
    "format_version",
    "request_id",
    "created",
    "created_by",
    "experiment_id",
    "role",
    "mode",
    "source",
    "payload",
    "sha256",
    "size",
    "provenance",
    "group_path",
  ],
  children: { source: SOURCE, provenance: PROVENANCE },
};
