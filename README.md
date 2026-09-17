# Computational Research Notebook

A desktop research notebook for recording experiments, evidence and
interpretation alongside the code and data they come from. A project is a
folder whose `_notebook/` directory holds plain Markdown, YAML and CSL-JSON
files; the application is a table-based editor over those files.

The files are the research record. The application is built so that it can
never put them at risk, and so the record stays readable with nothing more
than a text editor if the application is ever unavailable.

## Technology

- **Desktop shell:** Tauri 2 (Rust backend, WebView2 on Windows, WKWebView on
  macOS).
- **Interface:** React and TypeScript in strict mode, in a pnpm workspaces
  monorepo.
- **Notebook format:** plain Markdown, YAML and CSL-JSON, parsed and
  serialised by a single package (`packages/format`).

See [`docs/spec/specification.md`](docs/spec/specification.md) section 6.1
for the full technology stack and section 6.2 for the repository layout.

## Repository layout

```
apps/desktop/       Tauri application (React frontend, Rust backend crates)
packages/format/     Notebook file parsing and serialisation
packages/citations/  Citation contexts and citeproc handling
extensions/vscode/   VS Code capture extension
docs/                Specification, format reference, ADRs, testing guide
fixtures/projects/   Fixture notebook projects used by the test suites
```

## Getting started

Requirements: Node.js as pinned in [`.nvmrc`](.nvmrc) and pnpm as pinned in
`packageManager` in [`package.json`](package.json).

```sh
pnpm install
pnpm check
```

`pnpm check` runs the static checks (lint, type check, formatting,
architecture boundaries) plus the fast unit, property and golden test
suites. See [`package.json`](package.json) for the full list of scripts and
[`docs/testing-guide.md`](docs/testing-guide.md) for what each test layer
covers and how to write new tests.

## Contributing

Read [`AGENTS.md`](AGENTS.md) before making any change — it is binding for
human and AI contributors alike. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how to propose a change.

## Licence

Licensed under the GNU Affero General Public License v3.0 or later. See
[`LICENSE`](LICENSE).
