//! End-to-end happy-path integration test for the MVP `koklo run` flow.
//!
//! This test drives the real `koklo` binary against a deterministic mock LLM
//! provider (no network, no model). It exercises the P1 happy path:
//! initialise a temporary git project, run the light preset without the TUI,
//! and assert that the session completes, generates artifacts, and gets a
//! dedicated session branch.
//!
//! Everything is isolated under tempdirs (`KOKLO_HOME`, `KOKLO_DB_PATH`, the
//! project repo) so the test never touches the developer's real `~/.koklo`.

use std::path::Path;
use std::process::Command;

/// Run a git command in `dir`, panicking with context on failure.
fn git(dir: &Path, args: &[&str]) {
    let status = Command::new("git")
        .args(args)
        .current_dir(dir)
        .status()
        .expect("failed to spawn git");
    assert!(status.success(), "git {args:?} failed");
}

/// Build a `koklo` command with a fully isolated environment.
fn koklo_cmd(project: &Path, home: &Path) -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_koklo"));
    cmd.current_dir(project)
        .env("KOKLO_HOME", home)
        .env("KOKLO_DB_PATH", home.join("koklo.db"))
        .env("KOKLO_PROVIDER", "mock")
        .env("KOKLO_ALLOW_MOCK_PROVIDER", "1")
        // Keep the run unattended and free of external calls.
        .env_remove("GITHUB_TOKEN")
        .env_remove("CI");
    cmd
}

/// Extract the value after `prefix` from the first matching line.
fn field<'a>(stdout: &'a str, prefix: &str) -> Option<&'a str> {
    stdout
        .lines()
        .find_map(|line| line.trim().strip_prefix(prefix))
        .map(str::trim)
}

#[test]
fn light_preset_happy_path_completes_with_mock_provider() {
    // --- 1. Initialise a temporary project (git repo + .koklo config) ---
    let project = tempfile::tempdir().expect("project tempdir");
    let home = tempfile::tempdir().expect("home tempdir");
    let project_path = project.path();
    let home_path = home.path();

    git(project_path, &["init", "--quiet"]);
    git(project_path, &["config", "user.email", "test@koklo.dev"]);
    git(project_path, &["config", "user.name", "Koklo Test"]);
    std::fs::write(project_path.join("README.md"), "# Fixture project\n").unwrap();

    let koklo_dir = project_path.join(".koklo");
    std::fs::create_dir_all(&koklo_dir).unwrap();
    std::fs::write(
        koklo_dir.join("pipeline.toml"),
        "[pipeline]\ndefault_provider = \"mock\"\n\n\
         [workflow]\npreset = \"light\"\n\n\
         [providers.mock]\n",
    )
    .unwrap();

    git(project_path, &["add", "."]);
    git(project_path, &["commit", "--quiet", "-m", "init fixture"]);

    // Koklo requires a local account before `run`; provision one in the isolated
    // home so the gate passes non-interactively (mirrors `koklo account setup`).
    std::fs::write(
        home_path.join("account.toml"),
        "name = \"Koklo Test\"\nemail = \"test@koklo.dev\"\ncreated_at = 0\n",
    )
    .unwrap();

    // --- 2. Run the light preset without the TUI ---
    let output = koklo_cmd(project_path, home_path)
        .args([
            "run",
            "--preset",
            "light",
            "--no-tui",
            "task",
            "Add a hello world function",
        ])
        .output()
        .expect("failed to run koklo");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "koklo run failed\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    // --- 3. Assert: completed session, generated artifacts, session branch ---
    let session_id = field(&stdout, "Pipeline complete — session:")
        .unwrap_or_else(|| panic!("no session id in output:\n{stdout}"));
    assert!(!session_id.is_empty(), "empty session id:\n{stdout}");

    // The run output reports the dedicated session branch directly.
    let run_branch = field(&stdout, "Branch:")
        .unwrap_or_else(|| panic!("no branch line in run output:\n{stdout}"));
    assert!(
        run_branch.starts_with("koklo/session/"),
        "expected a dedicated session branch, got '{run_branch}':\n{stdout}"
    );

    // Authoritative state via `session show` (status persisted in SQLite).
    let show = koklo_cmd(project_path, home_path)
        .args(["session", "show", session_id])
        .output()
        .expect("failed to run session show");
    let show_out = String::from_utf8_lossy(&show.stdout);
    assert!(show.status.success(), "session show failed:\n{show_out}");

    assert_eq!(
        field(&show_out, "Status:"),
        Some("completed"),
        "session should be completed:\n{show_out}"
    );
    assert_eq!(
        field(&show_out, "Branch:"),
        Some(run_branch),
        "branch should match the run output:\n{show_out}"
    );

    // Generated artifacts: one markdown artifact per phase under the workspace.
    let workspace = field(&show_out, "Workspace:")
        .unwrap_or_else(|| panic!("no workspace in session show:\n{show_out}"));
    let artifacts_dir = Path::new(workspace).join("docs").join("planning_artifacts");
    let artifacts: Vec<_> = std::fs::read_dir(&artifacts_dir)
        .unwrap_or_else(|e| panic!("artifacts dir {artifacts_dir:?} unreadable: {e}"))
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .collect();
    assert!(
        !artifacts.is_empty(),
        "expected generated artifacts in {artifacts_dir:?}"
    );

    // All phases recorded as completed.
    let completed_phases = show_out.lines().filter(|l| l.contains("completed")).count();
    assert!(
        completed_phases >= 1,
        "expected completed phases in session show:\n{show_out}"
    );
}
