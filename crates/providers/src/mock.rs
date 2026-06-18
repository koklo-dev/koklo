//! Mock LLM provider — a deterministic test double for integration tests.
//!
//! The mock streams a canned, deterministic response without any network or
//! subprocess access, so the full pipeline (`koklo run`) can be exercised
//! end-to-end in CI without a real model. It is **opt-in**: the registry only
//! builds it when `KOKLO_ALLOW_MOCK_PROVIDER` is set to `1`/`true`, so a stray
//! `[providers.mock]` entry in a production config can never select it.
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::CompletionUsage;

/// Env flag that must be truthy for the mock provider to build.
pub const ALLOW_MOCK_ENV: &str = "KOKLO_ALLOW_MOCK_PROVIDER";
/// Optional override for the canned response body.
pub const MOCK_RESPONSE_ENV: &str = "KOKLO_MOCK_RESPONSE";

const DEFAULT_RESPONSE: &str = "# Mock agent output\n\n\
    This artifact was produced by the deterministic mock LLM provider.\n\n\
    - Plan: implement the requested change.\n\
    - Result: done.\n";

/// A deterministic provider that returns canned text. Used only in tests.
#[derive(Debug, Clone)]
pub struct MockProvider {
    response: String,
}

impl MockProvider {
    /// Create a mock provider with the given canned response.
    pub fn new(response: impl Into<String>) -> Self {
        Self {
            response: response.into(),
        }
    }

    /// Build from a TOML entry. Refuses to build unless [`ALLOW_MOCK_ENV`] is
    /// truthy, so the mock can never be selected by accident in production.
    pub fn from_config(entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        if !mock_enabled() {
            return Err(ProviderError::Config(format!(
                "mock provider requested but {ALLOW_MOCK_ENV} is not set"
            )));
        }
        let response = std::env::var(MOCK_RESPONSE_ENV)
            .ok()
            .filter(|s| !s.is_empty())
            .or_else(|| entry.model.clone())
            .unwrap_or_else(|| DEFAULT_RESPONSE.to_string());
        Ok(Self::new(response))
    }
}

fn mock_enabled() -> bool {
    std::env::var(ALLOW_MOCK_ENV)
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[async_trait]
impl LlmProvider for MockProvider {
    async fn complete_stream(
        &self,
        _messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)> {
        // Stream the response in a couple of chunks to exercise the streaming path.
        let midpoint = self.response.len() / 2;
        let split = self
            .response
            .char_indices()
            .map(|(i, _)| i)
            .find(|&i| i >= midpoint)
            .unwrap_or(0);
        let (head, tail) = self.response.split_at(split);
        if !head.is_empty() {
            on_chunk(StreamChunk::text(head));
        }
        if !tail.is_empty() {
            on_chunk(StreamChunk::text(tail));
        }
        on_chunk(StreamChunk::finished());

        let usage = CompletionUsage {
            prompt_tokens: 1,
            completion_tokens: self.response.split_whitespace().count() as u32,
        };
        Ok((self.response.clone(), usage))
    }

    fn provider_name(&self) -> &str {
        "mock"
    }

    fn model_name(&self) -> Option<&str> {
        Some("mock-model")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Serialise tests that mutate the shared `KOKLO_ALLOW_MOCK_PROVIDER` env var.
    static ENV_GUARD: Mutex<()> = Mutex::new(());

    #[test]
    fn from_config_refuses_without_opt_in() {
        let _g = ENV_GUARD.lock().unwrap();
        std::env::remove_var(ALLOW_MOCK_ENV);
        assert!(MockProvider::from_config(&ProviderTomlEntry::default()).is_err());
    }

    #[test]
    fn from_config_builds_when_enabled() {
        let _g = ENV_GUARD.lock().unwrap();
        std::env::set_var(ALLOW_MOCK_ENV, "1");
        let provider = MockProvider::from_config(&ProviderTomlEntry::default()).unwrap();
        assert_eq!(provider.provider_name(), "mock");
        std::env::remove_var(ALLOW_MOCK_ENV);
    }

    #[tokio::test]
    async fn complete_stream_returns_canned_response() {
        let provider = MockProvider::new("hello world output");
        let mut chunks = 0usize;
        let (output, usage) = provider
            .complete_stream(vec![Message::user("ping")], &mut |_chunk| {
                chunks += 1;
            })
            .await
            .unwrap();
        assert_eq!(output, "hello world output");
        assert!(chunks >= 2, "expected streamed chunks, got {chunks}");
        assert_eq!(usage.completion_tokens, 3);
    }
}
