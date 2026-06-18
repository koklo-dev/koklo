//! First-run provider auto-detection and global config precedence.
//!
//! Resolution order:
//!   1. A running Ollama server with the configured model pulled (local, free)
//!   2. A locally-installed agent CLI on `PATH` — `claude` then `codex`
//!      (uses the user's existing subscription, no API key)
//!   3. An API key in the environment / secrets file (e.g. `OPENROUTER_API_KEY`)
//!   4. A provider declared in `~/.koklo/config.toml` (merged config)
//!   5. Interactive prompt — surfaced as [`ProviderDetection::NeedsSelection`]
//!      so the caller can prompt the user or raise
//!      [`crate::ProviderError::NoProviderDetected`].
use crate::config::PipelineTomlConfig;
use crate::secrets::resolve_secret;
use anyhow::Result;
use std::time::Duration;

/// Default Ollama endpoint used when none is configured.
pub const DEFAULT_OLLAMA_URL: &str = "http://127.0.0.1:11434";

/// How long to wait when probing a local Ollama server during detection.
/// Kept short so first-run never hangs when nothing is listening.
const OLLAMA_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// Local agent CLIs that imply a usable provider when present on `PATH`,
/// as `(binary, canonical provider name)` in priority order.
const LOCAL_CLI_PROVIDERS: &[(&str, &str)] = &[("claude", "claude-code"), ("codex", "codex-cli")];

/// Environment variables that imply a usable cloud provider, in priority order.
const ENV_KEY_PROVIDERS: &[(&str, &str)] = &[("OPENROUTER_API_KEY", "openrouter")];

/// Why a provider was selected during auto-detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DetectionSource {
    /// A reachable Ollama server with the configured model pulled.
    Ollama {
        base_url: String,
        models: Vec<String>,
    },
    /// A locally-installed agent CLI found on `PATH`.
    LocalCli { binary: String },
    /// An API key found in the environment or secrets file.
    EnvKey { var_name: String },
    /// A provider declared in the merged TOML config.
    Config,
}

impl DetectionSource {
    /// Human-readable reason, used for log lines and CLI feedback.
    pub fn describe(&self) -> String {
        match self {
            DetectionSource::Ollama { base_url, models } => {
                format!("Ollama at {} ({} model(s))", base_url, models.len())
            }
            DetectionSource::LocalCli { binary } => format!("`{binary}` CLI on PATH"),
            DetectionSource::EnvKey { var_name } => format!("{var_name} in environment"),
            DetectionSource::Config => "~/.koklo/config.toml".to_string(),
        }
    }
}

/// Outcome of provider auto-detection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderDetection {
    /// A provider was auto-detected; `provider` is its canonical name.
    Detected {
        provider: String,
        source: DetectionSource,
    },
    /// Nothing could be detected. The caller should prompt the user
    /// interactively, or surface `ProviderError::NoProviderDetected`.
    NeedsSelection,
}

/// Resolve the Ollama base URL from config → `OLLAMA_BASE_URL` → default.
pub fn ollama_base_url(config: &PipelineTomlConfig) -> String {
    config
        .providers
        .get("ollama")
        .and_then(|entry| entry.base_url.clone())
        .or_else(|| std::env::var("OLLAMA_BASE_URL").ok())
        .unwrap_or_else(|| DEFAULT_OLLAMA_URL.to_string())
}

/// Default Ollama model used when none is configured (mirrors the provider).
pub const DEFAULT_OLLAMA_MODEL: &str = "qwen2.5-coder:7b";

/// Resolve the Ollama model that the provider would actually run, following
/// config → `OLLAMA_MODEL` → default — the same precedence as the provider.
pub fn configured_ollama_model(config: &PipelineTomlConfig) -> String {
    config
        .providers
        .get("ollama")
        .and_then(|entry| entry.model.clone())
        .or_else(|| std::env::var("OLLAMA_MODEL").ok())
        .unwrap_or_else(|| DEFAULT_OLLAMA_MODEL.to_string())
}

