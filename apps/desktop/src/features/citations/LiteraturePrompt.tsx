import { literatureMessages } from "./messages";
import type { LiteratureModel } from "./useLiteraturePlanner";

/**
 * The question asked before the Literature block is replaced although it was
 * edited by hand (spec 5.5 rule 6). Renders nothing otherwise.
 */
export function LiteraturePrompt({
  literature,
}: {
  literature: Pick<LiteratureModel, "asking" | "answer">;
}) {
  if (!literature.asking) return null;
  return (
    <div role="alertdialog" aria-labelledby="literature-prompt-heading">
      <p id="literature-prompt-heading">
        <strong>{literatureMessages.heading}</strong>
      </p>
      <p>{literatureMessages.text}</p>
      <button type="button" onClick={() => literature.answer("replace")}>
        {literatureMessages.replace}
      </button>
      <button type="button" onClick={() => literature.answer("keep")}>
        {literatureMessages.keep}
      </button>
    </div>
  );
}
