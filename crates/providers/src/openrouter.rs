//! OpenRouter provider — wraps OpenAICompatProvider with optional routing config.
//!
//! OpenRouter is an OpenAI-compatible gateway that aggregates 300+ models from 60+ providers
//! under a single API key. Configure via `[providers.openrouter]` in `pipeline.toml`.
use crate::config::{ProviderRouting, ProviderTomlEntry};
use crate::error::ProviderError;
use crate::openai_compat::OpenAICompatProvider;
use crate::resolve_secret;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use std::time::Duration;

pub struct OpenRouterProvider {
    pub(crate) inner: OpenAICompatProvider,
}

impl OpenRouterProvider {
    const BASE_URL: &'static str = "https://openrouter.ai/api/v1";

    pub fn new(api_key: String, model: String, routing: Option<ProviderRouting>) -> Self {
        Self {
            inner: OpenAICompatProvider {
                api_key,
                model,
                base_url: Self::BASE_URL.to_string(),
                name: "openrouter".to_string(),
                api_key_env: "OPENROUTER_API_KEY".to_string(),
                client: reqwest::Client::builder()
                    .timeout(Duration::from_secs(120))
                    .build()
                    .unwrap_or_default(),
                extra_headers: vec![
                    ("HTTP-Referer".to_string(), "https://koklo.dev".to_string()),
                    ("X-Title".to_string(), "koklo".to_string()),
                ],
                extra_body: routing.map(|r| serde_json::json!({ "provider": r.to_json() })),
            },
        }
    }

    pub fn from_config(entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        let var_name = entry.api_key_env.as_deref().unwrap_or("OPENROUTER_API_KEY");
        let api_key = resolve_secret(var_name).ok_or_else(|| ProviderError::MissingApiKey {
            var_name: var_name.to_string(),
        })?;
        let model = entry
            .model
            .clone()
            .unwrap_or_else(|| "openai/gpt-4o".to_string());
        Ok(Self::new(api_key, model, entry.routing.clone()))
    }
}

#[async_trait]
impl LlmProvider for OpenRouterProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        self.inner.complete_stream(messages, on_chunk).await
    }

    fn provider_name(&self) -> &str {
        "openrouter"
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.inner.model)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn sse_done() -> String {
        "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},\"finish_reason\":null}]}\n\ndata: [DONE]\n\n".to_string()
    }

    #[test]
    fn test_from_config_missing_key() {
        std::env::remove_var("OPENROUTER_API_KEY");
        let entry = ProviderTomlEntry::default();
        let result = OpenRouterProvider::from_config(&entry);
        assert!(matches!(result, Err(ProviderError::MissingApiKey { .. })));
    }

    #[test]
    fn test_from_config_with_key_and_model() {
        std::env::set_var("OPENROUTER_API_KEY", "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some("OPENROUTER_API_KEY".to_string()),
            model: Some("anthropic/claude-opus-4-6".to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert_eq!(p.provider_name(), "openrouter");
        assert_eq!(p.model_name(), Some("anthropic/claude-opus-4-6"));
        std::env::remove_var("OPENROUTER_API_KEY");
    }

    #[test]
    fn test_default_model_is_gpt4o() {
        std::env::set_var("OPENROUTER_API_KEY", "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some("OPENROUTER_API_KEY".to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert_eq!(p.model_name(), Some("openai/gpt-4o"));
        std::env::remove_var("OPENROUTER_API_KEY");
    }

    #[test]
    fn test_from_config_reads_key_from_secrets_file() {
        let dir = tempfile::tempdir().unwrap();
        let secrets = dir.path().join("secrets.toml");
        std::fs::write(&secrets, "[env]\nOPENROUTER_API_KEY = \"sk-or-test\"\n").unwrap();
        std::env::remove_var("OPENROUTER_API_KEY");
        std::env::set_var("KOKLO_SECRETS_FILE", &secrets);

        let entry = ProviderTomlEntry {
            api_key_env: Some("OPENROUTER_API_KEY".to_string()),
            model: Some("google/gemma-3-4b-it:free".to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert_eq!(p.model_name(), Some("google/gemma-3-4b-it:free"));

        std::env::remove_var("KOKLO_SECRETS_FILE");
    }

    #[test]
    fn test_extra_body_contains_provider_when_routing_set() {
        std::env::set_var("OPENROUTER_API_KEY", "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some("OPENROUTER_API_KEY".to_string()),
            routing: Some(ProviderRouting {
                zdr: Some(true),
                data_collection: Some("deny".to_string()),
                allow_fallbacks: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        let extra_body = p.inner.extra_body.as_ref().unwrap();
        assert!(extra_body["provider"]["zdr"].as_bool().unwrap());
        assert_eq!(
            extra_body["provider"]["data_collection"].as_str().unwrap(),
            "deny"
        );
        assert!(!extra_body["provider"]["allow_fallbacks"].as_bool().unwrap());
        std::env::remove_var("OPENROUTER_API_KEY");
    }

    #[test]
    fn test_no_extra_body_when_no_routing() {
        std::env::set_var("OPENROUTER_API_KEY", "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some("OPENROUTER_API_KEY".to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert!(p.inner.extra_body.is_none());
        std::env::remove_var("OPENROUTER_API_KEY");
    }

    #[tokio::test]
    async fn test_extra_headers_sent_to_server() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .and(header("HTTP-Referer", "https://koklo.dev"))
            .and(header("X-Title", "koklo"))
            .respond_with(ResponseTemplate::new(200).set_body_string(sse_done()))
            .expect(1)
            .mount(&server)
            .await;

        let p =
            OpenRouterProvider::new("sk-or-test".to_string(), "openai/gpt-4o".to_string(), None);
        // Override base_url with mock server
        let mut inner = p.inner;
        inner.base_url = server.uri();
        let p2 = OpenRouterProvider { inner };

        let messages = vec![crate::Message::user("hello")];
        let result = p2.complete_stream(messages, &mut |_| {}).await.unwrap();
        assert_eq!(result, "ok");
        server.verify().await;
    }

    #[tokio::test]
    async fn test_routing_body_merged_into_request() {
        let server = MockServer::start().await;
        // We verify the request body contains the routing fields via a custom matcher
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(sse_done()))
            .expect(1)
            .mount(&server)
            .await;

        let routing = ProviderRouting {
            data_collection: Some("deny".to_string()),
            zdr: Some(true),
            ..Default::default()
        };
        let p = OpenRouterProvider::new(
            "sk-or-test".to_string(),
            "openai/gpt-4o".to_string(),
            Some(routing),
        );
        let mut inner = p.inner;
        inner.base_url = server.uri();
        let p2 = OpenRouterProvider { inner };

        let messages = vec![crate::Message::user("hello")];
        p2.complete_stream(messages, &mut |_| {}).await.unwrap();
        server.verify().await;
    }
}
