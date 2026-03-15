//! Provider error types.
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Missing API key: ${var_name} is not set. Run: export {var_name}=<your-key>")]
    MissingApiKey { var_name: String },

    #[error("CLI tool '{name}' is not installed. {install_hint}")]
    CliNotInstalled { name: String, install_hint: String },

    #[error("CLI session expired. Run: {auth_command}")]
    CliSessionExpired { auth_command: String },

    #[error("Ollama model '{model}' not found. Available: {available}")]
    OllamaModelNotFound { model: String, available: String },

    #[error("Rate limited after {attempts} attempt(s)")]
    RateLimited { attempts: u32 },

    #[error("Request timed out after {secs}s")]
    Timeout { secs: u64 },

    #[error("Empty response from provider")]
    EmptyResponse,

    #[error("Stream interrupted after {bytes} bytes")]
    StreamInterrupted { bytes: usize },

    #[error("Unknown provider '{name}'. Known providers: {known}")]
    UnknownProvider { name: String, known: String },

    #[error("All fallbacks exhausted. Last error: {last_error}")]
    FallbackExhausted { last_error: String },

    #[error("PTY unavailable on this platform")]
    PtyUnavailable,

    #[error("HTTP error {status}: {body}")]
    HttpError { status: u16, body: String },

    #[error("Config error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_missing_api_key_message() {
        let e = ProviderError::MissingApiKey {
            var_name: "TEST_KEY".to_string(),
        };
        let msg = e.to_string();
        assert!(msg.contains("TEST_KEY"));
        assert!(msg.contains("export"));
    }

    #[test]
    fn test_unknown_provider_message() {
        let e = ProviderError::UnknownProvider {
            name: "fancy".to_string(),
            known: "anthropic, ollama".to_string(),
        };
        assert!(e.to_string().contains("fancy"));
        assert!(e.to_string().contains("anthropic"));
    }

    #[test]
    fn test_downcast_roundtrip() {
        let err: anyhow::Error = ProviderError::EmptyResponse.into();
        assert!(err.downcast_ref::<ProviderError>().is_some());
    }

    #[test]
    fn test_cli_session_expired_message() {
        let e = ProviderError::CliSessionExpired {
            auth_command: "claude auth login".to_string(),
        };
        assert!(e.to_string().contains("claude auth login"));
    }
}
