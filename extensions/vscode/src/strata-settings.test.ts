import { describe, expect, it } from "vitest";

import { parseSettings, plainPath, settingsPath } from "./strata-settings";

const ID = "io.github.Lucas-Spink.researchnotebook";

describe("settingsPath", () => {
  it("is under APPDATA on Windows", () => {
    expect(
      settingsPath(
        "win32",
        { APPDATA: "C:\\Users\\a\\AppData\\Roaming" },
        "C:\\Users\\a",
      ),
    ).toBe(`C:\\Users\\a\\AppData\\Roaming\\${ID}\\settings.json`);
  });

  it("falls back to AppData\\Roaming when APPDATA is unset", () => {
    expect(settingsPath("win32", {}, "C:\\Users\\a")).toBe(
      `C:\\Users\\a\\AppData\\Roaming\\${ID}\\settings.json`,
    );
  });

  it("is under Application Support on macOS", () => {
    expect(settingsPath("darwin", {}, "/Users/a")).toBe(
      `/Users/a/Library/Application Support/${ID}/settings.json`,
    );
  });

  it("uses XDG_CONFIG_HOME, then ~/.config, on Linux", () => {
    expect(settingsPath("linux", { XDG_CONFIG_HOME: "/x" }, "/home/a")).toBe(
      `/x/${ID}/settings.json`,
    );
    expect(settingsPath("linux", {}, "/home/a")).toBe(
      `/home/a/.config/${ID}/settings.json`,
    );
  });
});

describe("plainPath", () => {
  it("strips the verbatim prefix before a drive letter", () => {
    expect(plainPath("\\\\?\\C:\\Users\\a\\P")).toBe("C:\\Users\\a\\P");
  });

  it("turns a verbatim UNC path into a UNC path", () => {
    expect(plainPath("\\\\?\\UNC\\srv\\share\\P")).toBe("\\\\srv\\share\\P");
  });

  it("leaves ordinary paths alone", () => {
    expect(plainPath("C:\\Users\\a")).toBe("C:\\Users\\a");
    expect(plainPath("/home/a")).toBe("/home/a");
  });
});

describe("parseSettings", () => {
  const file = (extra: object = {}) =>
    JSON.stringify({
      version: 1,
      recent_projects: [
        { id: "P1", name: "Rotation 1", path: "\\\\?\\C:\\PhD\\Rotation 1" },
        { id: "P2", name: "Other", path: "D:\\other" },
      ],
      external_roots: { P1: { R1: "\\\\?\\D:\\data" } },
      ...extra,
    });

  it("reads recent projects and external roots, in order, with plain paths", () => {
    expect(parseSettings(file())).toEqual({
      recent: [
        { id: "P1", name: "Rotation 1", path: "C:\\PhD\\Rotation 1" },
        { id: "P2", name: "Other", path: "D:\\other" },
      ],
      externalRoots: { P1: { R1: "D:\\data" } },
    });
  });

  it("ignores keys it does not know", () => {
    expect(parseSettings(file({ zoom: 3 }))?.recent).toHaveLength(2);
  });

  it("treats missing lists as empty", () => {
    expect(parseSettings('{"version":1}')).toEqual({
      recent: [],
      externalRoots: {},
    });
  });

  it("skips malformed entries but keeps the good ones", () => {
    const text = JSON.stringify({
      version: 1,
      recent_projects: [{ id: 1 }, null, { id: "P", name: "N", path: "/p" }],
      external_roots: { P: { R: 5, S: "/s" }, Q: "nope" },
    });
    expect(parseSettings(text)).toEqual({
      recent: [{ id: "P", name: "N", path: "/p" }],
      externalRoots: { P: { S: "/s" } },
    });
  });

  it("gives nothing for a newer version, which it cannot understand", () => {
    expect(parseSettings(file({ version: 2 }))).toBeUndefined();
  });

  it("gives nothing for a missing version, damage or the wrong shape", () => {
    expect(parseSettings("{}")).toBeUndefined();
    expect(parseSettings("{ not json")).toBeUndefined();
    expect(parseSettings("[]")).toBeUndefined();
    expect(parseSettings("")).toBeUndefined();
  });
});
