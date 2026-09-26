import "./App.css";
import { ProjectsStart } from "./features/projects";

// The Stage 1 table spike (features/table-spike) is no longer mounted: the
// workspace table in features/notebook replaces it (S2-T11). Its files stay
// until they are cleaned up.
function App() {
  return (
    <main className="container">
      <h1>Research Notebook</h1>
      <ProjectsStart />
    </main>
  );
}

export default App;
