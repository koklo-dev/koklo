//! FallbackProvider: chain provider A → B on transient errors.
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk};
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

/// Wraps a primary and secondary provider.
/// On transient errors from the primary, falls back to the secondary.
pub struct FallbackProvider {
    primary: Arc<dyn LlmProvider>,
    secondary: Arc<dyn LlmProvider>,
}

impl FallbackProvider {
    pub fn new(primary: Arc<dyn LlmProvider>, secondary: Arc<dyn LlmProvider>) -> Self {
        Self { primary, secondary }
    }
}

/// Returns `true` for errors that justify trying the fallback provider.
pub fn is_fallback_worthy(e: &ProviderError) -> bool {
    match e {
        ProviderError::CliNotInstalled { .. } => true,
        ProviderError::CliSessionExpired { .. } => true,
        ProviderError::PtyUnavailable => true,
        ProviderError::RateLimited { .. } => true,
        ProviderError::Timeout { .. } => true,
        ProviderError::HttpError { status, .. } => *status >= 500,
        // EmptyResponse, MissingApiKey, UnknownProvider → don't fallback
        _ => false,
    }
}

#[async_trait]
impl LlmProvider for FallbackProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<String> {
        match self
            .primary
            .complete_stream(messages.clone(), on_chunk)
            .await
        {
            Ok(text) => Ok(text),
            Err(e) => {
                if let Some(pe) = e.downcast_ref::<ProviderError>() {
                    if is_fallback_worthy(pe) {
                        tracing::warn!(
                            "Primary provider '{}' failed ({}), trying fallback '{}'",
                            self.primary.provider_name(),
                            e,
                            self.secondary.provider_name()
                        );
                        return self
                            .secondary
                            .complete_stream(messages, on_chunk)
                            .await
                            .map_err(|e2| {
                                ProviderError::FallbackExhausted {
                                    last_error: e2.to_string(),
                                }
                                .into()
                            });
                    }
                }
                Err(e)
            }
        }
    }

    fn provider_name(&self) -> &str {
        "fallback"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    struct SuccessProvider;
    struct FailProvider(ProviderError);

    // Helper to build a typed ProviderError that can be downcast
    fn cli_not_installed() -> anyhow::Error {
        ProviderError::CliNotInstalled {
            name: "test".into(),
            install_hint: "install it".into(),
        }
        .into()
    }

    fn empty_response() -> anyhow::Error {
        ProviderError::EmptyResponse.into()
    }

    #[async_trait]
    impl LlmProvider for SuccessProvider {
        async fn complete_stream(
            &self,
            _messages: Vec<Message>,
            on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
        ) -> Result<String> {
            on_chunk(StreamChunk {
                text: "ok".into(),
                finished: true,
            });
            Ok("ok".to_string())
        }
        fn provider_name(&self) -> &str {
            "success"
        }
    }

    struct ErrorProvider(fn() -> anyhow::Error);

    #[async_trait]
    impl LlmProvider for ErrorProvider {
        async fn complete_stream(
            &self,
            _messages: Vec<Message>,
            _on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
        ) -> Result<String> {
            Err((self.0)())
        }
        fn provider_name(&self) -> &str {
            "error"
        }
    }

    #[tokio::test]
    async fn test_primary_success_secondary_not_called() {
        let fb = FallbackProvider::new(
            Arc::new(SuccessProvider),
            Arc::new(ErrorProvider(cli_not_installed)),
        );
        let result = fb.complete_stream(vec![], &mut |_| {}).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "ok");
    }

    #[tokio::test]
    async fn test_cli_not_installed_triggers_fallback() {
        let fb = FallbackProvider::new(
            Arc::new(ErrorProvider(cli_not_installed)),
            Arc::new(SuccessProvider),
        );
        let result = fb.complete_stream(vec![], &mut |_| {}).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "ok");
    }

    #[tokio::test]
    async fn test_both_fail_returns_fallback_exhausted() {
        let fb = FallbackProvider::new(
            Arc::new(ErrorProvider(cli_not_installed)),
            Arc::new(ErrorProvider(cli_not_installed)),
        );
        let err = fb.complete_stream(vec![], &mut |_| {}).await.unwrap_err();
        let pe = err.downcast_ref::<ProviderError>().unwrap();
        assert!(matches!(pe, ProviderError::FallbackExhausted { .. }));
    }

    #[tokio::test]
    async fn test_empty_response_does_not_trigger_fallback() {
        let fb = FallbackProvider::new(
            Arc::new(ErrorProvider(empty_response)),
            Arc::new(SuccessProvider),
        );
        let err = fb.complete_stream(vec![], &mut |_| {}).await.unwrap_err();
        // Should propagate the EmptyResponse error, NOT trigger fallback
        let pe = err.downcast_ref::<ProviderError>().unwrap();
        assert!(matches!(pe, ProviderError::EmptyResponse));
    }

    #[test]
    fn test_is_fallback_worthy() {
        assert!(is_fallback_worthy(&ProviderError::CliNotInstalled {
            name: "x".into(),
            install_hint: "y".into()
        }));
        assert!(is_fallback_worthy(&ProviderError::RateLimited {
            attempts: 3
        }));
        assert!(is_fallback_worthy(&ProviderError::Timeout { secs: 30 }));
        assert!(is_fallback_worthy(&ProviderError::HttpError {
            status: 503,
            body: "".into()
        }));
        assert!(!is_fallback_worthy(&ProviderError::EmptyResponse));
        assert!(!is_fallback_worthy(&ProviderError::MissingApiKey {
            var_name: "X".into()
        }));
        assert!(!is_fallback_worthy(&ProviderError::HttpError {
            status: 400,
            body: "".into()
        }));
    }
}
