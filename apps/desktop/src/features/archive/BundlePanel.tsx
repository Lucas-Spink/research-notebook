import type { BundleChoice } from "../../ipc/bindings";
import {
  bundleMessages,
  describeBundleResult,
  describePlan,
} from "./bundleMessages";
import type { BundleChoiceModel, BundleModel } from "./useBundle";

const CHOICES: readonly BundleChoice[] = ["notebook", "archive"];

/**
 * Saves the notebook bundle or the full archive (FR-ARC-08). It renders what
 * `useBundle` holds and saves only through it. The FAT32 warning is shown
 * before anything is written, from the counted size.
 */
export function BundlePanel({ model }: { model: BundleModel }) {
  return (
    <section className="bundles" aria-labelledby="bundles-heading">
      <h4 id="bundles-heading">{bundleMessages.heading}</h4>
      <p>{bundleMessages.intro}</p>
      {CHOICES.map((choice) => (
        <BundleChoiceView
          key={choice}
          choice={choice}
          state={model.choices[choice]}
          busy={model.running !== null}
          saving={model.running === choice}
          note={choice === "archive" && model.hasLinkedFiles}
          save={() => model.save(choice)}
        />
      ))}
    </section>
  );
}

function BundleChoiceView(props: {
  choice: BundleChoice;
  state: BundleChoiceModel;
  busy: boolean;
  saving: boolean;
  note: boolean;
  save: () => void;
}) {
  const { choice, state } = props;
  const text = bundleMessages.choices[choice];
  const id = `bundle-${choice}`;
  return (
    <div
      className="bundle-choice"
      aria-labelledby={`${id}-heading`}
      role="group"
    >
      <h5 id={`${id}-heading`}>{text.heading}</h5>
      <p>{text.description}</p>
      <p>
        {state.plan !== null
          ? describePlan(state.plan)
          : state.planFailed
            ? bundleMessages.failures.planFailed
            : bundleMessages.checking}
      </p>
      {props.note && <p>{bundleMessages.linkedNote}</p>}
      {state.plan?.exceedsFat32Limit === true && (
        <p role="alert">{bundleMessages.fat32Warning}</p>
      )}
      <button type="button" disabled={props.busy} onClick={props.save}>
        {props.saving ? bundleMessages.saving : text.save}
      </button>
      <div role="status" aria-live="polite">
        {state.cancelled && bundleMessages.cancelled}
        {state.result !== null && describeBundleResult(state.result)}
      </div>
      {state.failure !== null && (
        <p role="alert">{bundleMessages.failures[state.failure]}</p>
      )}
    </div>
  );
}
