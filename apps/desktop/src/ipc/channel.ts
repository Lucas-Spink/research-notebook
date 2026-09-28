// A typed command's progress channel (ADR-0044 point 7). Re-exported from
// here, not `bindings.ts`, because that file is generated and never edited
// by hand (AGENTS.md section 5); only `apps/desktop/src/ipc/` may import
// `@tauri-apps/api/core` directly (AGENTS.md section 4).
export { Channel } from "@tauri-apps/api/core";
