//! Provider error types.
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Missing API key: ${var_name} is not set. Run `export {var_name}=...` or add it to $KOKLO_HOME/secrets.toml under [env].")]
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

    #[error(
        "No LLM provider could be auto-detected.\n\n\
         Koklo looked for, in order:\n\
         \x20 1. A running Ollama server at {ollama_url} — not reachable\n\
         \x20 2. A cloud API key in the environment (OPENROUTER_API_KEY) — not set\n\
         \x20 3. A provider in ~/.koklo/config.toml — none usable\n\n\
         To get started, pick one:\n\
         \x20 • Local (free):  run `ollama serve`, then `ollama pull llama3.2`\n\
         \x20 • Cloud:         export OPENROUTER_API_KEY=sk-or-...\n\
         \x20 • Configure:     run `koklo provider add <name>`"
    )]
    NoProviderDetected { ollama_url: String },

    #[error("All fallbacks exhausted. Last error: {last_error}")]
    FallbackExhausted { last_error: String },

    #[error("PTY unavailable on this platform")]
    PtyUnavailable,

    #[error("HTTP error {status}: {body}")]
    HttpError { status: u16, body: String },

    #[error("Config error: {0}")]
    Config(String),

    #[error("Sandbox error: {0}")]
    Sandbox(String),

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
    fn test_no_provider_detected_is_actionable() {
        let e = ProviderError::NoProviderDetected {
            ollama_url: "http://127.0.0.1:11434".to_string(),
        };
        let msg = e.to_string();
        // Names every detection source and a concrete remediation for each.
        assert!(msg.contains("http://127.0.0.1:11434"));
        assert!(msg.contains("OPENROUTER_API_KEY"));
        assert!(msg.contains("config.toml"));
        assert!(msg.contains("ollama serve"));
        assert!(msg.contains("koklo provider add"));
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
