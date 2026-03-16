//! Shared OpenAI-protocol HTTP SSE implementation.
//! Used by both OpenAIProvider and MistralProvider.
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use futures_util::StreamExt;
use std::time::Duration;

/// Shared OpenAI-compatible provider. Fields are `pub(crate)` for thin wrappers.
pub(crate) struct OpenAICompatProvider {
    pub(crate) api_key: String,
    pub(crate) model: String,
    pub(crate) base_url: String,
    /// Display name used in error messages (e.g. "openai", "mistral").
    pub(crate) name: String,
    /// Env var that holds the API key (for error messages).
    pub(crate) api_key_env: String,
    pub(crate) client: reqwest::Client,
    /// Extra HTTP headers appended to every request (e.g. `HTTP-Referer` for OpenRouter).
    pub(crate) extra_headers: Vec<(String, String)>,
    /// Extra JSON keys merged into the top-level request body (e.g. `"provider": {...}`).
    pub(crate) extra_body: Option<serde_json::Value>,
}

/// Retry up to `max_attempts` on 429 or timeout, with exponential backoff (1s → 2s → 4s).
pub(crate) async fn with_retry<F, Fut>(
    f: F,
    max_attempts: u32,
) -> Result<reqwest::Response, ProviderError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<reqwest::Response, reqwest::Error>>,
{
    let mut delay_secs = 1u64;
    for attempt in 1..=max_attempts {
        match f().await {
            Ok(resp) if resp.status().as_u16() == 429 => {
                if attempt == max_attempts {
                    return Err(ProviderError::RateLimited {
                        attempts: max_attempts,
                    });
                }
                tracing::warn!(
                    "Rate limited (attempt {}), retrying in {}s",
                    attempt,
                    delay_secs
                );
                tokio::time::sleep(Duration::from_secs(delay_secs)).await;
                delay_secs *= 2;
            }
            Ok(resp) => return Ok(resp),
            Err(e) if e.is_timeout() => {
                if attempt == max_attempts {
                    return Err(ProviderError::Timeout { secs: delay_secs });
                }
                tracing::warn!("Timeout (attempt {}), retrying in {}s", attempt, delay_secs);
                tokio::time::sleep(Duration::from_secs(delay_secs)).await;
                delay_secs *= 2;
            }
            Err(e) => {
                return Err(ProviderError::HttpError {
                    status: 0,
                    body: e.to_string(),
                });
            }
        }
    }
    Err(ProviderError::RateLimited {
        attempts: max_attempts,
    })
}

/// Map HTTP error codes to typed ProviderError variants.
pub(crate) fn map_http_error(status: u16, body: &str, api_key_env: &str) -> ProviderError {
    match status {
        401 | 403 => ProviderError::MissingApiKey {
            var_name: api_key_env.to_string(),
        },
        429 => ProviderError::RateLimited { attempts: 1 },
        s if s >= 500 => ProviderError::HttpError {
            status,
            body: body.to_string(),
        },
        _ => ProviderError::HttpError {
            status,
            body: body.to_string(),
        },
    }
}

#[async_trait]
impl LlmProvider for OpenAICompatProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        let api_messages: Vec<_> = messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": api_messages,
            "stream": true
        });

        // Merge extra_body into the request body (e.g. OpenRouter `provider` routing).
        if let (Some(extra), Some(obj)) = (&self.extra_body, body.as_object_mut()) {
            if let Some(extra_obj) = extra.as_object() {
                obj.extend(extra_obj.iter().map(|(k, v)| (k.clone(), v.clone())));
            }
        }

        let client = self.client.clone();
        let url = format!("{}/chat/completions", self.base_url);
        let api_key = self.api_key.clone();
        let body_clone = body.clone();
        let extra_headers = self.extra_headers.clone();

        let resp = with_retry(
            || {
                let client = client.clone();
                let url = url.clone();
                let api_key = api_key.clone();
                let body = body_clone.clone();
                let extra_headers = extra_headers.clone();
                async move {
                    let mut req = client
                        .post(&url)
                        .header("Authorization", format!("Bearer {}", api_key))
                        .header("Content-Type", "application/json");
                    for (k, v) in &extra_headers {
                        req = req.header(k.as_str(), v.as_str());
                    }
                    req.json(&body).send().await
                }
            },
            3,
        )
        .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            return Err(map_http_error(status, &text, &self.api_key_env).into());
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_e| ProviderError::StreamInterrupted {
                bytes: full_text.len(),
            })?;
            let text = String::from_utf8_lossy(&chunk);
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        break;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(t) = json["choices"][0]["delta"]["content"].as_str() {
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
        &self.name
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.model)
    }
}

#[cfg(test)]
impl OpenAICompatProvider {
    pub(crate) fn new(
        api_key: impl Into<String>,
        model: impl Into<String>,
        base_url: impl Into<String>,
        name: impl Into<String>,
        api_key_env: impl Into<String>,
    ) -> Self {
        use std::time::Duration;
        Self {
            api_key: api_key.into(),
            model: model.into(),
            base_url: base_url.into(),
            name: name.into(),
            api_key_env: api_key_env.into(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
            extra_headers: vec![],
            extra_body: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn sse_chunk(content: &str) -> String {
        format!(
            "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}},\"finish_reason\":null}}]}}\n\n",
            content
        )
    }

    #[tokio::test]
    async fn test_valid_sse_stream() {
        let server = MockServer::start().await;
        let body = format!(
            "{}{}\ndata: [DONE]\n\n",
            sse_chunk("Hello"),
            sse_chunk(" world")
        );
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let p = OpenAICompatProvider::new(
            "test-key",
            "gpt-4o",
            server.uri(),
            "openai",
            "OPENAI_API_KEY",
        );
        let messages = vec![crate::Message::user("hi")];
        let mut chunks = vec![];
        let result = p
            .complete_stream(messages, &mut |c| chunks.push(c.text.clone()))
            .await
            .unwrap();
        assert_eq!(result, "Hello world");
        assert!(chunks.contains(&"Hello".to_string()));
    }

    #[tokio::test]
    async fn test_401_maps_to_missing_api_key() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&server)
            .await;

        let p = OpenAICompatProvider::new(
            "bad-key",
            "gpt-4o",
            server.uri(),
            "openai",
            "OPENAI_API_KEY",
        );
        let messages = vec![crate::Message::user("hi")];
        let err = p.complete_stream(messages, &mut |_| {}).await.unwrap_err();
        let pe = err.downcast_ref::<ProviderError>().unwrap();
        assert!(
            matches!(pe, ProviderError::MissingApiKey { var_name } if var_name == "OPENAI_API_KEY")
        );
    }

    #[tokio::test]
    async fn test_429_retries_three_times() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(429))
            .expect(3)
            .mount(&server)
            .await;

        let p =
            OpenAICompatProvider::new("key", "gpt-4o", server.uri(), "openai", "OPENAI_API_KEY");
        let messages = vec![crate::Message::user("hi")];
        let err = p.complete_stream(messages, &mut |_| {}).await.unwrap_err();
        let pe = err.downcast_ref::<ProviderError>().unwrap();
        assert!(matches!(pe, ProviderError::RateLimited { attempts: 3 }));
        server.verify().await;
    }
}
