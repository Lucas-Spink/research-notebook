import { ProjectYaml } from "../src/schema";
import type { Arranged } from "../src/notebook/arrange";
import { exportSample } from "./html-export-sample";
import { EXPERIMENT_ID, QUESTION_ID, projectSample } from "./samples";

const DEFAULT_NOTE =
  'Samples were **grown** overnight, see [PCA](evidence/pca.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2") and [volcano](evidence/volcano.png "art:01JAXR1A1A1A1A1A1A1A1A1A1A") [@z:u:7XK2PQ9M, p. 4].';

/** The HTML export's sample experiment, under one question, with valid IDs so the output can be parsed by its schema. */
export function machineSample(
  title = "PCA run",
  markdown = DEFAULT_NOTE,
): Arranged {
  const arranged = exportSample(title, markdown);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.experiment.file.frontmatter.id = EXPERIMENT_ID;
  item.experiment.file.frontmatter.question = QUESTION_ID;
  return {
    ...arranged,
    unassigned: [],
    questions: [
      {
        readOnly: false,
        experiments: [item],
        question: {
          fileName: "Q-001.md",
          file: {
            frontmatter: {
              id: QUESTION_ID,
              ref: "Q-001",
              title: "Why does it grow?",
              created: "2026-09-01T10:00:00Z",
            },
            body: "Because **yeast**.",
          },
        },
      },
    ],
  };
}

export const machineProject = ProjectYaml.parse(projectSample);

export const fixedNow = (): Date => new Date("2026-10-09T12:00:00.789Z");
