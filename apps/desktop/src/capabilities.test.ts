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
});
