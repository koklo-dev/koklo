//! LLM provider gateway — registry, per-agent selection, CLI subprocess providers.
//!
//! Provider resolution order (per agent):
//! 1. `KOKLO_PROVIDER_<AGENT_UPPER>` env var → registry lookup
//! 2. `agent_providers` map (from TOML)
//! 3. `default_provider`

pub mod cli;
pub mod config;
pub mod error;
pub mod fallback;
pub mod ollama;
pub(crate) mod openai_compat;
pub mod openrouter;
pub mod registry;
pub mod secrets;

pub use cli::claude_code::ClaudeCodeCliProvider;
pub use cli::codex::CodexCliProvider;
pub use config::{AgentTomlConfig, PipelineTomlConfig, ProviderRouting, ProviderTomlEntry};
pub use error::ProviderError;
pub use fallback::FallbackProvider;
pub use ollama::OllamaProvider;
pub use openrouter::OpenRouterProvider;
pub use registry::ProviderRegistry;
pub use secrets::{has_secret, load_secrets_into_env, resolve_secret, secrets_path};

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// A chunk of streamed text from an LLM.
#[derive(Debug, Clone)]
pub struct StreamChunk {
    pub text: String,
    pub finished: bool,
}

/// Trait every LLM provider must implement.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Stream a completion for the given messages. Calls `on_chunk` for each chunk.
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String>;

    /// Stable identifier for this provider (e.g. `"anthropic"`, `"claude-code-cli"`).
    fn provider_name(&self) -> &str;

    /// Optional model name (e.g. `"claude-opus-4-6"`). Defaults to `None`.
    fn model_name(&self) -> Option<&str> {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

impl Message {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
        }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
        }
    }
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_constructors() {
        let m = Message::user("hello");
        assert_eq!(m.role, "user");
        assert_eq!(m.content, "hello");

        let s = Message::system("be helpful");
        assert_eq!(s.role, "system");

        let a = Message::assistant("sure");
        assert_eq!(a.role, "assistant");
    }

    #[test]
    fn test_ollama_provider_from_env() {
        let p = OllamaProvider::from_env();
        assert!(!p.base_url.is_empty());
        assert!(!p.model.is_empty());
        assert_eq!(p.provider_name(), "ollama");
    }
}
