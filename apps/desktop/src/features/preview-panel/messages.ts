import type {
  ARTEFACT_TYPES,
  RecognisedSectionKey,
} from "@research-notebook/format";
import type { Availability, OpenFailure } from "../../ipc/bindings";
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
};
