# ADR-0047: Source details panel

- Status: Proposed
- Date: 2026-10-02
- Deciders: maintainer
- Spec sections affected: 7.8 (FR-CIT-04, FR-CIT-06); gate S5-G04 (must still hold); S5-G07 (new recorded case)

## Context

S5-T07 makes a citation in text open the details of its source, with Open in Zotero, a DOI link and Open PDF when available (FR-CIT-04). Three things were open:

- `bibliography.json` holds CSL-JSON and `_zotero` but no attachment data, and changing the on-disk format needs a version bump and an ADR (AGENTS.md section 2, rule 3).
- Nothing could launch a `zotero://` or `https://` URI from a command. `nb-opener::open_uri` existed but no command called it.
- On Windows `nb-opener` starts a URI with `cmd /C start "" <uri>`, so `&`, `|`, `^`, `%` and quotes in a URI are read as shell syntax. A DOI comes from cached data that Zotero, or anyone who edited the file, controls.

## Decision

1. **No format change.** The panel reads everything but the PDF from `bibliography.json` (FR-CIT-06), so it works with Zotero closed (S5-G04).
2. **Open PDF is looked up live.** `nb_zotero::ZoteroClient::find_pdf_attachment(library, key)` reads `/users|groups/…/items/KEY/children` and returns the key of the first attachment whose content type is `application/pdf` and that is not in the trash. A 404 is `None`, not an error. While Zotero is closed or its local API is off, Open PDF is hidden and the panel says why. A source missing from Zotero is not asked.
3. **Rust builds every URI; the webview names a target.** `open_source_link` takes `ZoteroItem { library, key }`, `ZoteroPdf { library, attachmentKey }` or `Doi { doi }`. `nb_zotero::links` builds `zotero://select/…`, `zotero://open-pdf/…` and `https://doi.org/…` from parts checked against spec 5.7 (`u` or `g<digits>`; an 8-character key from `2-9A-Z`). It returns nothing for anything else, and nothing is launched. The command then calls `nb_opener::open_uri` in `spawn_blocking`.
4. **A narrow DOI character set instead of escaping.** A DOI gets a link only if it matches `10.<4-9 digits>/<[A-Za-z0-9._;()/:-]+>`. That set holds no shell or URL metacharacter, so no escaping exists to get wrong. A DOI outside it (rare: `<`, `>`, `#`, `?`, `%` and similar) shows no link but is still listed. The same pattern is in `model/sourceDetails.ts` so the button is hidden up front, and Rust re-checks.
5. **Placement.** An inline `SourceDetailsPanel` below the Sources panel in `NotebookView`, not a modal. `SourcesContext` gained `selected` and `select(citekey | null)`; closing returns focus to the element that opened it. A citation, and a source in the Sources list, is a button when the bibliography holds it, and plain text when it does not. The click does not propagate, because a citation may sit in a cell with its own click action.
6. **No new dependency and no capability change.** Launching goes through the existing hand-rolled `nb-opener`, not a plugin.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Store the PDF attachment key in `bibliography.json` | An on-disk format change: version bump, migration, fixtures. Also stale as soon as Zotero's attachments change. |
| Let the webview pass a URI to open | Puts launch targets in the webview's hands; AGENTS.md section 2, rule 8. |
| Percent-encode DOIs | `%` is itself special to `cmd`; a conservative allow-list is simpler to audit. |
| `tauri-plugin-opener` | Reopens ADR-0039 and adds a capability. |
| A modal dialog | Traps focus and hides the text being cited. |

## Consequences

- **Open PDF is unavailable while Zotero is closed.** The panel says so.
- **Group-library citations are supported in the URIs and the lookup**, but the picker still only searches the user library (ADR for S5-T02), so no group source can be inserted yet. Group paths are covered only by mock-server and unit tests.
- **`zotero://` links are untested against a real Zotero**, and the `/children` response shape follows Zotero's documented item format, not a recording. Both belong in the manual half of S5-G07.
- **macOS is untested.** `nb-opener`'s `open <uri>` branch does not compile on this Windows machine.
- **Tests:**
  - `crates/nb-zotero/tests/{links,pdf_attachment}.rs`.
  - `commands/zotero_links.rs` in-file unit tests.
  - `features/citations/{SourceDetailsPanel,SourcesPanel}.test.tsx` and `model/sourceDetails.test.ts`.
  - `features/notebook/expanded/StaticSectionContent.test.tsx`.
  - No addition to `fs_safety.rs`: nothing is written.
- **Not tested:** the panel in a real window; the launch itself (the `Launcher` fake is not used for `open_source_link`, which calls the real launcher).
