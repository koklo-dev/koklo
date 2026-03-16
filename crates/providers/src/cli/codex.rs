//! OpenAI Codex CLI provider (subprocess).
use super::{check_claude_session, flatten_messages_to_prompt, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use koklo_shell::Sandbox;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;

pub struct CodexCliProvider {
    #[allow(dead_code)] // used when `pty` feature is enabled
    mode: CliMode,
    working_dir: Option<PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
}

impl CodexCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: None,
            sandbox: None,
        })
    }

    pub fn with_working_dir(working_dir: PathBuf) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: None,
        })
    }

    pub fn with_context(
        working_dir: PathBuf,
        sandbox: Arc<dyn Sandbox>,
    ) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: Some(sandbox),
        })
    }

    fn validate_install() -> Result<(), ProviderError> {
        which::which("codex").map_err(|_| ProviderError::CliNotInstalled {
            name: "codex".to_string(),
            install_hint:
                "Install from: https://github.com/openai/codex or `npm install -g @openai/codex`"
                    .to_string(),
        })?;
        Ok(())
    }

    #[allow(dead_code)] // used by PTY mode / future home-dir resolution
    fn resolve_home_dir() -> Result<PathBuf, ProviderError> {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(PathBuf::from)
            .map_err(|_| ProviderError::Config("HOME/USERPROFILE env var not set".to_string()))
    }

    fn build_exec_args(prompt: String) -> Vec<String> {
        vec![
            "exec".to_string(),
            "--json".to_string(),
            "--ephemeral".to_string(),
            prompt,
        ]
    }
}

#[derive(Debug, Deserialize)]
struct CodexExecEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    item: Option<CodexExecItem>,
}

#[derive(Debug, Deserialize)]
struct CodexExecItem {
    #[serde(rename = "type")]
    item_type: String,
    #[serde(default)]
    text: String,
}

fn parse_codex_exec_output(stdout: &str) -> Result<String, ProviderError> {
    let mut last_message = None;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            continue;
        }

        let Ok(event) = serde_json::from_str::<CodexExecEvent>(trimmed) else {
            continue;
        };

        if event.event_type != "item.completed" {
            continue;
        }

        if let Some(item) = event.item {
            if item.item_type == "agent_message" && !item.text.trim().is_empty() {
                last_message = Some(item.text);
            }
        }
    }

    last_message.ok_or(ProviderError::EmptyResponse)
}

#[async_trait]
impl LlmProvider for CodexCliProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        let prompt = flatten_messages_to_prompt(&messages);
        let args = Self::build_exec_args(prompt);

        if let (Some(sandbox), Some(dir)) = (&self.sandbox, &self.working_dir) {
            let output = super::run_sandboxed_command(sandbox, dir, "codex", &args).await?;
            let stdout = output.stdout;
            let stderr = output.stderr;
            let combined = format!("{}{}", stdout, stderr);

            if check_claude_session(&combined) {
                return Err(ProviderError::CliSessionExpired {
                    auth_command: "codex login".to_string(),
                }
                .into());
            }

            if output.exit_code != 0 {
                return Err(ProviderError::HttpError {
                    status: output.exit_code.max(1) as u16,
                    body: stderr,
                }
                .into());
            }

            let text = parse_codex_exec_output(&stdout)?;
            if text.trim().is_empty() {
                return Err(ProviderError::EmptyResponse.into());
            }

            on_chunk(StreamChunk {
                text: text.clone(),
                finished: false,
            });
            on_chunk(StreamChunk {
                text: String::new(),
                finished: true,
            });
            return Ok(text);
        }

        let mut command = tokio::process::Command::new("codex");
        command.args(&args);
        if let Some(dir) = &self.working_dir {
            command.current_dir(dir);
        }

        let output = command.output().await.map_err(ProviderError::Io)?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{}{}", stdout, stderr);

        // Codex uses similar session patterns to claude
        if check_claude_session(&combined) {
            return Err(ProviderError::CliSessionExpired {
                auth_command: "codex login".to_string(),
            }
            .into());
        }

        if !output.status.success() {
            return Err(ProviderError::HttpError {
                status: output.status.code().unwrap_or(1) as u16,
                body: stderr.into_owned(),
            }
            .into());
        }

        let text = parse_codex_exec_output(&stdout)?;
        if text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }

        on_chunk(StreamChunk {
            text: text.clone(),
            finished: false,
        });
        on_chunk(StreamChunk {
            text: String::new(),
            finished: true,
        });
        Ok(text)
    }

    fn provider_name(&self) -> &str {
        "codex-cli"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_exec_args_uses_non_interactive_codex_mode() {
        assert_eq!(
            CodexCliProvider::build_exec_args("Reply with OK".to_string()),
            vec![
                "exec".to_string(),
                "--json".to_string(),
                "--ephemeral".to_string(),
                "Reply with OK".to_string(),
            ]
        );
    }

    #[test]
    fn test_parse_codex_exec_output_reads_last_agent_message() {
        let stdout = r#"
{"type":"thread.started","thread_id":"abc"}
{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"first"}}
{"type":"item.completed","item":{"id":"2","type":"agent_message","text":"OK"}}
{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}
"#;

        assert_eq!(parse_codex_exec_output(stdout).unwrap(), "OK");
    }

    #[test]
    fn test_parse_codex_exec_output_ignores_non_json_noise() {
        let stdout = r#"
WARNING: cache issue
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"OK"}}
"#;

        assert_eq!(parse_codex_exec_output(stdout).unwrap(), "OK");
    }
}
