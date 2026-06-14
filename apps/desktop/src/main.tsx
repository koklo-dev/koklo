import React from "react";
import ReactDOM from "react-dom/client";
import "@koklo/ui/tokens.css";
import { BootScreen } from "@koklo/ui";
import { App } from "./App";
import { applyInitialTheme } from "./lib/theme";
import { isSplashWindow } from "./lib/splash";

applyInitialTheme();

// The frameless `splashscreen` window and the `main` window load the same SPA;
// branch on the window label so the splash shows only the boot screen (no app
// chrome around it) while the main window runs the full app.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isSplashWindow() ? <BootScreen projectName="koklo" /> : <App />}
  </React.StrictMode>
);
