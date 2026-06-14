import { Shell, Toaster } from "@koklo/ui";
import { SessionsScreen } from "./screens/Sessions";
import { kokloClient } from "./lib/client";
import { useTheme } from "./lib/theme";

/**
 * Desktop root. For US-017 the only wired screen is Sessions, mounted inside the
 * design-system `Shell` (Sidebar + TopBar). Navigation routing, the Transcript
 * and Gate screens (roadmap P2 §4–§5), and the org/project switchers land later.
 */
export function App() {
  // The open-project path; sourced from a project context once routing lands.
  const projectPath = ".";
  const { isDark, toggle } = useTheme();

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
          breadcrumbs: [{ label: "koklo" }, { label: "Sessions" }],
          isDark,
          onThemeToggle: toggle,
        }}
      >
        <SessionsScreen client={kokloClient} projectPath={projectPath} />
      </Shell>
    </Toaster>
  );
}
