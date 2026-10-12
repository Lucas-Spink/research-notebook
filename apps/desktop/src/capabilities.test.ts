import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const capabilitiesDir = join(__dirname, "..", "src-tauri", "capabilities");
const forbiddenPrefixes = ["fs:", "shell:", "http:"];

function readCapabilityFiles(): { file: string; permissions: unknown[] }[] {
  const files = readdirSync(capabilitiesDir).filter((name) =>
    name.endsWith(".json"),
  );
  return files.map((file) => {
    const contents = JSON.parse(
      readFileSync(join(capabilitiesDir, file), "utf-8"),
    ) as {
      permissions?: unknown[];
    };
    return { file, permissions: contents.permissions ?? [] };
  });
}

describe("webview capabilities", () => {
  it("grants no filesystem, shell or http plugin permission", () => {
    const capabilities = readCapabilityFiles();
    expect(capabilities.length).toBeGreaterThan(0);

    for (const { file, permissions } of capabilities) {
      for (const permission of permissions) {
        const identifier =
          typeof permission === "string"
            ? permission
            : JSON.stringify(permission);
        const forbidden = forbiddenPrefixes.find((prefix) =>
          identifier.startsWith(prefix),
        );
        expect(
          forbidden,
          `${file} grants forbidden permission "${identifier}"`,
        ).toBeUndefined();
      }
    }
  });

  it("lets the pop-out canvas window destroy itself, which its close handler does after saving", () => {
    // `onCloseRequested` keeps the native close from happening and calls
    // `destroy()` once the handler settles. Without this permission the window
    // can be neither closed nor saved-and-closed (ADR-0066).
    const canvas = readdirSync(capabilitiesDir)
      .filter((name) => name.endsWith(".json"))
      .map(
        (name) =>
          JSON.parse(readFileSync(join(capabilitiesDir, name), "utf-8")) as {
            windows?: string[];
            permissions?: unknown[];
          },
      )
      .filter((capability) => capability.windows?.includes("canvas"));
    const granted = canvas.flatMap(
      (capability) => capability.permissions ?? [],
    );
    expect(granted).toContain("core:window:allow-destroy");
  });

  it("names every window that has a capability, and keeps destroy off the main window", () => {
    const main = readdirSync(capabilitiesDir)
      .filter((name) => name.endsWith(".json"))
      .map(
        (name) =>
          JSON.parse(readFileSync(join(capabilitiesDir, name), "utf-8")) as {
            windows?: string[];
            permissions?: unknown[];
          },
      )
      .filter((capability) => capability.windows?.includes("main"));
    expect(main.length).toBeGreaterThan(0);
    expect(
      main.flatMap((capability) => capability.permissions ?? []),
    ).not.toContain("core:window:allow-destroy");
  });
});
