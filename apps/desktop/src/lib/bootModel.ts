import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/**
 * Boot gating for the desktop shell.
 *
 * On launch we show the `BootScreen` splash (vendored from the `koklo-storybook`
 * design system) while the Tauri runtime settles, then hand off to the app shell.
 * "Ready" here means *runtime* readiness, not *data* readiness — the Sessions
 * screen owns its own data spinner, so the boot gate keys only on the app
 * version load plus a small minimum dwell. Two guards keep the transition clean:
 *
 * - a **minimum dwell** so a fast cold start never flashes the splash sub-frame;
 * - a **timeout ceiling** so a stalled runtime still resolves to the shell
 *   (the splash never traps the user).
 *
 * All gating logic is pure and injectable so it can be unit-tested without a
 * Tauri runtime or a DOM; the `useAppBoot` hook is the thin React wrapper.
 */

/** Minimum time the splash stays up, even on an instant cold start (ms). */
export const MIN_BOOT_MS = 500;
/** Hard ceiling: proceed to the shell even if the version never resolves (ms). */
export const BOOT_TIMEOUT_MS = 4000;

export type BootPhase = "booting" | "ready";

export interface BootState {
  phase: BootPhase;
  /** Formatted version chrome for the splash (e.g. `"v 0.1.0"`), if known. */
  version?: string;
}

/** Default real timer; injected as `delay` in tests to stay deterministic. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format a raw version string into the splash chrome label, or `undefined` when
 * there is nothing meaningful to show (so the BootScreen omits the chrome).
 */
export function formatVersion(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? `v ${trimmed}` : undefined;
}

/**
 * Resolve the app version, racing the load against a timeout. Returns the raw
 * version on success, or `undefined` if the load fails or the timeout wins —
 * the boot must never hang on this.
 */
export function settleVersion(opts: {
  loadVersion: () => Promise<string>;
  timeoutMs: number;
  delay?: (ms: number) => Promise<void>;
}): Promise<string | undefined> {
  const delay = opts.delay ?? sleep;
  const load = opts.loadVersion().then(
    (v) => v as string | undefined,
    () => undefined,
  );
  const timeout = delay(opts.timeoutMs).then(() => undefined);
  return Promise.race([load, timeout]);
}

export interface UseAppBootOptions {
  loadVersion?: () => Promise<string>;
  minMs?: number;
  timeoutMs?: number;
}

/**
 * Drives the boot phase. Starts `booting`, surfaces the version as soon as it
 * settles, and flips to `ready` once both the version has settled and the
 * minimum dwell has elapsed.
 */
export function useAppBoot(options?: UseAppBootOptions): BootState {
  const [state, setState] = useState<BootState>({ phase: "booting" });

  useEffect(() => {
    let cancelled = false;
    const loadVersion = options?.loadVersion ?? getVersion;
    const minMs = options?.minMs ?? MIN_BOOT_MS;
    const timeoutMs = options?.timeoutMs ?? BOOT_TIMEOUT_MS;

    const versionPromise = settleVersion({ loadVersion, timeoutMs });

    // Show the version on the splash as soon as it is known.
    void versionPromise.then((raw) => {
      if (!cancelled) {
        setState((prev) => ({ ...prev, version: formatVersion(raw) }));
      }
    });

    // Flip to the shell once the version settled AND the min dwell elapsed.
    void Promise.all([versionPromise, sleep(minMs)]).then(([raw]) => {
      if (!cancelled) {
        setState({ phase: "ready", version: formatVersion(raw) });
      }
    });

    return () => {
      cancelled = true;
    };
    // Boot runs exactly once on mount; options are read at that point.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
