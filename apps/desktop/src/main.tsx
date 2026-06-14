import React from "react";
import ReactDOM from "react-dom/client";
import "@koklo/ui/tokens.css";
import { App } from "./App";
import { applyInitialTheme } from "./lib/theme";

applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
