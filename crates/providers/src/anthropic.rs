//! Anthropic Claude provider (HTTP SSE streaming).
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use futures_util::StreamExt;

pub struct AnthropicProvider {
    pub api_key: String,
    pub model: String,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn from_env() -> Result<Self, ProviderError> {
        let api_key =
            std::env::var("ANTHROPIC_API_KEY").map_err(|_| ProviderError::MissingApiKey {
                var_name: "ANTHROPIC_API_KEY".to_string(),
            })?;
        let model =
            std::env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| "claude-opus-4-6".to_string());
        Ok(Self::new(api_key, model))
    }

    pub fn from_config(entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        let var_name = entry.api_key_env.as_deref().unwrap_or("ANTHROPIC_API_KEY");
        let api_key = std::env::var(var_name).map_err(|_| ProviderError::MissingApiKey {
            var_name: var_name.to_string(),
        })?;
        let model = entry
            .model
            .clone()
            .or_else(|| std::env::var("ANTHROPIC_MODEL").ok())
            .unwrap_or_else(|| "claude-opus-4-6".to_string());
        Ok(Self::new(api_key, model))
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        let system = messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect::<Vec<_>>()
            .join("\n");
        let api_messages: Vec<_> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 4096,
            "system": system,
            "messages": api_messages,
            "stream": true
        });

        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if status == 401 || status == 403 {
                return Err(ProviderError::MissingApiKey {
                    var_name: "ANTHROPIC_API_KEY".to_string(),
                }
                .into());
            }
            return Err(ProviderError::HttpError { status, body: text }.into());
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" {
                        break;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(t) = json["delta"]["text"].as_str() {
                            full_text.push_str(t);
                            on_chunk(StreamChunk {
                                text: t.to_string(),
                                finished: false,
                            });
                        }
                    }
                }
            }
        }

        if full_text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }
        on_chunk(StreamChunk {
            text: String::new(),
            finished: true,
        });
        Ok(full_text)
    }

    fn provider_name(&self) -> &str {
        "anthropic"
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env_missing_key() {
        std::env::remove_var("ANTHROPIC_API_KEY");
        let result = AnthropicProvider::from_env();
        assert!(matches!(result, Err(ProviderError::MissingApiKey { .. })));
    }

    #[test]
    fn test_from_config_with_literal_key() {
        // Use a unique env var name to avoid races with other tests that touch ANTHROPIC_API_KEY.
        let var = "ANTHROPIC_API_KEY_TEST_CONFIG";
        let entry = ProviderTomlEntry {
            api_key_env: Some(var.to_string()),
            model: Some("claude-haiku-4-5-20251001".to_string()),
            ..Default::default()
        };
        std::env::set_var(var, "sk-test-literal");
        let p = AnthropicProvider::from_config(&entry).unwrap();
        assert_eq!(p.model, "claude-haiku-4-5-20251001");
        assert_eq!(p.provider_name(), "anthropic");
        std::env::remove_var(var);
    }

    #[test]
    fn test_provider_name() {
        let p = AnthropicProvider::new("key", "claude-opus-4-6");
        assert_eq!(p.provider_name(), "anthropic");
        assert_eq!(p.model_name(), Some("claude-opus-4-6"));
    }
}
