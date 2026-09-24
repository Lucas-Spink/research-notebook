import type { NotebookPreview } from "../../ipc/bindings";
import { formatSize, previewMessages as m } from "./messages";
import { recoveryFor, type FailureKind } from "./model/load";
import type { PreviewPlan } from "./model/plan";

/** What the panel knows about a version's file without reading it. */
export type FileDetails = {
  /** The artefact's display name. */
  name: string;
  fileName: string;
  /** Bytes, as recorded for the version. */
  size: number;
  /** Where the file is, as shown to the person. */
  location: string;
};

type DetailsProps = { details: FileDetails; kind: PreviewPlan["kind"] };

/** File name, type, size and location (spec 8, "Other"). */
export function DetailsList({ details, kind }: DetailsProps) {
  return (
    <dl className="preview__details">
      <dt>{m.details.fileName}</dt>
      <dd>{details.fileName}</dd>
      <dt>{m.details.type}</dt>
      <dd>{m.types[kind]}</dd>
      <dt>{m.details.size}</dt>
      <dd>{formatSize(details.size)}</dd>
      <dt>{m.details.location}</dt>
      <dd className="preview__location">{details.location}</dd>
    </dl>
  );
}

type NotebookProps = {
  details: FileDetails;
  notebook: NotebookPreview;
  onOpenInVsCode: () => void;
};

/** A notebook's details, language and kernel (spec 8). */
export function NotebookView({
  details,
  notebook,
  onOpenInVsCode,
}: NotebookProps) {
  return (
    <div className="preview__details-frame">
      <p>{m.notebook.kinds[notebook.kind]}</p>
      <dl className="preview__details">
        <dt>{m.notebook.language}</dt>
        <dd>{notebook.language ?? m.notebook.notRecorded}</dd>
        <dt>{m.notebook.kernel}</dt>
        <dd>{notebook.kernel ?? m.notebook.notRecorded}</dd>
      </dl>
      <DetailsList details={details} kind="notebook" />
      <button type="button" onClick={onOpenInVsCode}>
        {m.notebook.openInVsCode}
      </button>
    </div>
  );
}

type ExternalProps = { details: FileDetails; onOpenExternally: () => void };

/**
 * An HTML report: details only, never rendered in the application, so no
 * script in it can run here (spec 6.7). It opens in the system browser.
 */
export function HtmlView({ details, onOpenExternally }: ExternalProps) {
  return (
    <div className="preview__details-frame">
      <p>{m.html.note}</p>
      <DetailsList details={details} kind="html" />
      <button type="button" onClick={onOpenExternally}>
        {m.html.open}
      </button>
    </div>
  );
}

type OtherProps = ExternalProps & { reason: "type" | "linked" };

/** Any other file: type, size and location, and its own application (spec 8). */
export function OtherView({ details, reason, onOpenExternally }: OtherProps) {
  return (
    <div className="preview__details-frame">
      <p>{reason === "linked" ? m.other.linked : m.other.type}</p>
      <DetailsList details={details} kind="other" />
      <button type="button" onClick={onOpenExternally}>
        {m.openExternally}
      </button>
    </div>
  );
}

type FailedProps = {
  failure: FailureKind;
  onRetry: () => void;
  onOpenExternally: () => void;
};

/** A readable failure and the one recovery it calls for (FR-PRV-05). */
export function FailedView({
  failure,
  onRetry,
  onOpenExternally,
}: FailedProps) {
  const retry = recoveryFor(failure) === "retry";
  return (
    <div className="preview__failed" role="alert">
      <p>{m.failures[failure]}</p>
      <button type="button" onClick={retry ? onRetry : onOpenExternally}>
        {retry ? m.retry : m.openExternally}
      </button>
    </div>
  );
}
