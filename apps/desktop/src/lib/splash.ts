import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Two-window boot flow.
 *
 * On launch Tauri opens a frameless, centered `splashscreen` window showing the
 * `BootScreen` (no OS chrome around it), while the real `main` window is created
 * hidden. Both windows load the same SPA, so the entry point branches on the
 * window label: the splash renders just the `BootScreen`, the main window runs
 * the full app. Once the app reports ready (`useAppBoot`), the main window asks
 * the backend to reveal itself and close the splash.
 *
 * The handoff goes through the `finish_boot` backend command rather than the JS
 * window API: closing a *different* window (the splash) from the frontend is
 * denied unless that window is granted `core:window:allow-close`, whereas the
 * backend has full window access and app commands are allowed by default. Calls
 * are wrapped so the app still runs in a plain browser (vite dev / vitest),
 * where there is no Tauri runtime — there they simply no-op.
 */
export const SPLASH_LABEL = "splashscreen";

/** True when the current webview is the frameless splash window. */
export function isSplashWindow(): boolean {
  try {
    return getCurrentWindow().label === SPLASH_LABEL;
  } catch {
    return false; // not under Tauri (browser dev) → render the main app
  }
}

/**
 * Reveal the main window and dismiss the splash. Idempotent and safe to call
 * outside a Tauri runtime (no-op). Called once the app is ready so the user
 * never sees a half-painted shell.
 */
export async function revealMainWindow(): Promise<void> {
  try {
    await invoke("finish_boot");
  } catch {
    // Not running under Tauri (browser dev / tests): nothing to reveal.
  }
}
