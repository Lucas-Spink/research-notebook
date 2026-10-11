import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { RibbonGroup } from "../../../shared/ribbon";
import { useSources } from "../../citations";
import { messages } from "../messages";
import { headerMessages, ribbonMessages as m } from "./messages";
import { ProjectHeader, type Crumb } from "./ProjectHeader";
import { RIBBON_LAYOUT, RIBBON_TABS, type RibbonTab } from "./ribbonLayout";
import type { RibbonProps } from "./ribbonProps";
import { questionOfSelection, useRibbonCommands } from "./useRibbonCommands";

/** Whether a command has anything to draw. */
const drawn = (node: ReactNode) =>
  node !== null && node !== undefined && node !== false;

/**
 * The ribbon (S6-T01): a row of tabs, Home, View, Sources, Export and Settings, and
 * under it only the commands of the chosen tab, in labelled groups, so
 * nothing needs more width than a window has. What each tab holds is in
 * `ribbonLayout.ts`. Less common actions sit in menus. It can be collapsed to
 * its tabs alone to give the table more height; choosing a tab then shows its
 * commands over the table until a press elsewhere or Escape.
 */
export function Ribbon(props: RibbonProps) {
  const { selected, questions } = props;
  const sources = useSources();
  const commands = useRibbonCommands(props);
  const ids = useId();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<RibbonTab>("home");
  const [collapsed, setCollapsed] = useState(false);
  // A collapsed ribbon shows the chosen tab's commands while this is set.
  const [peek, setPeek] = useState(false);
  const showing = !collapsed || peek;

  // The pane and the column headings stay just under this sticky ribbon.
  useEffect(() => {
    const node = root.current;
    if (node === null) return;
    const root_ = document.documentElement;
    const report = () =>
      root_.style.setProperty("--ribbon-height", `${node.offsetHeight}px`);
    report();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(report);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root_.style.removeProperty("--ribbon-height");
    };
  }, []);

  useEffect(() => {
    if (!peek) return;
    function onPress(event: PointerEvent) {
      if (event.target instanceof Node && root.current?.contains(event.target))
        return;
      setPeek(false);
    }
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [peek]);

  function choose(next: RibbonTab) {
    setTab(next);
    // A collapsed ribbon shows the commands of a tab chosen, and hides them again on choosing it twice.
    if (collapsed) setPeek(next !== tab || !peek);
  }

  function onTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = RIBBON_TABS.indexOf(tab);
    const next =
      RIBBON_TABS[(at + step + RIBBON_TABS.length) % RIBBON_TABS.length];
    if (next === undefined) return;
    choose(next);
    root.current
      ?.querySelector<HTMLElement>(`[data-ribbon-tab="${next}"]`)
      ?.focus();
  }

  const groups = RIBBON_LAYOUT[tab].flatMap((spec) => {
    const present = spec.commands.filter((id) => drawn(commands[id]));
    return present.length === 0 ? [] : [{ spec, present }];
  });

  const parentId = questionOfSelection(selected);
  const crumbs: Crumb[] = [
    {
      label: headerMessages.projects,
      ...(props.onCloseProject === undefined
        ? {}
        : { onSelect: props.onCloseProject }),
    },
    { label: props.projectName ?? "" },
  ];
  const nameOf = (front: { ref: string; title: string }) =>
    `${front.ref} ${front.title}`;
  if (selected?.kind === "question") {
    crumbs.push({ label: nameOf(selected.group.question.file.frontmatter) });
  } else if (selected?.kind === "experiment") {
    const parent = questions.find((q) => q.id === parentId);
    if (parent !== undefined) crumbs.push({ label: parent.label });
    crumbs.push({ label: nameOf(selected.item.experiment.file.frontmatter) });
  }

  return (
    <>
      <div
        ref={root}
        className={`ribbon${collapsed ? " ribbon--collapsed" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && peek && !event.defaultPrevented)
            setPeek(false);
        }}
      >
        <div className="ribbon__tabbar">
          <p className="ribbon__brand">{messages.appTitle}</p>
          <div
            role="tablist"
            aria-label={m.tabsLabel}
            className="ribbon__tabs"
            onKeyDown={onTabKeys}
          >
            {RIBBON_TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${ids}-${key}`}
                data-ribbon-tab={key}
                aria-selected={tab === key}
                aria-controls={`${ids}-panel`}
                tabIndex={tab === key ? 0 : -1}
                className="ribbon__tab"
                onClick={() => choose(key)}
              >
                {m.tabs[key]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ribbon__collapse"
            aria-expanded={!collapsed}
            aria-label={collapsed ? m.expand : m.collapse}
            title={collapsed ? m.expand : m.collapse}
            onClick={() => {
              setCollapsed(!collapsed);
              setPeek(false);
            }}
          >
            <span aria-hidden="true">{collapsed ? "▾" : "▴"}</span>
          </button>
        </div>
        {showing && (
          <div
            role="tabpanel"
            id={`${ids}-panel`}
            aria-labelledby={`${ids}-${tab}`}
            className={`ribbon__commands${collapsed ? " ribbon__commands--peek" : ""}`}
          >
            <div
              role="toolbar"
              aria-label={m.label}
              className="ribbon__toolbar"
            >
              {groups.map(({ spec, present }) => (
                <RibbonGroup key={spec.group} label={m.groups[spec.group]}>
                  {present.map((id) => (
                    <Fragment key={id}>{commands[id]}</Fragment>
                  ))}
                </RibbonGroup>
              ))}
            </div>
          </div>
        )}
      </div>
      {props.projectName !== undefined && props.projectName !== null && (
        <ProjectHeader
          projectName={props.projectName}
          crumbs={crumbs}
          experiments={props.summary?.experiments ?? 0}
          results={props.summary?.results ?? 0}
          references={sources.items.length}
          integrity={props.integrity ?? { state: "idle" }}
          readOnly={!props.writable}
          archived={props.isArchived ?? false}
        />
      )}
    </>
  );
}
