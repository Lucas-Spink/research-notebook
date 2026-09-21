import {
  newProject,
  parseExperiment,
  parseQuestion,
  type ExperimentFile,
  type NotebookEnv,
  type NotebookState,
  type Plan,
  type QuestionFile,
  type Result,
} from "../src";
import { PROJECT_ID } from "./samples";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Valid, distinct, ordered ULIDs: `01JAX` and a counter in Crockford Base32. */
export function sequentialIds(): () => string {
  let count = 0;
  return () => {
    count += 1;
    let rest = count;
    let digits = "";
    while (rest > 0) {
      digits = (CROCKFORD[rest % 32] ?? "0") + digits;
      rest = Math.floor(rest / 32);
    }
    return `01JAX${digits.padStart(21, "0")}`;
  };
}

/** A fixed clock that can be moved, so `created` and `updated` differ in tests. */
export function testEnv(
  options: { at?: string; appVersion?: string; newId?: () => string } = {},
): NotebookEnv & { setNow: (iso: string) => void } {
  let now = new Date(options.at ?? "2026-09-21T10:00:00.789Z");
  return {
    now: () => now,
    newId: options.newId ?? sequentialIds(),
    appVersion: options.appVersion ?? "0.2.0",
    setNow: (iso) => {
      now = new Date(iso);
    },
  };
}

/** Unwraps a result that a test expects to succeed. */
export function must<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`expected success: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** A project with no questions, written by version `appVersion`. */
export function emptyState(appVersion = "0.2.0"): NotebookState {
  const created = newProject(
    { name: "Test project", appVersion },
    {
      now: () => new Date("2026-09-01T09:00:00Z"),
      newId: () => PROJECT_ID,
    },
  );
  return {
    project: must(created).project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };
}

/** The text a step writes, or fails if there is no such step. */
export function textOf(plan: Plan, path: string): string {
  const step = plan.steps.find(
    (candidate) => candidate.kind !== "trash" && candidate.path === path,
  );
  if (step === undefined || step.kind === "trash") {
    throw new Error(`no step writes ${path}`);
  }
  return step.text;
}

export function parsedQuestion(text: string): QuestionFile {
  return must(parseQuestion(text));
}

export function parsedExperiment(text: string): ExperimentFile {
  return must(parseExperiment(text));
}

/** Freezes a value and everything in it, so a function that mutates it throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** The item at `index`, or a failure: the tests' stand-in for a non-null assertion. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
}
