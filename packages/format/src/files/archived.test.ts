import { describe, expect, it } from "vitest";
import { PROJECT_ID } from "../../test/samples";
import { markArchived, markUnarchived } from "./archived";
import { newProject } from "./new-project";
import { parseProject, serialiseProject } from "./project";

/** FR-ARC-09 and FR-ARC-10: the archived flag is the only key archiving changes. */

function base() {
  const made = newProject(
    { name: "Batch effects", appVersion: "0.1.0" },
    {
      now: () => new Date("2026-09-19T08:30:15.789Z"),
      newId: () => PROJECT_ID,
    },
  );
  if (!made.ok) throw new Error(made.error.message);
  return made.value.project;
}

const NOW = () => new Date("2026-10-10T12:34:56.789Z");

describe("markArchived", () => {
  it("records the time to the second and changes nothing else", () => {
    const project = base();
    const archived = markArchived(project, NOW);
    expect(archived).toEqual({ ...project, archived: "2026-10-10T12:34:56Z" });
  });

  it("does not stamp last_written_by, which archiving does not claim", () => {
    expect(markArchived(base(), NOW).last_written_by).toBe("0.1.0");
  });

  it("does not mutate its argument", () => {
    const project = Object.freeze(base());
    expect(() => markArchived(project, NOW)).not.toThrow();
    expect(project.archived).toBeNull();
  });

  it("keeps unknown keys through archive, serialise and parse", () => {
    const text = serialiseProject(base()).concat("future_key: kept\n");
    const first = parseProject(text);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const out = serialiseProject(markArchived(first.value, NOW));
    expect(out).toContain('future_key: "kept"');
    const second = parseProject(out);
    expect(second.ok && second.value.archived).toBe("2026-10-10T12:34:56Z");
  });
});

describe("markUnarchived", () => {
  it("returns the project to the text it had before archiving", () => {
    const project = base();
    const back = markUnarchived(markArchived(project, NOW), "0.1.0");
    expect(serialiseProject(back)).toBe(serialiseProject(project));
  });

  it("clears the flag and stamps the running version", () => {
    const back = markUnarchived(markArchived(base(), NOW), "0.9.0");
    expect(back.archived).toBeNull();
    expect(back.last_written_by).toBe("0.9.0");
  });

  it("writes null for an active project, the one place null is written", () => {
    const text = serialiseProject(
      markUnarchived(markArchived(base(), NOW), "0.1.0"),
    );
    expect(text).toContain("archived: null");
  });
});
