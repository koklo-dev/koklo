import { useEffect, useState } from "react";
import type { SessionDto } from "@koklo/trpc-client";
import { BootScreen, Shell, Toaster, UserSetupScreen } from "@koklo/ui";
import { SessionsScreen } from "./screens/Sessions";
import { TranscriptScreen } from "./screens/Transcript";
import { kokloClient } from "./lib/client";
import { useTheme } from "./lib/theme";
import { useAppBoot } from "./lib/bootModel";
import { useAccount, sidebarUser } from "./lib/accountModel";
import { revealMainWindow } from "./lib/splash";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WindowControls } from "./components/WindowControls";

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
  const [pendingGateCount, setPendingGateCount] = useState(0);
  const boot = useAppBoot();
  const { state: account, save: saveAccount } = useAccount(kokloClient);

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
  // Keep the splash up while the account is still loading to avoid a flash.
  if (boot.phase === "booting" || account.phase === "loading") {
    return <BootScreen projectName="koklo" version={boot.version} />;
  }

  // Koklo requires a local account before the Shell is usable. When none exists,
  // onboarding gates the app; saving persists it (shared with the CLI) and reveals
  // the Shell. A returning user with a saved account skips straight through.
  if (account.phase === "needs-setup") {
    return <UserSetupScreen onComplete={(values) => void saveAccount(values)} />;
  }

  const isTranscript = view.screen === "transcript";

  return (
    <Toaster>
      <ErrorBoundary>
        <Shell
          sidebar={{
            orgName: "Koklo",
            projectName: "koklo",
            activeItemId: "sessions",
            user: sidebarUser(account.account),
          }}
          topbar={{
            breadcrumbs: isTranscript
              ? [{ label: "koklo" }, { label: "Sessions" }, { label: view.session.title }]
              : [{ label: "koklo" }, { label: "Sessions" }],
            hasNotification: pendingGateCount > 0,
            isDark,
            onThemeToggle: toggle,
            dragRegion: true,
            trailingSlot: <WindowControls />,
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
              onPendingGateCountChange={setPendingGateCount}
              onOpenSession={(session) => setView({ screen: "transcript", session })}
            />
          )}
        </Shell>
      </ErrorBoundary>
    </Toaster>
  );
}
