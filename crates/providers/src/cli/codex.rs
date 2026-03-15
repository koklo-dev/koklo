//! OpenAI Codex CLI provider (subprocess).
use super::{check_claude_session, flatten_messages_to_prompt, strip_ansi, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use std::path::PathBuf;

pub struct CodexCliProvider {
    #[allow(dead_code)] // used when `pty` feature is enabled
    mode: CliMode,
}

impl CodexCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        which::which("codex").map_err(|_| ProviderError::CliNotInstalled {
            name: "codex".to_string(),
            install_hint: "Install from: https://github.com/openai/codex or `npm install -g @openai/codex`".to_string(),
        })?;
        Ok(Self { mode: CliMode::detect_from_env() })
    }

    #[allow(dead_code)] // used by PTY mode / future home-dir resolution
    fn resolve_home_dir() -> Result<PathBuf, ProviderError> {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(PathBuf::from)
            .map_err(|_| ProviderError::Config("HOME/USERPROFILE env var not set".to_string()))
    }
}

#[async_trait]
impl LlmProvider for CodexCliProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        let prompt = flatten_messages_to_prompt(&messages);

        let output = tokio::process::Command::new("codex")
            .arg("--quiet")
            .arg(&prompt)
            .output()
            .await
            .map_err(ProviderError::Io)?;

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

        let text = strip_ansi(&stdout);
        if text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }

        on_chunk(StreamChunk { text: text.clone(), finished: false });
        on_chunk(StreamChunk { text: String::new(), finished: true });
        Ok(text)
    }

    fn provider_name(&self) -> &str {
        "codex-cli"
    }
}
