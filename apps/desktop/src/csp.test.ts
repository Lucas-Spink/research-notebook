import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tauriConfPath = join(__dirname, "..", "src-tauri", "tauri.conf.json");

// Tauri's own local hosts: IPC (invoke) and the asset:// protocol. Both are
// served from the app's own process, never a remote origin (spec 6.7).
const allowedHttpSources = new Set([
  "http://ipc.localhost",
  "http://asset.localhost",
]);

interface TauriConf {
  app?: {
    security?: {
      csp?: string | Record<string, string | string[]> | null;
      assetProtocol?: { enable?: boolean; scope?: unknown };
    };
  };
}

function readSecurity() {
  const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8")) as TauriConf;
  return conf.app?.security;
}

function readCsp():
  string | Record<string, string | string[]> | null | undefined {
  const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8")) as TauriConf;
  return conf.app?.security?.csp;
}

function directiveSources(value: string | string[]): string[] {
  const text = Array.isArray(value) ? value.join(" ") : value;
  return text.split(/\s+/).filter((token) => token.length > 0);
}

describe("content security policy", () => {
  it("is configured, not null", () => {
    const csp = readCsp();
    expect(csp, "app.security.csp must not be null (spec 6.7)").toBeTruthy();
  });

  it("allows no http(s) source other than Tauri's local IPC and asset hosts", () => {
    const csp = readCsp();
    expect(csp).toBeTruthy();
    expect(typeof csp).not.toBe("string");
    const directives = csp as Record<string, string | string[]>;

    for (const [directive, value] of Object.entries(directives)) {
      for (const source of directiveSources(value)) {
        if (!/^https?:\/\//.test(source)) continue;
        expect(
          allowedHttpSources.has(source),
          `${directive} allows disallowed remote source "${source}"`,
        ).toBe(true);
      }
    }
  });

  it("blocks plugin objects and frames", () => {
    const csp = readCsp();
    const directives = csp as Record<string, string | string[]>;
    expect(directiveSources(directives["object-src"] ?? "")).toEqual([
      "'none'",
    ]);
    expect(directiveSources(directives["frame-src"] ?? "")).toEqual(["'none'"]);
  });

  // S3-T10 (spec 6.7, 8, gate S3-G09): previews add no way for file content
  // to run as code.
  it("runs scripts only from the application itself", () => {
    const directives = readCsp() as Record<string, string | string[]>;
    expect(directiveSources(directives["script-src"] ?? "")).toEqual([
      "'self'",
    ]);
  });

  it("loads images only from the application and the asset protocol, never data: or blob:", () => {
    const directives = readCsp() as Record<string, string | string[]>;
    expect(directiveSources(directives["img-src"] ?? "")).toEqual([
      "'self'",
      "asset:",
      "http://asset.localhost",
    ]);
  });

  it("enables the asset protocol with no static scope; files are allowed one at a time", () => {
    const asset = readSecurity()?.assetProtocol;
    expect(asset?.enable).toBe(true);
    expect(asset?.scope).toEqual([]);
  });
});
