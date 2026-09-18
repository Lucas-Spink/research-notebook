// Writes docs/format/schemas/*.schema.json from the Zod schemas in
// packages/format. Generated files are never edited by hand (AGENTS.md
// section 5). Run with `pnpm schemas:export` after any schema change;
// packages/format/test/schema-json.test.ts fails if the committed files drift.
//
// packages/format performs no I/O, so this script, not the package, owns the
// writing. Node runs the TypeScript sources directly (type stripping); the
// resolve hook below only supplies the extensionless imports the sources use.
import { registerHooks } from "node:module";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        const candidate = fileURLToPath(base) + suffix;
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { renderJsonSchemaFiles } = await import(
  new URL("../packages/format/src/schema/index.ts", import.meta.url).href
);

const outDir = new URL("../docs/format/schemas/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const files = renderJsonSchemaFiles();
for (const stale of readdirSync(outDir)) {
  if (stale.endsWith(".schema.json") && !(stale in files)) {
    rmSync(new URL(stale, outDir));
  }
}
for (const [name, text] of Object.entries(files)) {
  writeFileSync(new URL(name, outDir), text, "utf8");
}
console.log(
  `Wrote ${Object.keys(files).length} schemas to docs/format/schemas/`,
);
