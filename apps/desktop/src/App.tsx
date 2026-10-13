import "./App.css";
import { CanvasWindowApp } from "./features/notebook";
import { ProjectsStart } from "./features/projects";
import { CANVAS_WINDOW, currentWindowLabel } from "./shared/windowLabel";

// The Stage 1 table spike (features/table-spike) is no longer mounted: the
// workspace table in features/notebook replaces it (S2-T11). Its files stay
// until they are cleaned up.
function App() {
  // The pop-out canvas window shows only the canvas, for the project the main window has open (ADR-0066).
  if (currentWindowLabel() === CANVAS_WINDOW) {
    return (
      <main className="app">
        <CanvasWindowApp />
      </main>
    );
  }
  return (
    <main className="app">
      <ProjectsStart />
    </main>
  );
}

export default App;
