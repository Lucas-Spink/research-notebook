import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseRequest,
  type InboxRequestModel,
} from "@research-notebook/format";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeInboxRequest } from "./write-request";

const REQUEST_ID = "01JAXT0C4D6E8F0G2H4J6K8M0N";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rn-vscode-write-request-"));
  mkdirSync(join(dir, "_notebook"), { recursive: true });
  writeFileSync(join(dir, "_notebook", "project.yaml"), "format_version: 1\n");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function copyRequest(
  overrides: Partial<InboxRequestModel> = {},
): InboxRequestModel {
  return {
    format_version: 1,
    request_id: REQUEST_ID,
    created: "2026-09-23T11:00:00Z",
    created_by: "vscode-extension@0.1.0",
    experiment_id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C",
    role: "result",
    mode: "copy",
    source: { root: "project", path: "results/pca/pca.pdf" },
    payload: "pca.pdf",
    sha256: createHash("sha256").update("payload bytes").digest("hex"),
    size: Buffer.byteLength("payload bytes"),
    provenance: null,
    ...overrides,
  };
}

describe("writeInboxRequest", () => {
  it("writes the folder under its final name, with no .tmp left behind", async () => {
    const request = copyRequest();
    await writeInboxRequest(dir, request, Buffer.from("payload bytes"));

    const inboxDir = join(dir, "_notebook", "inbox");
    expect(readdirSync(inboxDir)).toEqual([REQUEST_ID]);
    expect(existsSync(join(inboxDir, `${REQUEST_ID}.tmp`))).toBe(false);
  });

  it("writes a request.json that round-trips through parseRequest", async () => {
    const request = copyRequest();
    await writeInboxRequest(dir, request, Buffer.from("payload bytes"));

    const text = readFileSync(
      join(dir, "_notebook", "inbox", REQUEST_ID, "request.json"),
      "utf8",
    );
    const parsed = parseRequest(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.value : null).toEqual(request);
  });

  it("writes a payload whose hash matches the request", async () => {
    const payload = Buffer.from("payload bytes");
    const request = copyRequest({
      sha256: createHash("sha256").update(payload).digest("hex"),
      size: payload.length,
    });
    await writeInboxRequest(dir, request, payload);

    const written = readFileSync(
      join(dir, "_notebook", "inbox", REQUEST_ID, "pca.pdf"),
    );
    expect(createHash("sha256").update(written).digest("hex")).toBe(
      request.sha256,
    );
    expect(written.length).toBe(request.size);
  });

  it("writes nothing for link mode beyond request.json", async () => {
    const request = copyRequest({ mode: "link", payload: null });
    await writeInboxRequest(dir, request, null);

    const requestDir = join(dir, "_notebook", "inbox", REQUEST_ID);
    expect(readdirSync(requestDir)).toEqual(["request.json"]);
  });

  it("touches nothing else under _notebook/", async () => {
    const before = readFileSync(join(dir, "_notebook", "project.yaml"), "utf8");
    await writeInboxRequest(dir, copyRequest(), Buffer.from("payload bytes"));

    expect(readFileSync(join(dir, "_notebook", "project.yaml"), "utf8")).toBe(
      before,
    );
    expect(readdirSync(join(dir, "_notebook"))).toEqual(
      ["inbox", "project.yaml"].sort(),
    );
  });
});
