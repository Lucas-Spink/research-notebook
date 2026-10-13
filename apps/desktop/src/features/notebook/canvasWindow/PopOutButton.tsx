import { canvasWindowMessages as m } from "./messages";
import type { PopOut } from "./useCanvasPopOut";

type Props = {
  popOut: PopOut;
};

/**
 * Opens the canvas in its own window, beside the table (ADR-0066). While that
 * window is open the same button brings it to the front, and says why the
 * canvas is not offered here.
 */
export function PopOutButton({ popOut }: Props) {
  return (
    <>
      <button
        type="button"
        className="pop-out-button"
        title={popOut.open ? m.popOutOpen : m.popOutHint}
        onClick={() => void popOut.popOut()}
      >
        {popOut.open ? m.focusCanvas : m.popOut}
      </button>
      {popOut.failed && (
        <span role="alert" className="pop-out-button__failed">
          {m.popOutFailed}
        </span>
      )}
    </>
  );
}
