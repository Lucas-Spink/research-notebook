import type { GroupModel } from "@research-notebook/format";
import { useId, useState } from "react";
import { canvasResultsMessages as m } from "./messages";

/** A group offered in the form, indented by how deeply it is nested. */
export type GroupChoice = {
  id: string;
  name: string;
  depth: number;
  count: number;
};

/** The groups of an experiment with at least one result, parents before their subgroups. */
export function groupChoices(
  groups: readonly GroupModel[],
  depth = 0,
): GroupChoice[] {
  return groups.flatMap((group) => [
    ...(group.items.length > 0
      ? [{ id: group.id, name: group.name, depth, count: group.items.length }]
      : []),
    ...groupChoices(group.groups, depth + 1),
  ]);
}

type Props = {
  choices: readonly GroupChoice[];
  /** Makes the table from the chosen groups, in the order listed; each is a row or a column. */
  onMake: (ids: string[], lines: "row" | "column") => void;
};

/**
 * Makes a canvas table from groups of one experiment's results: the groups are
 * ticked, and whether each becomes a row or a column is chosen.
 */
export function GroupTableForm({ choices, onMake }: Props) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [lines, setLines] = useState<"row" | "column">("row");
  const name = useId();
  if (choices.length === 0) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        {m.makeTable}
      </button>
    );
  }
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setChosen(next);
  };
  return (
    <form
      className="canvas-results__make"
      onSubmit={(event) => {
        event.preventDefault();
        const ids = choices.filter((c) => chosen.has(c.id)).map((c) => c.id);
        if (ids.length === 0) return;
        onMake(ids, lines);
        setOpen(false);
        setChosen(new Set());
      }}
    >
      <fieldset>
        <legend>{m.makeTableGroups}</legend>
        {choices.map((choice) => (
          <label key={choice.id} style={{ paddingLeft: `${choice.depth}rem` }}>
            <input
              type="checkbox"
              checked={chosen.has(choice.id)}
              onChange={() => toggle(choice.id)}
            />{" "}
            {choice.name} <span>{m.count(choice.count)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{m.makeTableEach}</legend>
        {(["row", "column"] as const).map((kind) => (
          <label key={kind}>
            <input
              type="radio"
              name={name}
              checked={lines === kind}
              onChange={() => setLines(kind)}
            />{" "}
            {kind === "row" ? m.makeTableRow : m.makeTableColumn}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={chosen.size === 0}>
        {m.makeTableCreate}
      </button>{" "}
      <button type="button" onClick={() => setOpen(false)}>
        {m.makeTableCancel}
      </button>
    </form>
  );
}
