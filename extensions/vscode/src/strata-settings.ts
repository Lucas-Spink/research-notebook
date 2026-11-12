import { posix, win32 } from "node:path";

/** The desktop app's identifier (`tauri.conf.json`), which names its settings folder. */
const APP_IDENTIFIER = "io.github.Lucas-Spink.researchnotebook";

/** The settings version this reader understands (`nb-fs` `SETTINGS_VERSION`). */
const SUPPORTED_VERSION = 1;

/** A project the desktop app has opened before, as it remembers it. */
export interface RecentProject {
  id: string;
  name: string;
  path: string;
}

/** The parts of the desktop app's per-machine settings the extension reads. */
export interface StrataSettings {
  /** Most recently opened first. */
  recent: RecentProject[];
  /** Project id, then external root id, to a folder on this machine. */
  externalRoots: Record<string, Record<string, string>>;
}

/**
 * Where the desktop app keeps `settings.json`: Tauri's app config folder for
 * its identifier. `env` and `home` are injected so each platform can be
 * tested from any machine.
 */
export function settingsPath(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  if (platform === "win32") {
    const base = env["APPDATA"] ?? win32.join(home, "AppData", "Roaming");
    return win32.join(base, APP_IDENTIFIER, "settings.json");
  }
  if (platform === "darwin") {
    return posix.join(
      home,
      "Library",
      "Application Support",
      APP_IDENTIFIER,
      "settings.json",
    );
  }
  const base = env["XDG_CONFIG_HOME"] ?? posix.join(home, ".config");
  return posix.join(base, APP_IDENTIFIER, "settings.json");
}

/**
 * `path` without Windows' verbatim prefix, which the desktop app may have
 * stored: `\\?\C:\x` becomes `C:\x` and `\\?\UNC\srv\share` becomes
 * `\\srv\share`. Same rule as `nb-opener::plain_path`; other forms are kept.
 */
export function plainPath(path: string): string {
  if (path.startsWith("\\\\?\\UNC\\")) return `\\\\${path.slice(8)}`;
  if (/^\\\\\?\\[A-Za-z]:\\/.test(path)) return path.slice(4);
  return path;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recentOf(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) return [];
  const entries: unknown[] = value;
  const out: RecentProject[] = [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const { id, name, path } = entry;
    if (
      typeof id === "string" &&
      typeof name === "string" &&
      typeof path === "string"
    ) {
      out.push({ id, name, path: plainPath(path) });
    }
  }
  return out;
}

function externalRootsOf(value: unknown): StrataSettings["externalRoots"] {
  const out: StrataSettings["externalRoots"] = {};
  if (!isObject(value)) return out;
  for (const [projectId, roots] of Object.entries(value)) {
    if (!isObject(roots)) continue;
    const folders: Record<string, string> = {};
    for (const [rootId, folder] of Object.entries(roots)) {
      if (typeof folder === "string") folders[rootId] = plainPath(folder);
    }
    if (Object.keys(folders).length > 0) out[projectId] = folders;
  }
  return out;
}

/**
 * Reads the settings file's text. `undefined` means "no information": the
 * text is damaged, is not an object, has no version or comes from a newer
 * build than this reader knows. Malformed entries inside are skipped. This
 * only reads; the desktop app is the only writer (ADR-0069).
 */
export function parseSettings(text: string): StrataSettings | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(value)) return undefined;
  const version = value["version"];
  if (typeof version !== "number" || version > SUPPORTED_VERSION) {
    return undefined;
  }
  return {
    recent: recentOf(value["recent_projects"]),
    externalRoots: externalRootsOf(value["external_roots"]),
  };
}
