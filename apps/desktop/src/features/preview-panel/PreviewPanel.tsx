import {
  groupLocationsOf,
  referencedIn,
  type ArtefactsFileModel,
  type ReferenceIndex,
} from "@research-notebook/format";
import { useState } from "react";
import type { FolderHandle } from "../../ipc/bindings";
import {
  formatSize,
  PreviewView,
  usePreview,
  type FileDetails,
} from "../preview";
import { linkSourceOf } from "./model/availability";
import {
  fileDetailsFor,
  previewPlanFor,
  resolveVersion,
} from "./model/details";
import type { PanelApi } from "./model/api";
import { panelMessages as m } from "./messages";
import { useAvailability } from "./useAvailability";
import { useFileActions, type ActionTarget } from "./useFileActions";
import "./PreviewPanel.css";

export type Props = {
  api: PanelApi;
  folder: FolderHandle;
  /** The parsed `project.yaml`'s own id, for external root lookups (FR-PRJ-07). */
  projectId: string;
  /** The experiment folder name the artefact's file lives under. */
  experimentFolder: string;
  file: ArtefactsFileModel;
  artefactId: string;
  /**
   * Which version to show; the latest by default. A reference chip passes
   * its pinned version (FR-EDT-06), which may not be the latest once
   * FR-EDT-07 lets versions diverge.
   */
  version?: number | null;
  /** Every experiment and section that references an artefact, across the
   * whole project (FR-SRC-03), built once by the caller from `Arranged`. */
  references: ReferenceIndex;
};

/**
 * FR-PRV-01/02: one artefact's metadata, versions or link record, group
 * locations, live availability, its preview (S3-T10's `PreviewView`), and
 * the five distinct file actions.
 */
export function PreviewPanel({
  api,
  folder,
  projectId,
  experimentFolder,
  file,
  artefactId,
  version: pinned,
  references,
}: Props) {
  const artefact = file.artefacts.find((a) => a.id === artefactId);
  const version = artefact ? resolveVersion(artefact, pinned) : undefined;
  const details: FileDetails = artefact
    ? fileDetailsFor(artefact, experimentFolder, version)
    : { name: "", fileName: "", size: 0, location: "" };
  const plan = artefact
    ? previewPlanFor(artefact, version)
    : { kind: "other" as const, reason: "type" as const };
  const linkSource = artefact ? linkSourceOf(artefact) : undefined;
  const [recheck, setRecheck] = useState(0);

  const preview = usePreview({
    api,
    target: { folder, file: details.location, sha256: version?.sha256 ?? "" },
    plan,
  });
  const availability = useAvailability({
    api,
    folder,
    projectId,
    source: linkSource,
    attempt: recheck,
  });
  const target: ActionTarget =
    linkSource !== undefined
      ? { kind: "linked", root: linkSource.root, path: linkSource.path }
      : { kind: "captured", file: details.location };
  const fileActions = useFileActions({ api, folder, projectId, target });

  if (artefact === undefined) return null;

  const locations = groupLocationsOf(file, artefactId);
  const referenceLocations = referencedIn(references, artefactId);

  return (
    <section className="panel" aria-label={details.name}>
      <header className="panel__header">
        <h3>{details.name}</h3>
        <p className="panel__badges">
          <span>{m.types[artefact.type]}</span>
          <span>{m.role[artefact.role]}</span>
          <span>{m.mode[artefact.mode]}</span>
        </p>
      </header>

      <p className="panel__locations">
        {locations.length === 0
          ? m.ungroupedNote
          : `${m.groupLocations} ${locations.map((path) => path.join(" / ")).join("; ")}`}
      </p>

      <div className="panel__references">
        <h4>{m.referencedIn.heading}</h4>
        {referenceLocations.length === 0 ? (
          <p>{m.referencedIn.none}</p>
        ) : (
          <ul aria-label={m.referencedIn.heading}>
            {referenceLocations.map((location, index) => (
              <li key={index}>
                {m.referencedIn.location(
                  location.experimentRef,
                  location.experimentTitle,
                  location.section,
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {artefact.mode === "copy" ? (
        <ul className="panel__versions" aria-label={m.versions.heading}>
          {artefact.versions.map((v) => (
            <li key={v.v}>
              {m.versions.captured(v.v, v.captured)}
              {pinned != null && v.v === pinned && ` ${m.versions.pinned}`}
              {v.provenance && (
                <span className="panel__provenance">
                  {" "}
                  {m.versions.provenance(
                    v.provenance.commit,
                    v.provenance.file_dirty,
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel__link">
          <p>
            {m.link.recorded(
              formatSize(artefact.link.size),
              artefact.link.checked,
            )}
          </p>
          <p role="status">
            {availability === undefined || availability.status === "checking"
              ? m.availability.checking
              : availability.status === "checked"
                ? m.availability.text(availability.availability)
                : m.actionFailures.actionFailed}
          </p>
          <button
            type="button"
            disabled={availability?.status === "checking"}
            onClick={() => setRecheck((n) => n + 1)}
          >
            {m.availability.recheck}
          </button>
        </div>
      )}

      <div className="panel__actions">
        <button
          type="button"
          disabled={fileActions.busy}
          onClick={() => void fileActions.run("openFile")}
        >
          {m.actions.openFile}
        </button>
        <button
          type="button"
          disabled={fileActions.busy}
          onClick={() => void fileActions.run("reveal")}
        >
          {m.actions.reveal}
        </button>
        <button
          type="button"
          disabled={fileActions.busy}
          onClick={() => void fileActions.run("openInVsCode")}
        >
          {m.actions.openInVsCode}
        </button>
        <button
          type="button"
          disabled={fileActions.busy}
          onClick={() => void fileActions.run("copyPath")}
        >
          {m.actions.copyPath}
        </button>
        <button
          type="button"
          disabled={fileActions.busy}
          onClick={() => void fileActions.openProjectFolder()}
        >
          {m.actions.openProjectFolder}
        </button>
      </div>
      {fileActions.message && <p role="status">{fileActions.message}</p>}

      <PreviewView
        details={details}
        plan={plan}
        state={preview.state}
        zoomed={preview.zoomed}
        onToggleZoom={preview.toggleZoom}
        onExpand={preview.expand}
        onRetry={preview.retry}
        onRenderFailed={preview.renderFailed}
        onOpenExternally={() => void fileActions.run("openFile")}
        onOpenInVsCode={() => void fileActions.run("openInVsCode")}
      />
    </section>
  );
}
