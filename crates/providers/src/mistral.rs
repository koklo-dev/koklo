//! Mistral AI provider (wraps OpenAICompatProvider).
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::openai_compat::OpenAICompatProvider;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;

pub struct MistralProvider {
    inner: OpenAICompatProvider,
}

impl MistralProvider {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            inner: OpenAICompatProvider::new(
                api_key,
                model,
                "https://api.mistral.ai/v1",
                "mistral",
                "MISTRAL_API_KEY",
            ),
        }
    }

    pub fn from_env() -> Result<Self, ProviderError> {
        let api_key =
            std::env::var("MISTRAL_API_KEY").map_err(|_| ProviderError::MissingApiKey {
                var_name: "MISTRAL_API_KEY".to_string(),
            })?;
        let model = std::env::var("MISTRAL_MODEL")
            .unwrap_or_else(|_| "mistral-large-latest".to_string());
        Ok(Self::new(api_key, model))
    }

    pub fn from_config(entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        let var_name = entry.api_key_env.as_deref().unwrap_or("MISTRAL_API_KEY");
        let api_key = std::env::var(var_name).map_err(|_| ProviderError::MissingApiKey {
            var_name: var_name.to_string(),
        })?;
        let model = entry
            .model
            .clone()
            .or_else(|| std::env::var("MISTRAL_MODEL").ok())
            .unwrap_or_else(|| "mistral-large-latest".to_string());
        let base_url = entry
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.mistral.ai/v1".to_string());
        Ok(Self {
            inner: OpenAICompatProvider::new(api_key, model, base_url, "mistral", var_name),
        })
    }
}

#[async_trait]
impl LlmProvider for MistralProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        self.inner.complete_stream(messages, on_chunk).await
    }

    fn provider_name(&self) -> &str {
        "mistral"
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.inner.model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env_missing_key() {
        std::env::remove_var("MISTRAL_API_KEY");
        let result = MistralProvider::from_env();
        assert!(matches!(result, Err(ProviderError::MissingApiKey { .. })));
    }

    #[test]
    fn test_from_config_with_key() {
        std::env::set_var("MISTRAL_API_KEY", "mk-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some("MISTRAL_API_KEY".to_string()),
            model: Some("mistral-small".to_string()),
            ..Default::default()
        };
        let p = MistralProvider::from_config(&entry).unwrap();
        assert_eq!(p.provider_name(), "mistral");
        assert_eq!(p.model_name(), Some("mistral-small"));
        std::env::remove_var("MISTRAL_API_KEY");
    }
}
