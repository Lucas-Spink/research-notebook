import { buildReferenceIndex, type Arranged } from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import { CanvasView, useCanvases, type CanvasApi } from "../../canvas";
import { SourcesProvider, useSources, type SourcesApi } from "../../citations";
import type { ReadApi } from "../model/api";
import { CanvasResultsPanel } from "../workspace/CanvasResultsPanel";
import {
  questionsOf,
  reconcileQuestion,
} from "../workspace/model/canvasQuestions";
import type { ResultsAccess } from "../table/useResultsCellTree";
import { useCanvasCards, type OpenResult } from "../workspace/useCanvasCards";
import { canvasWindowApi, subscribe, type CanvasWindowApi } from "./api";
import { touchesBibliography } from "./model/changes";
import { canvasWindowMessages as m } from "./messages";
import {
  useCanvasWindowProject,
  type CanvasWindowProject,
} from "./useCanvasWindowProject";
import "./CanvasWindow.css";

type ReadyProps = {
  api: CanvasWindowApi;
  canvasApi: CanvasApi;
  folder: FolderHandle;
  writable: boolean;
  projectId: string;
  arranged: Arranged;
};

/**
 * What the Results panel may do in this window: browse, and pin to the canvas.
 * Everything that would change an experiment's evidence is refused, since the
 * canvas window edits nothing but the canvas's own notes and cards (ADR-0066).
 */
function browseOnly(
  projectId: string,
  arranged: Arranged,
  onOpenResult: OpenResult,
): ResultsAccess {
  return {
    projectId,
    references: buildReferenceIndex(arranged),
    writable: false,
    editArtefacts: () => Promise.resolve({ ok: false, error: null }),
    onOpenResult,
  };
}

/**
 * Reads the cached sources again when the main window relays that
 * `bibliography.json` changed, so citations in notes keep their labels after a
 * source is added from either window.
 */
function useBibliographyReload(api: CanvasWindowApi) {
  const { reload } = useSources();
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(
    () =>
      subscribe(
        api.onFilesChanged((change) => {
          if (touchesBibliography(change)) latest.current();
        }),
      ),
    [api],
  );
}

/** The canvas of one question, with the notebook it draws its cards from. */
function ReadyCanvas({
  api,
  canvasApi,
  folder,
  writable,
  projectId,
  arranged,
}: ReadyProps) {
  useBibliographyReload(api);
  const tabs = useMemo(() => questionsOf(arranged), [arranged]);
  const [choice, setChoice] = useState<string | null>(null);
  const key = reconcileQuestion(choice, tabs);
  const shown = tabs.find((tab) => tab.key === key);
  const canvases = useCanvases({
    api: canvasApi,
    folder,
    writable,
    enabled: true,
    question: shown === undefined ? null : { id: shown.id, name: shown.label },
  });

  // "Open" is the table's work, so it is asked of the main window.
  const onOpenResult = useCallback<OpenResult>(
    (experimentFolder, artefactId, version) => {
      void api.requestOpenResult({ experimentFolder, artefactId, version });
    },
    [api],
  );
  const cards = useCanvasCards(arranged, folder, onOpenResult);
  const access = useMemo(
    () => browseOnly(projectId, arranged, onOpenResult),
    [projectId, arranged, onOpenResult],
  );

  // Notes and layout still waiting for their quiet moment are written before the window goes.
  const flush = useRef(canvases.flush);
  flush.current = canvases.flush;
  useEffect(
    () => subscribe(api.onCloseRequested(() => flush.current())),
    [api],
  );

  return (
    <CanvasView
      canvases={canvases}
      cards={cards}
      questions={tabs}
      question={key}
      onChooseQuestion={setChoice}
      resultsPanel={
        <CanvasResultsPanel
          arranged={arranged}
          folder={folder}
          editing={access}
          pinned={canvases.pinned}
          onPin={(refs, screen) => canvases.pinAt(refs, screen)}
          currentQuestion={key}
        />
      }
    />
  );
}

function Body({
  api,
  canvasApi,
  sourcesApi,
  project,
}: {
  api: CanvasWindowApi;
  canvasApi: CanvasApi;
  sourcesApi: SourcesApi;
  project: CanvasWindowProject;
}) {
  switch (project.status) {
    case "loading":
      return <p className="canvas-window__message">{m.loading}</p>;
    case "unavailable":
      return <p className="canvas-window__message">{m.unavailable}</p>;
    case "failed":
      return <p className="canvas-window__message">{m.failed}</p>;
    case "ready":
      // Citations in notes are shown by their sources' labels, which the
      // provider reads from bibliography.json, as the table window does.
      return (
        <SourcesProvider
          folder={project.folder}
          writable={project.writable}
          api={sourcesApi}
        >
          <ReadyCanvas
            api={api}
            canvasApi={canvasApi}
            folder={project.folder}
            writable={project.writable}
            projectId={project.projectId}
            arranged={project.arranged}
          />
        </SourcesProvider>
      );
  }
}

/**
 * The whole content of the pop-out canvas window (ADR-0066): one question's
 * canvas at a time, with the results to pin, and nothing of the table. It
 * writes only canvas files. The main window keeps the project's lock, polls
 * for outside changes and opens results when asked.
 */
export function CanvasWindowApp({
  api = canvasWindowApi,
  read = commands,
  canvasApi = commands,
  sourcesApi = commands,
}: {
  api?: CanvasWindowApi;
  /** The commands the notebook is read with. Only tests set it. */
  read?: ReadApi;
  /** The commands the canvases are read and written with. Only tests set it. */
  canvasApi?: CanvasApi;
  /** The commands the cached sources are read and written with. Only tests set it. */
  sourcesApi?: SourcesApi;
}) {
  const project = useCanvasWindowProject({ api, read });
  return (
    <div className="canvas-window">
      <Body
        api={api}
        canvasApi={canvasApi}
        sourcesApi={sourcesApi}
        project={project}
      />
    </div>
  );
}
