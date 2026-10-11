import type { MenuLabel } from "./model/menu";

const p = (d: string) => d;

/** Small 12-unit line glyphs for menu entries; decorative, the label says what it does. */
const PATHS: Readonly<Record<MenuLabel, string>> = {
  preview: p("M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6ZM6 4.5v3"),
  details: p("M6 1.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM6 5.5v3M6 3.5v.01"),
  openFile: p("M4.5 2H2v8h8V7.5M7 2h3v3M10 2 5.5 6.5"),
  reveal: p("M1.5 3h3l1 1H10.5v5.5h-9ZM1.5 3v6.5"),
  renameResult: p("M2 10l.5-2.5L8 2l2 2-5.5 5.5L2 10Z"),
  rename: p("M2 10l.5-2.5L8 2l2 2-5.5 5.5L2 10Z"),
  moveTo: p("M2 6h8M7 3l3 3-3 3"),
  addTo: p("M2 6h8M6 2v8"),
  moveInto: p("M2 6h8M7 3l3 3-3 3"),
  moveToTop: p("M2 3h8M6 10V5M3.5 7.5 6 5l2.5 2.5"),
  moveUp: p("M6 10V3M3 5.5 6 2.5 9 5.5"),
  moveDown: p("M6 2v7M3 6.5 6 9.5 9 6.5"),
  remove: p("M3 3l6 6M9 3 3 9"),
  removeFile: p("M2.5 3.5h7M4.5 3.5V2h3v1.5M3.5 3.5l.4 6.5h4.2l.4-6.5"),
  newSubgroup: p("M1.5 3h3l1 1H10.5v5.5h-9ZM6 5.5v3M4.5 7h3"),
  expandAll: p("M3 4.5 6 7.5 9 4.5"),
  collapseAll: p("M3 7.5 6 4.5 9 7.5"),
  markMainFigure: p(
    "M6 1.5 7.4 4.4l3.1.4-2.3 2.2.6 3.1L6 8.5 3.2 10.1l.6-3.1L1.5 4.8l3.1-.4Z",
  ),
  unmarkMainFigure: p(
    "M6 1.5 7.4 4.4l3.1.4-2.3 2.2.6 3.1L6 8.5 3.2 10.1l.6-3.1L1.5 4.8l3.1-.4Z",
  ),
  clearClassification: p("M3 3l6 6M9 3 3 9"),
  classify: p("M1.5 6.5 6 2h4.5v4.5L6 11ZM8 4v.01"),
  delete: p("M2.5 3.5h7M4.5 3.5V2h3v1.5M3.5 3.5l.4 6.5h4.2l.4-6.5"),
};

/** The glyph for a menu entry. */
export function MenuGlyph({ label }: { label: MenuLabel }) {
  return (
    <svg
      className="results-popover__glyph"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[label]} />
    </svg>
  );
}
