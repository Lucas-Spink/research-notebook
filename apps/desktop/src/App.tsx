import "./App.css";
import PreviewSpike from "./features/preview-spike/PreviewSpike";
import TableSpike from "./features/table-spike/TableSpike";

function App() {
  return (
    <main className="container">
      <h1>Research Notebook</h1>
      <PreviewSpike />
      <TableSpike />
    </main>
  );
}

export default App;
