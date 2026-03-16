//! Claude Code CLI provider (subprocess, streaming stdout).
use super::{check_claude_session, flatten_messages_to_prompt, strip_ansi, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use koklo_shell::Sandbox;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

pub struct ClaudeCodeCliProvider {
    #[allow(dead_code)] // used when `pty` feature is enabled
    mode: CliMode,
    working_dir: Option<std::path::PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
}

impl ClaudeCodeCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: None,
            sandbox: None,
        })
    }

    pub fn with_working_dir(working_dir: std::path::PathBuf) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: None,
        })
    }

    pub fn with_context(
        working_dir: std::path::PathBuf,
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
        which::which("claude").map_err(|_| ProviderError::CliNotInstalled {
            name: "claude".to_string(),
            install_hint: "Install from: https://claude.ai/download or `npm install -g @anthropic-ai/claude-code`".to_string(),
        })?;
        Ok(())
    }
}

#[async_trait]
impl LlmProvider for ClaudeCodeCliProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        let prompt = flatten_messages_to_prompt(&messages);
        let args = vec![
            "--print".to_string(),
            "--dangerously-skip-permissions".to_string(),
            prompt.clone(),
        ];

        if let (Some(sandbox), Some(dir)) = (&self.sandbox, &self.working_dir) {
            let output = super::run_sandboxed_command(sandbox, dir, "claude", &args).await?;
            let combined = format!("{}{}", output.stdout, output.stderr);
            if check_claude_session(&combined) {
                return Err(ProviderError::CliSessionExpired {
                    auth_command: "claude auth login".to_string(),
                }
                .into());
            }
            if output.exit_code != 0 {
                return Err(ProviderError::HttpError {
                    status: output.exit_code.max(1) as u16,
                    body: output.stderr,
                }
                .into());
            }

            let text = strip_ansi(&output.stdout);
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

        let mut command = tokio::process::Command::new("claude");
        command
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = &self.working_dir {
            command.current_dir(dir);
        }

        let mut child = command.spawn().map_err(ProviderError::Io)?;

        let stdout = child.stdout.take().expect("stdout is piped");
        let stderr = child.stderr.take().expect("stderr is piped");

        // Drain stderr in background to prevent pipe deadlock.
        let stderr_handle = tokio::spawn(async move {
            let mut buf = String::new();
            BufReader::new(stderr).read_to_string(&mut buf).await.ok();
            buf
        });

        // Stream stdout line-by-line so on_chunk is called in real time.
        let mut lines = BufReader::new(stdout).lines();
        let mut full_text = String::new();
        while let Some(line) = lines.next_line().await.map_err(ProviderError::Io)? {
            let chunk = format!("{}\n", line);
            on_chunk(StreamChunk {
                text: chunk.clone(),
                finished: false,
            });
            full_text.push_str(&chunk);
        }

        let status = child.wait().await.map_err(ProviderError::Io)?;
        let stderr_content = stderr_handle.await.unwrap_or_default();

        let combined = format!("{}{}", full_text, stderr_content);
        if check_claude_session(&combined) {
            return Err(ProviderError::CliSessionExpired {
                auth_command: "claude auth login".to_string(),
            }
            .into());
        }

        if !status.success() {
            return Err(ProviderError::HttpError {
                status: status.code().unwrap_or(1) as u16,
                body: stderr_content,
            }
            .into());
        }

        let text = strip_ansi(&full_text);
        if text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }

        on_chunk(StreamChunk {
            text: String::new(),
            finished: true,
        });
        Ok(text)
    }

    fn provider_name(&self) -> &str {
        "claude-code-cli"
    }
}
