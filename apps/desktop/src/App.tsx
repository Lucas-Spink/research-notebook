import "./App.css";
import PreviewSpike from "./features/preview-spike/PreviewSpike";
import { ProjectsStart } from "./features/projects";
import TableSpike from "./features/table-spike/TableSpike";

function App() {
  return (
    <main className="container">
      <h1>Research Notebook</h1>
      <ProjectsStart />
      <PreviewSpike />
      <TableSpike />
    </main>
  );
}

export default App;
