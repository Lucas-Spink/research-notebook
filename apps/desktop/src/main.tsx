import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./shared/theme";

// The stored theme goes on before anything is drawn, so there is no flash of the other one.
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
