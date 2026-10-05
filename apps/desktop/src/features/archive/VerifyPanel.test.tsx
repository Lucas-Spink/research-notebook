import {
  buildManifest,
  type ManifestObservation,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { arranged as sample } from "./model/fixtures";
import type { VerifyApi } from "./model/verify";
import { useVerify } from "./useVerify";
import { VerifyPanel } from "./VerifyPanel";

/** FR-ARC-03 from the person's side: verify, then see what matched and what did not. */

const HASH = "a".repeat(64);
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

const csv = buildManifest(
  sample(),
  new Map<string, ManifestObservation>(
    ["evidence/plot.pdf", "evidence/plot.v2.pdf"].map((file) => [
      `_notebook/experiments/EXP-001/${file}`,
      { kind: "observed", size: 3, modifiedMs: 0, sha256: HASH },
    ]),
  ),
).csv;

type Read = Awaited<ReturnType<VerifyApi["readManifest"]>>;
type Verified = Awaited<ReturnType<VerifyApi["verifyManifestFiles"]>>;

function apiWith(read: Read, verified: Verified): VerifyApi {
  return {
    readManifest: () => Promise.resolve(read),
    verifyManifestFiles: () => Promise.resolve(verified),
  };
}

const found: Read = { status: "ok", data: { kind: "found", text: csv } };

function Harness({ api }: { api: VerifyApi }) {
  return (
    <VerifyPanel model={useVerify({ api, folder: 1, arranged: sample() })} />
  );
}

async function verify(api: VerifyApi) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness api={api} />));
  await flush();
  const view = container;
  expect(view.textContent).toContain("have not been verified yet");
  act(() => view.querySelector("button")?.click());
  await flush();
  return view;
}

describe("VerifyPanel", () => {
  it("says every file matches only when every listed file did", async () => {
    const view = await verify(
      apiWith(found, {
        status: "ok",
        data: [{ kind: "matches" }, { kind: "matches" }],
      }),
    );
    expect(view.textContent).toContain(
      "2 files checked. Every listed file matches",
    );
  });

  it("names each file that is missing or changed, and does not say it is clean", async () => {
    const view = await verify(
      apiWith(found, {
        status: "ok",
        data: [
          { kind: "missing" },
          { kind: "differs", sizeChanged: false, hashChanged: true },
        ],
      }),
    );
    expect(view.textContent).toContain("evidence/plot.pdf: not found");
    expect(view.textContent).toContain(
      "evidence/plot.v2.pdf: the contents differ",
    );
    expect(view.textContent).not.toContain("Every listed file matches");
  });

  it("shows no manifest as a failure, not a pass", async () => {
    const view = await verify(
      apiWith(
        { status: "ok", data: { kind: "missing" } },
        { status: "ok", data: [] },
      ),
    );
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(
      "no manifest",
    );
    expect(view.textContent).not.toContain("Every listed file matches");
  });
});
