import type { ReactNode } from "react";
import { headerMessages as m } from "./messages";

/** One step of the breadcrumb trail. `onSelect` makes it a link back to that place. */
export type Crumb = { label: string; onSelect?: () => void };

/** How the integrity check stands, for the header's key figures. */
export type IntegrityStatus =
  { state: "idle" | "running" | "failed" } | { state: "done"; issues: number };

type Props = {
  projectName: string;
  crumbs: readonly Crumb[];
  experiments: number;
  results: number;
  references: number;
  integrity: IntegrityStatus;
  /** Shown beside the figures when the project cannot be changed here. */
  readOnly: boolean;
  archived: boolean;
  /** The view's one main action. */
  primary: ReactNode;
  /** The compact menu of secondary project actions. */
  more: ReactNode;
};

function integrityText(status: IntegrityStatus): {
  text: string;
  mark: string;
} {
  if (status.state === "done") {
    return status.issues === 0
      ? { text: m.integrity.clean, mark: "✓" }
      : { text: m.integrity.issues(status.issues), mark: "!" };
  }
  if (status.state === "running")
    return { text: m.integrity.running, mark: "…" };
  if (status.state === "failed") return { text: m.integrity.failed, mark: "!" };
  return { text: m.integrity.idle, mark: "–" };
}

/**
 * The project's header (issue #101): where you are, the project's name, a
 * few key figures, and the one main action with a compact menu for the rest.
 * Each figure is words as well as a mark, so none depends on colour.
 */
export function ProjectHeader(props: Props) {
  const integrity = integrityText(props.integrity);
  const last = props.crumbs.length - 1;
  return (
    <header className="project-header">
      <div className="project-header__main">
        <nav aria-label={m.breadcrumbs} className="project-header__crumbs">
          <ol>
            {props.crumbs.map((crumb, index) => (
              <li key={`${index}-${crumb.label}`}>
                {crumb.onSelect !== undefined && index !== last ? (
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={crumb.onSelect}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span aria-current={index === last ? "page" : undefined}>
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="project-header__line">
          <h1 className="project-header__title" title={props.projectName}>
            {props.projectName}
          </h1>
          <ul className="project-header__figures" aria-label={m.summaryLabel}>
            <li>{m.experiments(props.experiments)}</li>
            <li>{m.results(props.results)}</li>
            <li>{m.references(props.references)}</li>
            <li data-integrity={props.integrity.state}>
              <span aria-hidden="true" className="project-header__mark">
                {integrity.mark}
              </span>
              {integrity.text}
            </li>
            {props.archived && <li>{m.archived}</li>}
            {props.readOnly && !props.archived && <li>{m.readOnly}</li>}
          </ul>
        </div>
      </div>
      <div className="project-header__actions">
        {props.primary}
        {props.more}
      </div>
    </header>
  );
}
