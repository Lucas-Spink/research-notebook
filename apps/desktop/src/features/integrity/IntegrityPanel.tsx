import type { IntegrityFinding } from "@research-notebook/format";
import { describeFinding, integrityMessages, summary } from "./messages";
import { resolutionOf, type Resolution } from "./model/resolution";
import type { IntegrityModel } from "./useIntegrityCheck";

type Props = {
  model: IntegrityModel;
  /** Takes the person to where the finding can be put right. */
  onResolve: (finding: IntegrityFinding, where: Resolution) => void;
};

const KINDS = [
  "missingFile",
  "unresolvedReference",
  "externalFile",
  "sourceProblem",
  "unreadableArtefacts",
] as const;

/**
 * The integrity check's report (FR-ARC-01): every finding with a way to
 * resolve it where one exists, and a checkbox to acknowledge it. It renders
 * what `useIntegrityCheck` holds and writes nothing.
 */
export function IntegrityPanel({ model, onResolve }: Props) {
  const { state, findings, acknowledged } = model;
  const open = findings.filter((f) => !acknowledged.has(f.key)).length;
  const label =
    state === "running"
      ? integrityMessages.running
      : state === "idle"
        ? integrityMessages.run
        : integrityMessages.rerun;
  return (
    <section className="integrity" aria-labelledby="integrity-heading">
      <h4 id="integrity-heading">{integrityMessages.heading}</h4>
      <p>{integrityMessages.intro}</p>
      <button type="button" disabled={state === "running"} onClick={model.run}>
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && integrityMessages.notRun}
        {state === "done" && summary(open, findings.length - open)}
      </div>
      {state === "failed" && <p role="alert">{integrityMessages.failed}</p>}
      {state === "done" && (
        <>
          <p className="integrity__hint">{integrityMessages.acknowledgeHint}</p>
          {KINDS.map((kind) => {
            const group = findings.filter((f) => f.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind} aria-label={integrityMessages.sections[kind]}>
                <h5>{integrityMessages.sections[kind]}</h5>
                <ul>
                  {group.map((finding) => (
                    <FindingRow
                      key={finding.key}
                      finding={finding}
                      acknowledged={acknowledged.has(finding.key)}
                      model={model}
                      onResolve={onResolve}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}

function FindingRow({
  finding,
  acknowledged,
  model,
  onResolve,
}: {
  finding: IntegrityFinding;
  acknowledged: boolean;
  model: IntegrityModel;
  onResolve: Props["onResolve"];
}) {
  const where = resolutionOf(finding);
  return (
    <li>
      <span>{describeFinding(finding)}</span>{" "}
      {where !== null && (
        <button type="button" onClick={() => onResolve(finding, where)}>
          {integrityMessages.resolve}
        </button>
      )}{" "}
      <label>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) =>
            model.setAcknowledged(finding.key, event.currentTarget.checked)
          }
        />{" "}
        {integrityMessages.acknowledge}
      </label>
    </li>
  );
}
