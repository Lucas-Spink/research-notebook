import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { GitBundlePanel } from "./GitBundlePanel";
import { arranged, arrangedWithRepositories } from "./model/fixtures";
import type { GitBundleApi } from "./model/gitBundle";
import { useGitBundle } from "./useGitBundle";

/** FR-ARC-04 from the person's side: opt in, then see what each repository came to. */

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

type Answer = Awaited<ReturnType<GitBundleApi["writeGitBundles"]>>;

function fakeApi(answer: Answer) {
  const calls: unknown[][] = [];
  const api: GitBundleApi = {
    writeGitBundles: (...args) => {
      calls.push(args);
      return Promise.resolve(answer);
    },
  };
  return { api, calls };
}

function Harness(props: {
  api: GitBundleApi;
  repos?: readonly string[];
  writable?: boolean;
}) {
  const model = useGitBundle({
    api: props.api,
    folder: 1,
    arranged:
      props.repos === undefined
        ? arranged()
        : arrangedWithRepositories(props.repos),
    writable: props.writable ?? true,
  });
  return <GitBundlePanel model={model} />;
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

function button(view: HTMLElement): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find((b) =>
    /bundles|writing/i.test(b.textContent),
  );
  if (!found) throw new Error("no button");
  return found;
}

async function write(view: HTMLElement) {
  act(() => button(view).click());
  await flush();
}

describe("GitBundlePanel", () => {
  it("writes nothing until asked, and names the repositories it would bundle", async () => {
    const { api, calls } = fakeApi({ status: "ok", data: [] });

    const view = await show({ api, repos: [".", "vendor/stats"] });

    expect(calls).toEqual([]);
    expect(view.textContent).toContain("the project folder");
    expect(view.textContent).toContain("vendor/stats");
    expect(view.textContent).toContain("not been written yet");
  });

  it("warns that a bundle holds the whole history and may be large", async () => {
    const { api } = fakeApi({ status: "ok", data: [] });
    const view = await show({ api, repos: ["."] });
    expect(view.textContent).toContain("whole history");
  });

  it("says there is nothing to bundle when no file records a repository", async () => {
    const { api } = fakeApi({ status: "ok", data: [] });
    const view = await show({ api });
    expect(view.textContent).toContain("nothing to bundle");
    expect(button(view).disabled).toBe(true);
  });

  it("reports each repository on its own line, successes and failures alike", async () => {
    const { api, calls } = fakeApi({
      status: "ok",
      data: [
        {
          kind: "written",
          file: "_notebook/exports/git/root.bundle",
          bytes: 2_500_000,
        },
        { kind: "notARepository" },
        { kind: "noCommits" },
      ],
    });
    const view = await show({ api, repos: [".", "gone", "empty"] });

    await write(view);

    expect(calls).toHaveLength(1);
    const text = view.textContent;
    expect(text).toContain("_notebook/exports/git/root.bundle");
    expect(text).toContain("2.4 MB");
    expect(text).toContain("gone");
    expect(text).toContain("not the root of a git repository");
    expect(text).toContain("no commits");
    expect(view.querySelector("[role=status]")?.textContent).toContain(
      "1 of 3",
    );
  });

  it("tells the person when git is not installed", async () => {
    const { api } = fakeApi({ status: "ok", data: [{ kind: "gitMissing" }] });
    const view = await show({ api, repos: ["."] });

    await write(view);

    expect(view.textContent).toContain("git is not installed");
  });

  it("shows a failed run as a failure and lists no bundles", async () => {
    const { api } = fakeApi({
      status: "error",
      error: { kind: "writeFailed" },
    });
    const view = await show({ api, repos: ["."] });

    await write(view);

    expect(view.querySelector("[role=alert]")?.textContent).toContain(
      "could not be written",
    );
    expect(view.textContent).not.toContain(".bundle");
  });

  it("does not offer to write in a read-only project", async () => {
    const { api, calls } = fakeApi({ status: "ok", data: [] });
    const view = await show({ api, repos: ["."], writable: false });

    expect(button(view).disabled).toBe(true);
    expect(view.textContent).toContain("read-only");
    act(() => button(view).click());
    await flush();
    expect(calls).toEqual([]);
  });
});
