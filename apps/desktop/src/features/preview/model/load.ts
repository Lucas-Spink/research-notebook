import type {
  AssetKind,
  commands,
  FolderHandle,
  NotebookPreview,
  PreviewFailure,
  TablePreview,
  TextPreview,
} from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";
import type { PreviewPlan } from "./plan";

/** The commands previews use, so tests can supply a fake with their shape. */
export type PreviewApi = Pick<
  typeof commands,
  | "previewAsset"
  | "previewThumbnail"
  | "previewTable"
  | "previewText"
  | "previewNotebook"
>;

/** Which version to preview. */
export type PreviewTarget = {
  folder: FolderHandle;
  /** Project-relative path of the version's file (see `versionPath`). */
  file: string;
  /** The version's recorded SHA-256, which keys its cached thumbnail. */
  sha256: string;
};

/** What a ready preview shows. */
export type PreviewContent =
  | { kind: "image" | "pdf" | "svg"; url: string }
  | { kind: "table"; table: TablePreview; expanded: boolean }
  | { kind: "text"; text: TextPreview }
  | { kind: "notebook"; notebook: NotebookPreview }
  | { kind: "html" }
  | { kind: "other"; reason: "type" | "linked" };

/**
 * Why a preview is not shown: a command's failure, or `renderFailed` when
 * the webview could not draw a file it was given (an `<img>` error or a
 * pdf.js failure).
 */
export type FailureKind = PreviewFailure["kind"] | "renderFailed";

export type PreviewState =
  | { status: "loading" }
  | { status: "ready"; content: PreviewContent }
  | { status: "failed"; failure: FailureKind };

type Answer<T> =
  { status: "ok"; data: T } | { status: "error"; error: PreviewFailure };

/** Waits for a command, turning a thrown IPC error into `internal`. */
async function settle<T>(call: () => Promise<Answer<T>>): Promise<Answer<T>> {
  try {
    return await call();
  } catch {
    return { status: "error", error: { kind: "internal" } };
  }
}

function toState<T>(
  answer: Answer<T>,
  content: (data: T) => PreviewContent,
): PreviewState {
  return answer.status === "ok"
    ? { status: "ready", content: content(answer.data) }
    : { status: "failed", failure: answer.error.kind };
}

async function asset(
  api: PreviewApi,
  target: PreviewTarget,
  kind: AssetKind,
): Promise<PreviewState> {
  const answer = await settle(() =>
    api.previewAsset(target.folder, target.file, kind),
  );
  return toState(answer, ({ url }) => ({ kind, url }));
}

/**
 * Loads what a preview needs (spec 8). HTML and other files are never read:
 * they show details only, and HTML opens in the browser (spec 6.7).
 */
export async function loadPreview(
  api: PreviewApi,
  target: PreviewTarget,
  plan: PreviewPlan,
  expanded: boolean,
): Promise<PreviewState> {
  const { folder, file } = target;
  switch (plan.kind) {
    case "image":
    case "pdf":
    case "svg":
      return asset(api, target, plan.kind);
    case "table": {
      const answer = await settle(() =>
        api.previewTable(folder, file, expanded),
      );
      return toState(answer, (table) => ({ kind: "table", table, expanded }));
    }
    case "text": {
      const answer = await settle(() => api.previewText(folder, file));
      return toState(answer, (text) => ({ kind: "text", text }));
    }
    case "notebook": {
      const answer = await settle(() => api.previewNotebook(folder, file));
      return toState(answer, (notebook) => ({ kind: "notebook", notebook }));
    }
    case "html":
      return { status: "ready", content: { kind: "html" } };
    case "other":
      return {
        status: "ready",
        content: { kind: "other", reason: plan.reason },
      };
    default:
      return assertNever(plan);
  }
}

/** The type icons spec 8 names in its "Thumbnail" column. */
export type TypeIcon = PreviewPlan["kind"];

export type Thumbnail =
  | { kind: "image"; url: string }
  | { kind: "pdf"; url: string }
  | { kind: "icon"; icon: TypeIcon };

/**
 * A version's thumbnail (spec 8): Rust's cached PNG for raster images, the
 * SVG itself, a PDF for pdf.js to draw its first page, and otherwise the type
 * icon. Any failure falls back to the icon, as spec 8 asks.
 */
export async function loadThumbnail(
  api: PreviewApi,
  target: PreviewTarget,
  plan: PreviewPlan,
): Promise<Thumbnail> {
  const icon: Thumbnail = { kind: "icon", icon: plan.kind };
  const { folder, file, sha256 } = target;
  switch (plan.kind) {
    case "image": {
      const answer = await settle(() =>
        api.previewThumbnail(folder, file, sha256),
      );
      return answer.status === "ok"
        ? { kind: "image", url: answer.data.url }
        : icon;
    }
    case "svg":
    case "pdf": {
      const answer = await settle(() =>
        api.previewAsset(folder, file, plan.kind),
      );
      if (answer.status !== "ok") return icon;
      return plan.kind === "pdf"
        ? { kind: "pdf", url: answer.data.url }
        : { kind: "image", url: answer.data.url };
    }
    case "table":
    case "text":
    case "notebook":
    case "html":
    case "other":
      return icon;
    default:
      return assertNever(plan);
  }
}

/** The recovery a failed preview offers (FR-PRV-05). */
export type Recovery = "retry" | "openExternally";

/**
 * Passing problems, such as a file briefly held by another program, offer
 * Try again. Problems with the file itself offer opening it in its own
 * application, since trying again would fail the same way.
 */
export function recoveryFor(failure: FailureKind): Recovery {
  switch (failure) {
    case "projectUnavailable":
    case "fileMissing":
    case "fileUnavailable":
    case "cacheUnavailable":
    case "internal":
      return "retry";
    case "notPreviewable":
    case "tooLarge":
    case "tooManyPixels":
    case "unreadable":
    case "renderFailed":
      return "openExternally";
    default:
      return assertNever(failure);
  }
}
