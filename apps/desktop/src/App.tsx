import { useEffect, useState } from "react";
import type { SessionDto } from "@koklo/trpc-client";
import { BootScreen, Shell, Toaster } from "@koklo/ui";
import { SessionsScreen } from "./screens/Sessions";
import { TranscriptScreen } from "./screens/Transcript";
import { kokloClient } from "./lib/client";
import { useTheme } from "./lib/theme";
import { useAppBoot } from "./lib/bootModel";
import { revealMainWindow } from "./lib/splash";

/** Local view router: the Sessions list, or one session's live transcript. */
type View = { screen: "sessions" } | { screen: "transcript"; session: SessionDto };

/**
 * Desktop root. Wires the Sessions list (US-017) to the live Transcript view
 * (US-018, roadmap P2 §4): selecting a session opens its transcript. Full nav
 * routing and the Gate screen (§5) land in later sprints.
 */
export function App() {
  // The open-project path; sourced from a project context once routing lands.
  const projectPath = ".";
  const { isDark, toggle } = useTheme();
  const [view, setView] = useState<View>({ screen: "sessions" });
  const boot = useAppBoot();

  // Once the app is ready, reveal the (hidden) main window and dismiss the
  // frameless splash window so the user only sees the shell when it's painted.
  // No-ops outside Tauri (browser dev), where the inline BootScreen below shows.
  useEffect(() => {
    if (boot.phase === "ready") {
      void revealMainWindow();
    }
  }, [boot.phase]);

  // The splash window owns the boot screen under Tauri; this inline render is the
  // graceful fallback for browser dev (no splash window). The Tauri main window
  // stays hidden until `revealMainWindow`, so this is never seen on the desktop.
  if (boot.phase === "booting") {
    return <BootScreen projectName="koklo" version={boot.version} />;
  }

  const isTranscript = view.screen === "transcript";

  return (
    <Toaster>
      <Shell
        sidebar={{
          orgName: "Koklo",
          projectName: "koklo",
          activeItemId: "sessions",
          user: { name: "Koklo User", email: "you@koklo.dev" },
        }}
        topbar={{
          breadcrumbs: isTranscript
            ? [{ label: "koklo" }, { label: "Sessions" }, { label: view.session.title }]
            : [{ label: "koklo" }, { label: "Sessions" }],
          isDark,
          onThemeToggle: toggle,
        }}
      >
        {isTranscript ? (
          <TranscriptScreen
            client={kokloClient}
            sessionId={view.session.id}
            sessionTitle={view.session.title}
            onBack={() => setView({ screen: "sessions" })}
          />
        ) : (
          <SessionsScreen
            client={kokloClient}
            projectPath={projectPath}
            onOpenSession={(session) => setView({ screen: "transcript", session })}
          />
        )}
      </Shell>
    </Toaster>
  );
}
