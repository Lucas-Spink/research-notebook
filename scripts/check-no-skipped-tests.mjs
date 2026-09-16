// Fails if staged test files contain focused or skipped tests (AGENTS.md rule 2.4).
import { readFileSync } from "node:fs";

const pattern = /\b(it|test|describe)\.(only|skip|todo)\s*\(|\bx(it|describe|test)\s*\(/;
const offenders = process.argv
  .slice(2)
  .filter((file) => /\.test\.tsx?$/.test(file))
  .filter((file) => pattern.test(readFileSync(file, "utf8")));

if (offenders.length > 0) {
  console.error("Focused or skipped tests are not allowed:\n" + offenders.join("\n"));
  process.exit(1);
}
