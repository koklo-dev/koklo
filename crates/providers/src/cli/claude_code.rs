//! Claude Code CLI provider (subprocess).
use super::{check_claude_session, flatten_messages_to_prompt, strip_ansi, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;

pub struct ClaudeCodeCliProvider {
    #[allow(dead_code)] // used when `pty` feature is enabled
    mode: CliMode,
}

impl ClaudeCodeCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        which::which("claude").map_err(|_| ProviderError::CliNotInstalled {
            name: "claude".to_string(),
            install_hint: "Install from: https://claude.ai/download or `npm install -g @anthropic-ai/claude-code`".to_string(),
        })?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
        })
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

        let output = tokio::process::Command::new("claude")
            .arg("--print")
            .arg(&prompt)
            .output()
            .await
            .map_err(ProviderError::Io)?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{}{}", stdout, stderr);

        if check_claude_session(&combined) {
            return Err(ProviderError::CliSessionExpired {
                auth_command: "claude auth login".to_string(),
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

        let text = strip_ansi(&stdout);
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
        "claude-code-cli"
    }
}
