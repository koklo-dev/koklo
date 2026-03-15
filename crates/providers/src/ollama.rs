//! Ollama local LLM provider.
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use futures_util::StreamExt;

pub struct OllamaProvider {
    pub base_url: String,
    pub model: String,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            model: model.into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn from_env() -> Self {
        let base_url = std::env::var("OLLAMA_BASE_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
        let model =
            std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "qwen2.5-coder:7b".to_string());
        Self::new(base_url, model)
    }

    pub fn from_config(entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        let base_url = entry
            .base_url
            .clone()
            .or_else(|| std::env::var("OLLAMA_BASE_URL").ok())
            .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
        let model = entry
            .model
            .clone()
            .or_else(|| std::env::var("OLLAMA_MODEL").ok())
            .unwrap_or_else(|| "qwen2.5-coder:7b".to_string());
        Ok(Self::new(base_url, model))
    }

    /// Fetch available model names from `/api/tags`.
    async fn fetch_available_models(&self) -> Result<Vec<String>> {
        let resp = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Ok(vec![]);
        }
        let json: serde_json::Value = resp.json().await?;
        let models = json["models"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["name"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        Ok(models)
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        let api_messages: Vec<_> = messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let body = serde_json::json!({
            "model": self.model,
            "messages": api_messages,
            "stream": true
        });

        let resp = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if status == 404 || text.contains("model") {
                let available = self.fetch_available_models().await.unwrap_or_default();
                return Err(ProviderError::OllamaModelNotFound {
                    model: self.model.clone(),
                    available: if available.is_empty() {
                        "none found".to_string()
                    } else {
                        available.join(", ")
                    },
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
                if line.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(t) = json["message"]["content"].as_str() {
                        full_text.push_str(t);
                        on_chunk(StreamChunk { text: t.to_string(), finished: false });
                    }
                    if json["done"].as_bool().unwrap_or(false) {
                        on_chunk(StreamChunk { text: String::new(), finished: true });
                    }
                }
            }
        }

        if full_text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }
        Ok(full_text)
    }

    fn provider_name(&self) -> &str {
        "ollama"
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env() {
        let p = OllamaProvider::from_env();
        assert!(!p.base_url.is_empty());
        assert!(!p.model.is_empty());
        assert_eq!(p.provider_name(), "ollama");
    }

    #[test]
    fn test_from_config_defaults() {
        let entry = ProviderTomlEntry::default();
        let p = OllamaProvider::from_config(&entry).unwrap();
        assert_eq!(p.base_url, "http://127.0.0.1:11434");
        assert_eq!(p.model, "qwen2.5-coder:7b");
    }

    #[test]
    fn test_from_config_custom() {
        let entry = ProviderTomlEntry {
            base_url: Some("http://192.168.1.10:11434".to_string()),
            model: Some("llama3:8b".to_string()),
            ..Default::default()
        };
        let p = OllamaProvider::from_config(&entry).unwrap();
        assert_eq!(p.base_url, "http://192.168.1.10:11434");
        assert_eq!(p.model, "llama3:8b");
    }
}
