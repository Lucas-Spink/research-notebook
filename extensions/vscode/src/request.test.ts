import { InboxRequest } from "@research-notebook/format";
import { describe, expect, it } from "vitest";

import { buildInboxRequest, type BuildRequestInput } from "./request";

const REQUEST_ID = "01JAXT0C4D6E8F0G2H4J6K8M0N";
const EXPERIMENT_ID = "01JAXQ8M3K7T2V9R4W6Y5Z0B1C";

function input(overrides: Partial<BuildRequestInput> = {}): BuildRequestInput {
  return {
    requestId: REQUEST_ID,
    createdAt: new Date("2026-09-23T11:00:00.000Z"),
    extensionVersion: "0.1.0",
    projectRoot: "/home/user/project",
    filePath: "/home/user/project/results/pca/pca.pdf",
    experimentId: EXPERIMENT_ID,
    role: "result",
    mode: "copy",
    sha256: "a".repeat(64),
    size: 100,
    payload: "pca.pdf",
    provenance: null,
    ...overrides,
  };
}

describe("buildInboxRequest", () => {
  it("builds a request that validates against the InboxRequest schema", () => {
    const request = buildInboxRequest(input());
    expect(InboxRequest.safeParse(request).success).toBe(true);
  });

  it("always records source.root as project", () => {
    const request = buildInboxRequest(input());
    expect(request.source).toEqual({
      root: "project",
      path: "results/pca/pca.pdf",
    });
  });

  it("formats created as RFC 3339 with second precision", () => {
    const request = buildInboxRequest(input());
    expect(request.created).toBe("2026-09-23T11:00:00Z");
  });

  it("names created_by after the extension's own version", () => {
    const request = buildInboxRequest(input({ extensionVersion: "1.2.3" }));
    expect(request.created_by).toBe("vscode-extension@1.2.3");
  });

  it("sets payload to null for link mode", () => {
    const request = buildInboxRequest(input({ mode: "link", payload: null }));
    expect(request.payload).toBeNull();
  });

  it("carries provenance through unchanged", () => {
    const provenance = {
      repo: ".",
      commit: "b".repeat(40),
      path_in_repo: "results/pca/pca.pdf",
      file_dirty: true,
      tree_dirty: true,
    };
    const request = buildInboxRequest(input({ provenance }));
    expect(request.provenance).toEqual(provenance);
  });

  it("throws when the assembled request would not validate", () => {
    expect(() => buildInboxRequest(input({ sha256: "not a hash" }))).toThrow();
  });
});
