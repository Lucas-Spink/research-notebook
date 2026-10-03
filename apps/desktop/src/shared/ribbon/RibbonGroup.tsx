import type { ReactNode } from "react";
import "./Ribbon.css";

/** A labelled cluster of ribbon controls, as in a spreadsheet's ribbon. */
export function RibbonGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="ribbon__group">
      <div className="ribbon__controls">{children}</div>
      <div className="ribbon__group-name" aria-hidden="true">
        {label}
      </div>
    </div>
  );
}
