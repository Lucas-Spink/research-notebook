import {
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import {
  createExperiment,
  createQuestion,
  editExperimentSection,
  newProject,
  parseBibliography,
  replaceSource,
  serialiseBibliography,
  type BibliographyFileModel,
  type NotebookEnv,
  type NotebookState,
  type SourceReplacement,
} from "@research-notebook/format";
import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import type { LiteratureRenderer } from "./literaturePlan";
import { repairSource, type RepairEnv } from "./sourceRepair";
import { BIBLIOGRAPHY_PATH } from "./syncSources";

/** FR-CIT-08 (S5-G06): a missing or trashed source is replaced by another item; citekeys in the text follow, nothing else changes. */

const OLD = "z:u:OLDD2222";
const NEW = "z:u:NEWW3333";
const OTHER = "z:u:OTHR4444";
const NOW = () => new Date("2026-10-02T10:00:00Z");
const ENV: NotebookEnv = {
  now: NOW,
  newId: (() => {
    let n = 0;
    return () => `01JAX${String((n += 1)).padStart(21, "0")}`;
  })(),
  appVersion: "0.2.0",
};

const ok = (data: unknown) => ({ status: "ok", data });
const failure = (kind: string) => ({ status: "error", error: { kind } });

function entry(
  citekey: string,
  title: string,
  status: "ok" | "trashed" | "missing" = "ok",
): BibliographyFileModel[number] {
  const [, library, key] = citekey.split(":");
  return {
    id: citekey,
    type: "book",
    title,
    author: [{ family: title, given: "A" }],
    issued: { "date-parts": [[2020]] },
    _zotero: {
      server_id: "srv-1",
      library: library ?? "u",
      key: key ?? "",
      fetched: "2026-09-01T00:00:00Z",
      status,
    },
  };
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

const render: LiteratureRenderer = (input) =>
  Promise.resolve(renderLiterature(input));

function blockFor(items: BibliographyFileModel, citekey: string): string {
  const result = renderLiterature({
    clusters: [
      { items: [{ prefix: "", suppressAuthor: false, citekey, suffix: "" }] },
    ],
    items,
    styleXml: NUMERIC_STYLE,
    localeXml: EN_US_LOCALE,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.text;
}

/** Two experiments cite OLD (the second block edited by hand); a third cites only OTHER. */
function project(items: BibliographyFileModel) {
  let state: NotebookState = {
    project: must(
      newProject(
        { name: "P", appVersion: "0.2.0" },
        { now: NOW, newId: () => "01JAXP0000000000000000000A" },
      ),
    ).project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };
  state = must(createQuestion(state, { title: "Q" }, ENV)).next;
  const questionId = state.questions[0]?.file.frontmatter.id ?? "";
  for (const title of ["One", "Two", "Three"]) {
    state = must(createExperiment(state, { questionId, title }, ENV)).next;
  }
  const [one = "", two = "", three = ""] = state.experiments.map(
    (e) => e.file.frontmatter.id,
  );
  const cite = `Counted [see @${OLD}, p. 3].`;
  state = must(
    editExperimentSection(state, one, "methods", cite, ENV, {
      literature: blockFor(items, OLD),
    }),
  ).next;
  state = must(
    editExperimentSection(state, two, "methods", cite, ENV, {
      literature: "1. Rewritten by hand.",
    }),
  ).next;
  state = must(
    editExperimentSection(state, three, "methods", `Only [@${OTHER}].`, ENV),
  ).next;
  return { state, one, two, three };
}

/** Fake commands over one in-memory `bibliography.json`, with a reply per item key. */
function world(options: {
  disk: BibliographyFileModel;
  zotero: Record<string, unknown>;
  fetchFails?: string;
}) {
  let text = serialiseBibliography(options.disk);
  const writes: string[] = [];
  const api = {
    zoteroFetchSource: vi.fn((itemKey: string) =>
      Promise.resolve(
        options.fetchFails !== undefined
          ? failure(options.fetchFails)
          : (options.zotero[itemKey] ?? failure("requestFailed")),
      ),
    ),
    readNotebookFile: vi.fn((_folder: number, path: string) =>
      Promise.resolve(
        path === BIBLIOGRAPHY_PATH
          ? ok({ kind: "text", text, sha256: sha256Hex(text) })
          : ok({ kind: "missing" }),
      ),
    ),
    writeNotebookFile: vi.fn((_folder: number, _path: string, next: string) => {
      text = next;
      writes.push(next);
      return Promise.resolve(ok({ kind: "saved", snapshot: null }));
    }),
  };
  return { api, writes, disk: () => parseBibliography(text) };
}

const fetched = (title: string, trashed = false) =>
  ok({
    kind: "found",
    cslJson: JSON.stringify({ id: "x", type: "book", title }),
    serverId: "srv-1",
    trashed,
  });

function setup(
  options: {
    oldStatus?: "ok" | "trashed" | "missing";
    zotero?: Record<string, unknown>;
    fetchFails?: string;
    apply?: boolean;
  } = {},
) {
  const disk = [
    entry(OLD, "Old", options.oldStatus ?? "missing"),
    entry(OTHER, "Other"),
  ];
  const fake = world({
    disk,
    zotero: options.zotero ?? { NEWW3333: fetched("New") },
    ...(options.fetchFails === undefined
      ? {}
      : { fetchFails: options.fetchFails }),
  });
  const { state, one, two } = project(disk);
  const applied: SourceReplacement[] = [];
  const env: RepairEnv = {
    api: fake.api as unknown as RepairEnv["api"],
    folder: 7,
    now: NOW,
    state,
    items: disk,
    render,
    apply: (change) => {
      applied.push(change);
      return Promise.resolve(options.apply ?? true);
    },
  };
  return { env, fake, applied, state, one, two };
}

describe("repairSource", () => {
  it("adds the new source, keeps the old entry, and replaces the citekeys", async () => {
    const { env, fake, applied, one } = setup();
    const outcome = await repairSource(env, OLD, NEW);
    expect(outcome).toMatchObject({ kind: "replaced", experiments: 2 });
    const bibliography = must(fake.disk());
    expect(bibliography.map((i) => i.id).sort()).toEqual([NEW, OLD, OTHER]);
    expect(bibliography.find((i) => i.id === OLD)?._zotero.status).toBe(
      "missing",
    );
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ from: OLD, to: NEW });
    expect(applied[0]?.literature?.[one]).toContain("New");
  });

  it("keeps a Literature block someone edited by hand, and says so", async () => {
    const { env, applied, two } = setup();
    const outcome = await repairSource(env, OLD, NEW);
    expect(applied[0]?.literature).not.toHaveProperty(two);
    expect(outcome).toMatchObject({ kind: "replaced", keptEdited: 1 });
  });

  it("changes only the citekeys in the text it asks to be saved", async () => {
    const { env, applied, state } = setup();
    await repairSource(env, OLD, NEW);
    const change = applied[0];
    if (change === undefined) throw new Error("nothing was applied");
    const plan = must(replaceSource(state, change, ENV));
    const methods = plan.next.experiments.map(
      (e) => e.file.body.sections.find((s) => s.key === "methods")?.body,
    );
    expect(methods).toEqual([
      `Counted [see @${NEW}, p. 3].`,
      `Counted [see @${NEW}, p. 3].`,
      `Only [@${OTHER}].`,
    ]);
  });

  it("works for a trashed source too", async () => {
    const { env } = setup({ oldStatus: "trashed" });
    expect(await repairSource(env, OLD, NEW)).toMatchObject({
      kind: "replaced",
    });
  });

  it("refuses a source that is still in Zotero, writing nothing", async () => {
    const { env, fake, applied } = setup({ oldStatus: "ok" });
    expect(await repairSource(env, OLD, NEW)).toEqual({
      kind: "notRepairable",
    });
    expect(await repairSource(env, "z:u:NONE9999", NEW)).toEqual({
      kind: "notRepairable",
    });
    expect(fake.api.zoteroFetchSource).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([]);
    expect(applied).toEqual([]);
  });

  it("refuses a replacement that is the same source", async () => {
    const { env, fake, applied } = setup();
    expect(await repairSource(env, OLD, OLD)).toEqual({
      kind: "notRepairable",
    });
    expect(fake.writes).toEqual([]);
    expect(applied).toEqual([]);
  });

  it("writes nothing when no experiment cites the source", async () => {
    const { env, fake, applied } = setup();
    const uncited = { ...env, state: { ...env.state, experiments: [] } };
    expect(await repairSource(uncited, OLD, NEW)).toEqual({ kind: "notCited" });
    expect(fake.api.zoteroFetchSource).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([]);
    expect(applied).toEqual([]);
  });

  it("changes nothing while Zotero is closed", async () => {
    const { env, fake, applied } = setup({ fetchFails: "notRunning" });
    expect(await repairSource(env, OLD, NEW)).toEqual({
      kind: "offline",
      reason: "notRunning",
    });
    expect(fake.writes).toEqual([]);
    expect(applied).toEqual([]);
  });

  it("does not replace with an item that is itself in the Zotero trash", async () => {
    const { env, applied } = setup({
      zotero: { NEWW3333: fetched("New", true) },
    });
    expect(await repairSource(env, OLD, NEW)).toEqual({ kind: "notUsable" });
    expect(applied).toEqual([]);
  });

  it("does not replace with an item Zotero cannot find", async () => {
    const { env, applied } = setup({
      zotero: { NEWW3333: ok({ kind: "missing" }) },
    });
    expect(await repairSource(env, OLD, NEW)).toEqual({ kind: "notUsable" });
    expect(applied).toEqual([]);
  });

  it("reports a failed save", async () => {
    const { env } = setup({ apply: false });
    expect(await repairSource(env, OLD, NEW)).toEqual({ kind: "failed" });
  });

  it("still replaces the text when a block cannot be rendered", async () => {
    const { env, applied } = setup();
    const broken = { ...env, render: () => Promise.reject(new Error("x")) };
    expect(await repairSource(broken, OLD, NEW)).toMatchObject({
      kind: "replaced",
    });
    expect(applied[0]?.literature).toEqual({});
  });
});
