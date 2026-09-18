# ADR-0013: Zotero local API Rust client behaviour

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 7.8

## Context

S1-T04 spiked a Rust client for Zotero's local HTTP API, needing to detect
not-running, disabled (403) and connected states, search items, fetch
CSL-JSON and record the `Zotero-Server-ID` header when present.

## Decision

Adopt `nb-zotero`'s `ureq`-based client design for the production
implementation. Evidence, all in
`apps/desktop/src-tauri/crates/nb-zotero/src/lib.rs`:

- Not-running: `check_status()` (lines 88-105) matches
  `ureq::Error::Io`/`ConnectionRefused` → `ZoteroStatus::NotRunning`.
- Disabled/403: same function, `Err(ureq::Error::StatusCode(403))` →
  `ZoteroStatus::Disabled`.
- Connected + search + CSL-JSON: `Connected{server_id}` (lines 96-98),
  `search_items()` (108-118), `fetch_csl_json()` with
  `query("format","csljson")` (121-131).
- `Zotero-Server-ID` header: `server_id_header()` (134-140).
- `apps/desktop/src-tauri/crates/nb-zotero/tests/contract.rs` has 5 passing
  tests against a hand-rolled `TcpListener::bind("127.0.0.1:0")` mock
  server — genuinely loopback-only, per AGENTS.md's no-network rule.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Test against a real running Zotero in CI | AGENTS.md forbids network access beyond 127.0.0.1 and the updater; a mock server on loopback is the only CI-safe option. Real-Zotero verification stays a manual step. |

## Consequences

- Gate test S1-G04 remains "Partly" automated, as already recorded in the
  workbook: the mock-server half is fully covered, but the manual half
  (running against a current Zotero release and beta) has not been done in
  this session and needs a person with Zotero installed.
- A known gap is flagged in code (`lib.rs:9-13`): the `format=csljson`
  query parameter isn't confirmed against Zotero's own API guide and
  deserves a spot check during the manual verification pass.
- `ureq` is pinned at 3.4.2 with `default-features = false, features =
  ["json"]` (no TLS, loopback only) in `nb-zotero/Cargo.toml`.
