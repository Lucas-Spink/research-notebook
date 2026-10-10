import { newProject, serialiseProject } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchivePanel } from "./ArchivePanel";
import type { UnarchiveApi } from "./useArchiveProject";
import { useArchiveProject } from "./useArchiveProject";

/** FR-ARC-09 and FR-ARC-10 from the person's side: archive in one step, unarchive only after confirming. */

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const SHA = "c".repeat(64);

function projectText(archived: string | null): string {
  const made = newProject(
    { name: "Screen", appVersion: "0.1.0" },
    {
      now: () => new Date("2026-09-19T08:30:15Z"),
      newId: () => "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
    },
  );
  if (!made.ok) throw new Error(made.error.message);
  const text = serialiseProject(made.value.project);
  return archived === null
    ? text
    : text.replace("archived: null", `archived: "${archived}"`);
}

function fakeApi(text: string) {
  const writes: string[] = [];
  const api: UnarchiveApi = {
    readNotebookFile: () =>
      Promise.resolve({
        status: "ok",
        data: { kind: "text", text, sha256: SHA },
      }),
    writeNotebookFile: (_f, _p, written) => {
      writes.push(written);
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
    backupForVersionChange: () =>
      Promise.resolve({
        status: "ok",
        data: { folder: "backups/x", copied: 1, skipped: 0 },
      }),
    acquireProjectLock: () =>
      Promise.resolve({ status: "ok", data: { kind: "acquired" } }),
    releaseProjectLock: () => Promise.resolve({ status: "ok", data: null }),
    appVersion: () => Promise.resolve("0.2.0"),
  };
  return { api, writes };
}

function Harness(props: {
  api: UnarchiveApi;
  archived: string | null;
  writable: boolean;
  onChanged: () => void;
}) {
  const model = useArchiveProject({
    api: props.api,
    folder: 1,
    archived: props.archived,
    writable: props.writable,
    now: () => new Date("2026-10-10T12:34:56Z"),
    onChanged: props.onChanged,
  });
  return <ArchivePanel model={model} />;
}

async function show(props: Parameters<typeof Harness>[0]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness {...props} />));
  await flush();
  return container;
}

function button(view: HTMLElement, pattern: RegExp): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find((b) =>
    pattern.test(b.textContent),
  );
  if (!found) throw new Error(`no button ${pattern.source}`);
  return found;
}

async function press(view: HTMLElement, pattern: RegExp) {
  act(() => button(view, pattern).click());
  await flush();
}

describe("ArchivePanel (FR-ARC-09)", () => {
  it("archives in one step and tells the project to reload", async () => {
    const { api, writes } = fakeApi(projectText(null));
    const onChanged = vi.fn();
    const view = await show({ api, archived: null, writable: true, onChanged });

    await press(view, /Archive project/);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('archived: "2026-10-10T12:34:56Z"');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("cannot archive a project that is read-only", async () => {
    const { api } = fakeApi(projectText(null));
    const view = await show({
      api,
      archived: null,
      writable: false,
      onChanged: vi.fn(),
    });
    expect(button(view, /Archive project/).disabled).toBe(true);
    expect(view.textContent).toContain("read-only");
  });
});

describe("ArchivePanel (FR-ARC-10)", () => {
  const archived = "2026-10-01T09:00:00Z";

  it("states when the project was archived and offers to unarchive", async () => {
    const { api } = fakeApi(projectText(archived));
    const view = await show({
      api,
      archived,
      writable: false,
      onChanged: vi.fn(),
    });
    expect(view.textContent).toContain("2026-10-01 09:00 UTC");
    expect(button(view, /Unarchive/).disabled).toBe(false);
  });

  it("writes nothing until the person confirms", async () => {
    const { api, writes } = fakeApi(projectText(archived));
    const onChanged = vi.fn();
    const view = await show({ api, archived, writable: false, onChanged });

    await press(view, /Unarchive project/);
    expect(view.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(writes).toEqual([]);

    await press(view, /Cancel/);
    expect(view.querySelector('[role="alertdialog"]')).toBeNull();
    expect(writes).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("unarchives after confirmation and tells the project to reload", async () => {
    const { api, writes } = fakeApi(projectText(archived));
    const onChanged = vi.fn();
    const view = await show({ api, archived, writable: false, onChanged });

    await press(view, /Unarchive project/);
    await press(view, /Yes, unarchive/);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("archived: null");
    expect(writes[0]).toContain('last_written_by: "0.2.0"');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
