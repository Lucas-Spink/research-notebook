import {
  editArtefacts as editArtefactsFile,
  type ArtefactsFileModel,
  type NotebookState,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import type { CaptureOutcomeDto, EvidenceFailure } from "../../../ipc/bindings";
import type { EditArtefacts } from "./api";
import { FOLDER, sampleNotebook, testEnv } from "./fakeApi";
import { importInboxOnOpen, type InboxApi } from "./inboxImport";

/**
 * S3-G04 (ADR-0044 point 6): each request waiting in the inbox is planned,
 * carried out and recorded when a writable project opens, then removed; an
 * invalid one stays, listed with its reason. Rust's placement is faked, so
 * these tests check what is asked of it and what is recorded.
 */

const REQUEST_ID = "01JAXT0C4D6E8F0G2H4J6K8M0N";

function requestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format_version: 1,
    request_id: REQUEST_ID,
    created: "2026-09-22T11:00:00Z",
    created_by: "vscode-extension@0.1.0",
    role: "result",
    mode: "copy",
    source: { root: "project", path: "results/pca/pca.csv" },
    payload: "pca.csv",
    sha256: "a".repeat(64),
    size: 100,
    provenance: null,
    ...overrides,
  });
}

type Calls = {
  read: string[];
  imported: Parameters<InboxApi["importInboxPayload"]>[];
  removed: string[];
};

function fakeInboxApi(
  requests: string[],
  texts: Record<string, string>,
  imports: (CaptureOutcomeDto | EvidenceFailure)[] = [],
) {
  const calls: Calls = { read: [], imported: [], removed: [] };
  const queue = [...imports];
  const api: InboxApi = {
    listInboxRequests: () =>
      Promise.resolve({ status: "ok" as const, data: requests }),
    readInboxRequest: (_folder, request) => {
      calls.read.push(request);
      const text = texts[request];
      return text === undefined
        ? Promise.resolve({
            status: "error" as const,
            error: { kind: "requestUnavailable" as const },
          })
        : Promise.resolve({ status: "ok" as const, data: text });
    },
    importInboxPayload: (...args) => {
      calls.imported.push(args);
      const next = queue.shift();
      if (next === undefined) throw new Error("unexpected import");
      return Promise.resolve(
        "result" in next
          ? { status: "ok" as const, data: next }
          : { status: "error" as const, error: next },
      );
    },
    removeInboxRequest: (_folder, request) => {
      calls.removed.push(request);
      return Promise.resolve({ status: "ok" as const, data: null });
    },
  };
  return { api, calls };
}

/** Applies each change to `initial` in place, as the real `editArtefacts` does. */
function fakeEditArtefacts(initial: NotebookState) {
  let current = initial;
  const env = testEnv();
  const edit: EditArtefacts = (folder, change) => {
    const planned = editArtefactsFile(
      current,
      folder,
      (f) => change(f, env),
      env,
    );
    if (!planned.ok)
      return Promise.resolve({ ok: false, error: planned.error });
    current = planned.value.next;
    return Promise.resolve({ ok: true });
  };
  return { edit, state: () => current };
}

const created = (file: string, digit = "b", number = 1): CaptureOutcomeDto => ({
  result: {
    kind: "created",
    file,
    sha256: digit.repeat(64),
    size: 100,
    number,
  },
  matchesOtherArtefact: false,
  provenance: null,
});

const duplicate = (version: number): CaptureOutcomeDto => ({
  result: { kind: "duplicate", version },
  matchesOtherArtefact: false,
  provenance: null,
});

function artefactsOf(state: NotebookState, folder: string): ArtefactsFileModel {
  const loaded = state.artefacts?.[folder];
  if (loaded?.kind !== "file") throw new Error("expected a file");
  return loaded.file;
}

