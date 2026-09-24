import { assertNever } from "../../shared/assertNever";
import { ImageView, SvgView, TableView, TextView } from "./ContentViews";
import {
  FailedView,
  HtmlView,
  NotebookView,
  OtherView,
  type FileDetails,
} from "./DetailViews";
import { previewMessages as m } from "./messages";
import type { PreviewContent, PreviewState } from "./model/load";
import type { PreviewPlan } from "./model/plan";
import { PdfView } from "./PdfViews";
import "./Preview.css";

export type PreviewViewProps = {
  details: FileDetails;
  plan: PreviewPlan;
  state: PreviewState;
  zoomed: boolean;
  onToggleZoom: () => void;
  onExpand: () => void;
  onRetry: () => void;
  /** The webview could not draw an image or PDF it was given. */
  onRenderFailed: () => void;
  /** Opens the file in the browser (HTML) or its own application. */
  onOpenExternally: () => void;
  onOpenInVsCode: () => void;
};

function Content({
  content,
  ...p
}: PreviewViewProps & { content: PreviewContent }) {
  const name = p.details.name;
  switch (content.kind) {
    case "image":
      return (
        <ImageView
          name={name}
          url={content.url}
          zoomed={p.zoomed}
          onToggleZoom={p.onToggleZoom}
          onRenderFailed={p.onRenderFailed}
        />
      );
    case "svg":
      return (
        <SvgView
          name={name}
          url={content.url}
          onRenderFailed={p.onRenderFailed}
        />
      );
    case "pdf":
      return (
        <PdfView
          name={name}
          url={content.url}
          onRenderFailed={p.onRenderFailed}
        />
      );
    case "table":
      return (
        <TableView
          name={name}
          table={content.table}
          expanded={content.expanded}
          onExpand={p.onExpand}
        />
      );
    case "text":
      return <TextView name={name} text={content.text} />;
    case "notebook":
      return (
        <NotebookView
          details={p.details}
          notebook={content.notebook}
          onOpenInVsCode={p.onOpenInVsCode}
        />
      );
    case "html":
      return (
        <HtmlView details={p.details} onOpenExternally={p.onOpenExternally} />
      );
    case "other":
      return (
        <OtherView
          details={p.details}
          reason={content.reason}
          onOpenExternally={p.onOpenExternally}
        />
      );
    default:
      return assertNever(content);
  }
}

/**
 * One version's preview, as spec 8 describes for its type, or a readable
 * failure with its recovery (FR-PRV-05). State comes from `usePreview`.
 */
export function PreviewView(props: PreviewViewProps) {
  const { state } = props;
  switch (state.status) {
    case "loading":
      return (
        <p className="preview preview__loading" role="status">
          {m.loading}
        </p>
      );
    case "failed":
      return (
        <div className="preview">
          <FailedView
            failure={state.failure}
            onRetry={props.onRetry}
            onOpenExternally={props.onOpenExternally}
          />
        </div>
      );
    case "ready":
      return (
        <div className="preview">
          <Content {...props} content={state.content} />
        </div>
      );
    default:
      return assertNever(state);
  }
}