/// Whether the model Koklo would run is among the pulled Ollama models.
///
/// Ollama reports tagged names (`qwen2.5-coder:7b`, `llama3:latest`). A bare
/// configured name (`llama3`) matches its `:latest` tag and any `name:tag`
/// variant, so "Ollama is running but the model isn't pulled" is detected
/// instead of picking a provider that would fail on first use.
fn ollama_model_available(available: &[String], wanted: &str) -> bool {
    available.iter().any(|name| {
        name == wanted
            || name == &format!("{wanted}:latest")
            || (!wanted.contains(':') && name.starts_with(&format!("{wanted}:")))
    })
}

/// List local Ollama model names from `<base_url>/api/tags`.
///
/// Returns an error when the server is unreachable or returns a non-success
/// status, so callers can treat "no Ollama" and "empty Ollama" distinctly.
pub async fn list_ollama_models(base_url: &str) -> Result<Vec<String>> {
    let client = reqwest::Client::builder()
        .timeout(OLLAMA_PROBE_TIMEOUT)
        .build()?;
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("Ollama at {} returned status {}", base_url, resp.status());
    }
    let json: serde_json::Value = resp.json().await?;
    Ok(json["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default())
}

/// Pick the provider declared in config: explicit `default_provider`,
/// otherwise the single configured provider when unambiguous.
fn config_provider(config: &PipelineTomlConfig) -> Option<String> {
    if let Some(name) = config.pipeline.default_provider.as_deref() {
        return Some(name.to_string());
    }
    if config.providers.len() == 1 {
        return config.providers.keys().next().cloned();
    }
    None
}

/// Auto-detect a provider following the precedence order.
///
/// Gathers the detection inputs — a reachable Ollama, a local agent CLI on
/// `PATH`, a cloud API key, the merged config — then resolves precedence via
/// the pure [`resolve_detection`] so the ordering is unit-testable without
/// touching process-global env, `PATH`, or the network.
pub async fn detect_provider(config: &PipelineTomlConfig) -> ProviderDetection {
    let base_url = ollama_base_url(config);
    let wanted_model = configured_ollama_model(config);
    let ollama = match list_ollama_models(&base_url).await {
        // Only pick Ollama when the model we'd actually run is pulled; a
        // running-but-empty (or wrong-model) Ollama falls through to a CLI /
        // cloud provider that is ready to use.
        Ok(models) if ollama_model_available(&models, &wanted_model) => Some((base_url, models)),
        _ => None,
    };
    let local_cli = LOCAL_CLI_PROVIDERS
        .iter()
        .find(|(binary, _)| which::which(binary).is_ok())
        .copied();
    let env_key = ENV_KEY_PROVIDERS
        .iter()
        .find(|(var_name, _)| resolve_secret(var_name).is_some())
        .copied();
    resolve_detection(ollama, local_cli, env_key, config)
}

/// Pure precedence resolver: Ollama → local CLI → env key → config → needs-selection.
fn resolve_detection(
    ollama: Option<(String, Vec<String>)>,
    local_cli: Option<(&str, &str)>,
    env_key: Option<(&str, &str)>,
    config: &PipelineTomlConfig,
) -> ProviderDetection {
    // 1. A running Ollama server with at least one pulled model.
    if let Some((base_url, models)) = ollama {
        return ProviderDetection::Detected {
            provider: "ollama".to_string(),
            source: DetectionSource::Ollama { base_url, models },
        };
    }

    // 2. A locally-installed agent CLI (`claude`, then `codex`).
    if let Some((binary, provider)) = local_cli {
        return ProviderDetection::Detected {
            provider: provider.to_string(),
            source: DetectionSource::LocalCli {
                binary: binary.to_string(),
            },
        };
    }

    // 3. A cloud API key in the environment or secrets file.
    if let Some((var_name, provider)) = env_key {
        return ProviderDetection::Detected {
            provider: provider.to_string(),
            source: DetectionSource::EnvKey {
                var_name: var_name.to_string(),
            },
        };
    }

    // 4. A provider declared in the merged TOML config.
    if let Some(provider) = config_provider(config) {
        return ProviderDetection::Detected {
            provider,
            source: DetectionSource::Config,
        };
    }

    // 5. Nothing detected — caller prompts or errors.
    ProviderDetection::NeedsSelection
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ProviderTomlEntry;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const OPENROUTER_ENV: Option<(&str, &str)> = Some(("OPENROUTER_API_KEY", "openrouter"));
    const CLAUDE_CLI: Option<(&str, &str)> = Some(("claude", "claude-code"));
    const CODEX_CLI: Option<(&str, &str)> = Some(("codex", "codex-cli"));

    fn config_with_providers(names: &[&str]) -> PipelineTomlConfig {
        let mut cfg = PipelineTomlConfig::default();
        for name in names {
            cfg.providers
                .insert((*name).to_string(), ProviderTomlEntry::default());
        }
        cfg
    }

    #[test]
    fn ollama_base_url_prefers_config_over_default() {
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "ollama".to_string(),
            ProviderTomlEntry {
                base_url: Some("http://10.0.0.5:11434".to_string()),
                ..Default::default()
            },
        );
        assert_eq!(ollama_base_url(&cfg), "http://10.0.0.5:11434");
    }

    #[test]
    fn ollama_base_url_defaults_when_unset() {
        assert_eq!(
            ollama_base_url(&PipelineTomlConfig::default()),
            DEFAULT_OLLAMA_URL
        );
    }

    #[test]
    fn config_provider_prefers_explicit_default() {
        let mut cfg = config_with_providers(&["ollama", "openrouter"]);
        cfg.pipeline.default_provider = Some("openrouter".to_string());
        assert_eq!(config_provider(&cfg).as_deref(), Some("openrouter"));
    }

    #[test]
    fn config_provider_uses_single_configured_provider() {
        let cfg = config_with_providers(&["claude-code"]);
        assert_eq!(config_provider(&cfg).as_deref(), Some("claude-code"));
    }

    #[test]
    fn config_provider_is_none_when_ambiguous() {
        let cfg = config_with_providers(&["ollama", "openrouter"]);
        assert!(config_provider(&cfg).is_none());
    }

    // --- Pure precedence resolver: deterministic, no env / network. ---

    #[test]
    fn resolve_prefers_ollama_over_local_cli_and_env_key() {
        let cfg = config_with_providers(&["openrouter"]);
        let detection = resolve_detection(
            Some((
                "http://127.0.0.1:11434".to_string(),
                vec!["llama3.2".to_string()],
            )),
            CLAUDE_CLI,
            OPENROUTER_ENV,
            &cfg,
        );
        assert!(matches!(
            detection,
            ProviderDetection::Detected { ref provider, source: DetectionSource::Ollama { .. } }
                if provider == "ollama"
        ));
    }

    #[test]
    fn resolve_prefers_local_cli_over_env_key() {
        let detection = resolve_detection(
            None,
            CLAUDE_CLI,
            OPENROUTER_ENV,
            &PipelineTomlConfig::default(),
        );
        assert!(matches!(
            detection,
            ProviderDetection::Detected {
                ref provider,
                source: DetectionSource::LocalCli { ref binary },
            } if provider == "claude-code" && binary == "claude"
        ));
    }

    #[test]
    fn resolve_uses_codex_local_cli() {
        let detection = resolve_detection(None, CODEX_CLI, None, &PipelineTomlConfig::default());
        assert!(matches!(
            detection,
            ProviderDetection::Detected {
                ref provider,
                source: DetectionSource::LocalCli { ref binary },
            } if provider == "codex-cli" && binary == "codex"
        ));
    }

    #[test]
    fn resolve_uses_env_key_when_ollama_and_cli_absent() {
        let detection =
            resolve_detection(None, None, OPENROUTER_ENV, &PipelineTomlConfig::default());
        assert!(matches!(
            detection,
            ProviderDetection::Detected {
                ref provider,
                source: DetectionSource::EnvKey { ref var_name },
            } if provider == "openrouter" && var_name == "OPENROUTER_API_KEY"
        ));
    }

    #[test]
    fn resolve_falls_through_to_config_when_no_ollama_cli_or_env_key() {
        let mut cfg = config_with_providers(&["ollama"]);
        cfg.pipeline.default_provider = Some("claude-code".to_string());
        let detection = resolve_detection(None, None, None, &cfg);
        assert!(matches!(
            detection,
            ProviderDetection::Detected { ref provider, source: DetectionSource::Config }
                if provider == "claude-code"
        ));
    }

    #[test]
    fn resolve_needs_selection_when_nothing_detected() {
        // Two providers, no explicit default → config step is ambiguous.
        let cfg = config_with_providers(&["ollama", "openrouter"]);
        assert_eq!(
            resolve_detection(None, None, None, &cfg),
            ProviderDetection::NeedsSelection
        );
    }

    // --- Ollama model listing (AC #2), over a mock HTTP server. ---

    #[tokio::test]
    async fn list_ollama_models_parses_tags() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(
                ResponseTemplate::new(200).set_body_string(
                    r#"{"models":[{"name":"llama3.2"},{"name":"qwen2.5-coder:7b"}]}"#,
                ),
            )
            .mount(&server)
            .await;

        let models = list_ollama_models(&server.uri()).await.unwrap();
        assert_eq!(models, vec!["llama3.2", "qwen2.5-coder:7b"]);
    }

    #[tokio::test]
    async fn list_ollama_models_errors_when_unreachable() {
        assert!(list_ollama_models("http://127.0.0.1:1").await.is_err());
    }

    #[test]
    fn ollama_model_available_matches_exact_and_latest_and_tagged() {
        let pulled = vec!["qwen2.5-coder:7b".to_string(), "llama3:latest".to_string()];
        // Exact tagged match.
        assert!(ollama_model_available(&pulled, "qwen2.5-coder:7b"));
        // Bare name matches its `:latest` tag.
        assert!(ollama_model_available(&pulled, "llama3"));
        // Bare name matches any `name:tag` variant.
        assert!(ollama_model_available(
            &["qwen2.5-coder:7b".to_string()],
            "qwen2.5-coder"
        ));
        // Not pulled.
        assert!(!ollama_model_available(&pulled, "mistral"));
        assert!(!ollama_model_available(&[], "qwen2.5-coder:7b"));
    }

    #[tokio::test]
    async fn detect_provider_returns_ollama_when_configured_model_is_pulled() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(
                ResponseTemplate::new(200).set_body_string(
                    r#"{"models":[{"name":"qwen2.5-coder:7b"},{"name":"llama3.2"}]}"#,
                ),
            )
            .mount(&server)
            .await;

        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "ollama".to_string(),
            ProviderTomlEntry {
                base_url: Some(server.uri()),
                ..Default::default()
            },
        );

        let detection = detect_provider(&cfg).await;
        assert!(matches!(
            detection,
            ProviderDetection::Detected { ref provider, source: DetectionSource::Ollama { .. } }
                if provider == "ollama"
        ));
    }

    #[tokio::test]
    async fn detect_provider_skips_ollama_when_configured_model_not_pulled() {
        // Ollama is running but only has an unrelated model — the model Koklo
        // would run (`qwen2.5-coder:7b` by default) is absent, so Ollama must
        // NOT be selected. What it falls through to (local CLI, env key, config,
        // or needs-selection) depends on the host, so assert only that Ollama
        // was skipped — that is the behaviour under test.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(
                ResponseTemplate::new(200).set_body_string(r#"{"models":[{"name":"llava:7b"}]}"#),
            )
            .mount(&server)
            .await;

        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "ollama".to_string(),
            ProviderTomlEntry {
                base_url: Some(server.uri()),
                ..Default::default()
            },
        );

        let detection = detect_provider(&cfg).await;
        assert!(
            !matches!(
                detection,
                ProviderDetection::Detected {
                    source: DetectionSource::Ollama { .. },
                    ..
                }
            ),
            "Ollama must not be selected when its configured model is not pulled, got {detection:?}"
        );
    }
}
