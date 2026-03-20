//! CLI-subprocess provider utilities.
pub mod claude_code;
pub mod codex;

use crate::Message;
use crate::ProviderError;
use koklo_shell::{CommandSpec, Sandbox, SandboxOutput};
use std::path::Path;
use std::sync::Arc;

/// How to invoke a CLI tool.
#[derive(Debug, Clone, PartialEq)]
pub enum CliMode {
    /// Capture full output via `tokio::process::Command` (always available).
    Subprocess,
    /// Stream via a PTY (Linux/macOS only, requires `pty` feature).
    Pty,
}

impl CliMode {
    /// Detect the appropriate mode for the current environment.
    pub fn detect_from_env() -> CliMode {
        detect_from_proc_version(&read_proc_version())
    }
}

fn read_proc_version() -> String {
    std::fs::read_to_string("/proc/version").unwrap_or_default()
}

fn detect_from_proc_version(v: &str) -> CliMode {
    let lower = v.to_lowercase();
    if lower.contains("microsoft") || lower.contains("wsl") {
        return CliMode::Subprocess;
    }
    #[cfg(feature = "pty")]
    return CliMode::Pty;
    #[cfg(not(feature = "pty"))]
    CliMode::Subprocess
}

/// Check whether CLI output indicates an expired or missing session.
///
/// Returns `true` if the output suggests the user needs to (re-)authenticate.
pub fn check_claude_session(output: &str) -> bool {
    let lower = output.to_lowercase();
    lower.contains("login")
        || lower.contains("authenticate")
        || lower.contains("session expired")
        || lower.contains("sign in")
        || lower.contains("unauthorized")
}

/// Strip ANSI escape sequences from a string.
pub fn strip_ansi(s: &str) -> String {
    let bytes = strip_ansi_escapes::strip(s);
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Flatten a message list into a single prompt string for CLI tools.
///
/// Format:
/// ```text
/// [System]
/// <content>
///
/// [User]
/// <content>
/// ```
pub fn flatten_messages_to_prompt(messages: &[Message]) -> String {
    let mut parts = Vec::new();
    for msg in messages {
        let header = match msg.role.as_str() {
            "system" => "[System]",
            "user" => "[User]",
            "assistant" => "[Assistant]",
            other => other,
        };
        parts.push(format!("{}\n{}", header, msg.content));
    }
    parts.join("\n\n")
}

pub async fn run_sandboxed_command(
    sandbox: &Arc<dyn Sandbox>,
    workdir: &Path,
    program: &str,
    args: &[String],
) -> Result<SandboxOutput, ProviderError> {
    let spec = CommandSpec::new(program).args(args.iter().cloned());
    sandbox
        .run_command(&spec, workdir)
        .await
        .map_err(|err| ProviderError::Sandbox(err.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Message;
    use koklo_shell::{BubblewrapSandbox, LandlockSandbox};

    #[test]
    fn test_detect_subprocess_on_wsl() {
        assert_eq!(
            detect_from_proc_version(
                "Linux version 5.15.0 ... microsoft-standard-WSL2 ... microsoft WSL2"
            ),
            CliMode::Subprocess
        );
    }

    #[test]
    fn test_detect_subprocess_on_wsl_lowercase() {
        assert_eq!(
            detect_from_proc_version("linux 5.10 microsoft"),
            CliMode::Subprocess
        );
    }

    #[test]
    fn test_detect_on_normal_linux() {
        let result = detect_from_proc_version("Linux version 5.15.0-generic");
        #[cfg(feature = "pty")]
        assert_eq!(result, CliMode::Pty);
        #[cfg(not(feature = "pty"))]
        assert_eq!(result, CliMode::Subprocess);
    }

    #[test]
    fn test_strip_ansi_removes_escapes() {
        let s = "\x1b[32mhello\x1b[0m world";
        assert_eq!(strip_ansi(s), "hello world");
    }

    #[test]
    fn test_strip_ansi_no_escapes() {
        let s = "plain text";
        assert_eq!(strip_ansi(s), "plain text");
    }

    #[test]
    fn test_flatten_messages_system_user() {
        let messages = vec![
            Message::system("You are a helpful assistant."),
            Message::user("Write a function."),
        ];
        let prompt = flatten_messages_to_prompt(&messages);
        assert!(prompt.contains("[System]"));
        assert!(prompt.contains("You are a helpful assistant."));
        assert!(prompt.contains("[User]"));
        assert!(prompt.contains("Write a function."));
    }

    #[test]
    fn test_flatten_messages_multi() {
        let messages = vec![
            Message::system("sys"),
            Message::user("q1"),
            Message::assistant("a1"),
            Message::user("q2"),
        ];
        let prompt = flatten_messages_to_prompt(&messages);
        assert!(prompt.contains("[Assistant]"));
        assert!(prompt.contains("q2"));
    }

    #[test]
    fn test_check_claude_session_expired() {
        assert!(check_claude_session("Please login to continue"));
        assert!(check_claude_session("Session expired, authenticate again"));
        assert!(!check_claude_session("Here is the answer to your question"));
    }

    #[tokio::test]
    async fn test_run_sandboxed_command_reports_pwd() {
        let sandbox: Arc<dyn Sandbox> = Arc::new(LandlockSandbox::new(vec![]));
        let out = run_sandboxed_command(&sandbox, Path::new("/tmp"), "pwd", &[])
            .await
            .unwrap();
        assert_eq!(out.exit_code, 0);
        assert_eq!(out.stdout.trim(), "/tmp");
    }

    #[tokio::test]
    async fn test_run_sandboxed_command_enforces_workspace_write_policy() {
        if !koklo_shell::bwrap_available() {
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path().join("workspace");
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        let sandbox: Arc<dyn Sandbox> = Arc::new(BubblewrapSandbox::with_writable_paths(
            vec![workspace.clone()],
            true,
        ));
        let args = vec![
            "-c".to_string(),
            format!("touch {}", outside.join("blocked.txt").display()),
        ];
        let out = run_sandboxed_command(&sandbox, tmp.path(), "sh", &args)
            .await
            .unwrap();

        assert_ne!(out.exit_code, 0);
        assert!(!outside.join("blocked.txt").exists());
    }
}
