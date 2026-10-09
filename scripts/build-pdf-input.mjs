// Writes the three files `export_fixture` turns into project.pdf, from a
// project folder: pdf-input.json, notebook.json and bibliography.json
// (S6-T06, FR-ARC-06). The project is only read.
//
// Usage: node scripts/build-pdf-input.mjs <project folder> <output folder> [ISO time]
import { mkdirSync, writeFileSync } from "node:fs";
import { buildPdfFiles } from "./lib/pdf-input.mjs";

const [project, out, at] = process.argv.slice(2);
if (project === undefined || out === undefined) {
  console.error(
    "usage: node scripts/build-pdf-input.mjs <project folder> <output folder> [ISO time]",
  );
  process.exit(2);
}
const instant = at === undefined ? new Date() : new Date(at);
if (Number.isNaN(instant.getTime())) {
  console.error(`not a time: ${at}`);
  process.exit(2);
}

const files = buildPdfFiles(project, { now: () => instant });
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/pdf-input.json`, files.input, "utf8");
writeFileSync(`${out}/notebook.json`, files.notebookJson, "utf8");
writeFileSync(`${out}/bibliography.json`, files.bibliographyJson, "utf8");
console.log(
  `Wrote pdf-input.json, notebook.json and bibliography.json to ${out}`,
);
