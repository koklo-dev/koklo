import { useState } from "react";
import type { SessionDto } from "@koklo/trpc-client";
import { Shell, Toaster } from "@koklo/ui";
import { SessionsScreen } from "./screens/Sessions";
import { TranscriptScreen } from "./screens/Transcript";
import { kokloClient } from "./lib/client";
import { useTheme } from "./lib/theme";

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