describe("importInboxOnOpen", () => {
  it("places a copy-mode request as a new artefact, then removes it", async () => {
    const { state, one } = sampleNotebook();
    const folder = state.experiments.find(
      (e) => e.file.frontmatter.id === one,
    )?.folder;
    if (folder === undefined) throw new Error("sample");
    const request = requestJson({ experiment_id: one });
    const { api, calls } = fakeInboxApi(
      [REQUEST_ID],
      { [REQUEST_ID]: request },
      [created("evidence/pca.csv")],
    );
    const { edit, state: after } = fakeEditArtefacts(state);

    const invalid = await importInboxOnOpen(api, FOLDER, () => after(), edit);

    expect(invalid).toEqual([]);
    expect(calls.removed).toEqual([REQUEST_ID]);
    const file = artefactsOf(after(), folder);
    expect(file.artefacts).toHaveLength(1);
    expect(file.artefacts[0]).toMatchObject({
      mode: "copy",
      source: { root: "project", path: "results/pca/pca.csv" },
    });
  });

  it("records a link-mode request without asking Rust to place anything", async () => {
    const { state, one } = sampleNotebook();
    const folder = state.experiments.find(
      (e) => e.file.frontmatter.id === one,
    )?.folder;
    if (folder === undefined) throw new Error("sample");
    const request = requestJson({
      experiment_id: one,
      mode: "link",
      payload: null,
      source: { root: "project", path: "data/big.csv" },
    });
    const { api, calls } = fakeInboxApi([REQUEST_ID], {
      [REQUEST_ID]: request,
    });
    const { edit, state: after } = fakeEditArtefacts(state);

    const invalid = await importInboxOnOpen(api, FOLDER, () => after(), edit);

    expect(invalid).toEqual([]);
    expect(calls.imported).toEqual([]);
    expect(calls.removed).toEqual([REQUEST_ID]);
    const file = artefactsOf(after(), folder);
    expect(file.artefacts[0]).toMatchObject({ mode: "link" });
  });

  it("clears a request whose content nb-fs already holds, without a new version", async () => {
    const { state, one } = sampleNotebook();
    const request = requestJson({ experiment_id: one });
    const { api, calls } = fakeInboxApi(
      [REQUEST_ID],
      { [REQUEST_ID]: request },
      [duplicate(1)],
    );
    const { edit, state: after } = fakeEditArtefacts(state);

    const invalid = await importInboxOnOpen(api, FOLDER, () => after(), edit);

    expect(invalid).toEqual([]);
    expect(calls.removed).toEqual([REQUEST_ID]);
    const folder = state.experiments.find(
      (e) => e.file.frontmatter.id === one,
    )?.folder;
    if (folder === undefined) throw new Error("sample");
    expect(artefactsOf(after(), folder).artefacts).toEqual([]);
  });

  it("leaves a request that does not parse, listed with its reason", async () => {
    const { state } = sampleNotebook();
    const { api, calls } = fakeInboxApi([REQUEST_ID], {
      [REQUEST_ID]: "{not json",
    });
    const { edit, state: after } = fakeEditArtefacts(state);

    const invalid = await importInboxOnOpen(api, FOLDER, () => after(), edit);

    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.request).toBe(REQUEST_ID);
    expect(calls.removed).toEqual([]);
  });

  it("leaves a request naming an experiment that no longer exists", async () => {
    const { state } = sampleNotebook();
    const request = requestJson({
      experiment_id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C",
    });
    const { api, calls } = fakeInboxApi([REQUEST_ID], {
      [REQUEST_ID]: request,
    });
    const { edit, state: after } = fakeEditArtefacts(state);

    const invalid = await importInboxOnOpen(api, FOLDER, () => after(), edit);

    expect(invalid).toEqual([
      { request: REQUEST_ID, reason: "its experiment no longer exists" },
    ]);
    expect(calls.removed).toEqual([]);
  });

  it("imports every waiting request, one after another", async () => {
    const { state, one, two } = sampleNotebook();
    const secondId = "01JAXT0C4D6E8F0G2H4J6K8M0P";
    const first = requestJson({ experiment_id: one });
    const second = requestJson({
      request_id: secondId,
      experiment_id: two,
      payload: "scores.csv",
      source: { root: "project", path: "results/scores.csv" },
      sha256: "c".repeat(64),
    });
    const { api, calls } = fakeInboxApi(
      [REQUEST_ID, secondId],
      { [REQUEST_ID]: first, [secondId]: second },
      [created("evidence/pca.csv"), created("evidence/scores.csv", "d")],
    );
    const { edit, state: after } = fakeEditArtefacts(state);

    const invalid = await importInboxOnOpen(api, FOLDER, () => after(), edit);

    expect(invalid).toEqual([]);
    expect(calls.removed).toEqual([REQUEST_ID, secondId]);
  });
});
