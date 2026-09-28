import type {
  ARTEFACT_TYPES,
  NotebookError,
  RecognisedSectionKey,
} from "@research-notebook/format";
import type {
  Availability,
  EvidenceFailure,
  OpenFailure,
  Refusal,
} from "../../ipc/bindings";
import { formatSize } from "../preview";

type ArtefactType = (typeof ARTEFACT_TYPES)[number];

const sectionLabels: Record<RecognisedSectionKey, string> = {
  methods: "Methods",
  results_notes: "Results notes",
  interpretation: "Interpretation",
};

/** User-facing text for the preview panel, in British English (AGENTS.md
 * section 5). */
export const panelMessages = {
  role: { result: "Result", method: "Method" },
  mode: { copy: "Copy", link: "Link" },
  types: {
    image: "Image",
    pdf: "PDF",
    svg: "SVG image",
    table: "Table",
    script: "Script",
    notebook: "Notebook",
    text: "Text",
    html: "HTML report",
    other: "Other",
  } satisfies Record<ArtefactType, string>,
  groupLocations: "In",
  ungroupedNote: "Not in any group.",
  referencedIn: {
    heading: "Referenced in",
    none: "Not referenced anywhere.",
    location: (ref: string, title: string, section: RecognisedSectionKey) =>
      `${ref} ${title} / ${sectionLabels[section]}`,
  },
  versions: {
    heading: "Versions",
    captured: (v: number, when: string) => `v${v}, captured ${when}`,
    provenance: (commit: string, dirty: boolean) =>
      dirty
        ? `From ${commit.slice(0, 8)} (uncommitted changes at capture)`
        : `From ${commit.slice(0, 8)}`,
    /** Marks the version a reference chip opened (FR-EDT-06), which may not be the latest. */
    pinned: "Pinned",
  },
  link: {
    heading: "Link",
    recorded: (size: string, when: string) =>
      `Recorded ${size}, checked ${when}`,
  },
  availability: {
    checking: "Checking availability…",
    recheck: "Check again",
    text(availability: Availability): string {
      switch (availability.kind) {
        case "available":
          return `Available (${formatSize(availability.size)})`;
        case "missing":
          return "Missing: the file is not at its recorded location.";
        case "rootUnresolved":
          return "Unavailable: this external root has no folder set on this machine.";
        case "rootFolderMissing":
          return "Unavailable: the external root's folder no longer exists.";
        default:
          return "Availability could not be checked.";
      }
    },
  },
  actions: {
    openFile: "Open file",
    reveal: "Reveal",
    openInVsCode: "Open in VS Code",
    copyPath: "Copy path",
    openProjectFolder: "Open project folder",
    copied: "Path copied.",
  },
  actionFailures: {
    projectUnavailable: "The project folder can no longer be opened.",
    fileUnavailable:
      "The file could not be opened. Another program may be using it.",
    rootUnresolved: "This external root has no folder set on this machine.",
    rootFolderMissing: "The external root's folder no longer exists.",
    settingsUnavailable: "The application's settings could not be read.",
    actionFailed: "The action could not be started.",
  } satisfies Record<OpenFailure["kind"], string>,
  relink: {
    findNewLocation: "Find new location…",
    choosing: "Choosing a folder…",
    heading: "Choose the new location",
    noCandidates: "No files in that folder match this one.",
    useThis: "Use this",
    close: "Close",
    dismiss: "Dismiss",
    matches: {
      name: "name",
      size: "size",
      hash: "content",
    },
  },
};

/** Why the person could not choose a folder or list its candidates for
 * Relink (FR-EVD-08). Never a path or system text. */
const relinkFailures: Record<EvidenceFailure["kind"], string> = {
  projectUnavailable: "the project folder can no longer be opened",
  settingsUnavailable: "the application's settings could not be read",
  rootUnavailable: "the folder it belongs to is not set on this computer",
  sourceUnavailable: "it is no longer there",
  invalidRequest: "its name was not acceptable",
  verificationFailed: "the copy did not match the original",
  versionExists: "a version with that name already exists",
  requestUnavailable: "it could not be read from the inbox",
  payloadMismatch: "what was received does not match what was declared",
  writeFailed: "it could not be written into the notebook",
  folderUnavailable:
    "the chosen folder is gone, is not a folder, or could not be read",
  invalidPattern: "one of the patterns is not valid",
  internal: "something unexpected happened",
};

export function relinkFailureText(kind: EvidenceFailure["kind"]): string {
  return `The new location could not be found: ${relinkFailures[kind]}.`;
}

const relinkRefusals: Record<Refusal["kind"], string> = {
  outsideRoots:
    "it is outside the project folder and its external roots, so the notebook could not record where it came from",
  insideNotebook: "it is inside the notebook's own folder",
  notAFile: "it is not a file",
  notAFolder: "it is not a folder",
  unreadable: "it could not be read",
};

export function relinkRefusalText(kind: Refusal["kind"]): string {
  return `That folder cannot be used: ${relinkRefusals[kind]}.`;
}

/** Why a confirmed candidate could not be recorded, for the reasons specific
 * to this action; a write failure is already shown by the notebook's own
 * notice. */
export function relinkNotebookErrorText(error: NotebookError): string {
  return error.kind === "invalid"
    ? error.message
    : `That ${error.entity} no longer exists.`;
}
