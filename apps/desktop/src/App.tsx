import { useEffect, useState } from "react";
import type { SessionDto } from "@koklo/trpc-client";
import {
  BootScreen,
  Shell,
  Toaster,
  UserSetupScreen,
  WorktreeSwitcher,
  type WorktreeSwitcherItem,
} from "@koklo/ui";
import { SessionsScreen } from "./screens/Sessions";
import { TranscriptScreen } from "./screens/Transcript";
import { kokloClient } from "./lib/client";
import { useTheme } from "./lib/theme";
import { useAppBoot } from "./lib/bootModel";
import { useAccount, sidebarUser } from "./lib/accountModel";
import { revealMainWindow } from "./lib/splash";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WindowControls } from "./components/WindowControls";
import { loadWorktreeItems, type WorktreeViewItem } from "./lib/worktreesModel";

/** Local view router: the Sessions list, or one session's live transcript. */
type View = { screen: "sessions" } | { screen: "transcript"; session: SessionDto };

/**
 * Desktop root. Wires the Sessions list (US-017) to the live Transcript view
 * (US-018, roadmap P2 §4): selecting a session opens its transcript. Full nav
 * routing and the Gate screen (§5) land in later sprints.
 */
export function App() {
  const { isDark, toggle } = useTheme();
  const [view, setView] = useState<View>({ screen: "sessions" });
  const [openRunModalToken, setOpenRunModalToken] = useState(0);
  const [pendingGateCount, setPendingGateCount] = useState(0);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeViewItem[]>([]);
  const [worktreeBusy, setWorktreeBusy] = useState<{
    itemId: string | null;
    action: "switch" | "prune" | null;
  }>({ itemId: null, action: null });
  const boot = useAppBoot();
  const { state: account, save: saveAccount } = useAccount(kokloClient);
  const isTranscript = view.screen === "transcript";

  const showSessions = () => setView({ screen: "sessions" });
  const openNewRun = () => {
    showSessions();
    setOpenRunModalToken((value) => value + 1);
  };

  // Once the app is ready, reveal the (hidden) main window and dismiss the
  // frameless splash window so the user only sees the shell when it's painted.
  // No-ops outside Tauri (browser dev), where the inline BootScreen below shows.
  useEffect(() => {
    if (boot.phase === "ready") {
      void revealMainWindow();
    }
  }, [boot.phase]);

  useEffect(() => {
    document.title = isTranscript ? `${view.session.title} · Koklo` : "Koklo";
  }, [isTranscript, view]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const items = await loadWorktreeItems(kokloClient, sessions);
        if (!cancelled) setWorktrees(items);
      } catch {
        if (!cancelled) setWorktrees([]);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessions]);

  const handleSwitchWorktree = async (item: WorktreeSwitcherItem) => {
    const selected = worktrees.find((entry) => entry.id === item.id);
    if (!selected) return;
    setWorktreeBusy({ itemId: selected.id, action: "switch" });
    try {
      await kokloClient.worktrees.switch({ path: selected.path });
      const next = sessions.find((session) => session.id === selected.sessionId);
      if (next) setView({ screen: "transcript", session: next });
      setWorktrees(await loadWorktreeItems(kokloClient, sessions));
    } finally {
      setWorktreeBusy({ itemId: null, action: null });
    }
  };

  const handlePruneWorktree = async (item: WorktreeSwitcherItem) => {
    const selected = worktrees.find((entry) => entry.id === item.id);
    if (!selected) return;
    setWorktreeBusy({ itemId: selected.id, action: "prune" });
    try {
      await kokloClient.worktrees.prune({ path: selected.path });
      setWorktrees(await loadWorktreeItems(kokloClient, sessions));
    } finally {
      setWorktreeBusy({ itemId: null, action: null });
    }
  };

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
          onNavClick={(id) => {
            if (id === "sessions") showSessions();
          }}
          onNewSession={openNewRun}
          topbar={{
            breadcrumbs: isTranscript
              ? [{ label: "koklo" }, { label: "Sessions" }, { label: view.session.title }]
              : [{ label: "koklo" }, { label: "Sessions" }],
            hasNotification: pendingGateCount > 0,
            isDark,
            onThemeToggle: toggle,
            dragRegion: true,
            leadingSlot: (
              <WorktreeSwitcher
                items={worktrees}
                busyItemId={worktreeBusy.itemId}
                busyAction={worktreeBusy.action}
                onSelect={(item) => void handleSwitchWorktree(item)}
                onPrune={(item) => void handlePruneWorktree(item)}
              />
            ),
            trailingSlot: <WindowControls />,
          }}
        >
          {isTranscript ? (
            <TranscriptScreen
              client={kokloClient}
              sessionId={view.session.id}
              sessionTitle={view.session.title}
              worktreePath={view.session.workspacePath}
              worktreeBranch={view.session.workspaceBranch}
              onBack={() => setView({ screen: "sessions" })}
            />
          ) : (
            <SessionsScreen
              client={kokloClient}
              openRunModalSignal={openRunModalToken}
              onPendingGateCountChange={setPendingGateCount}
              onSessionsChange={setSessions}
              onOpenSession={(session) => setView({ screen: "transcript", session })}
            />
          )}
        </Shell>
      </ErrorBoundary>
    </Toaster>
  );
}
