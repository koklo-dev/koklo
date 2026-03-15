//! Provider registry: builds and looks up Arc<dyn LlmProvider> by name.
use crate::anthropic::AnthropicProvider;
use crate::cli::claude_code::ClaudeCodeCliProvider;
use crate::cli::codex::CodexCliProvider;
use crate::config::{PipelineTomlConfig, ProviderTomlEntry};
use crate::error::ProviderError;
use crate::mistral::MistralProvider;
use crate::ollama::OllamaProvider;
use crate::openai::OpenAIProvider;
use crate::LlmProvider;
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;

const KNOWN_NAMES: &[&str] = &[
    "anthropic",
    "openai",
    "mistral",
    "ollama",
    "claude-code",
    "codex",
];

pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn LlmProvider>>,
}

impl std::fmt::Debug for ProviderRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderRegistry")
            .field("providers", &self.providers.keys().collect::<Vec<_>>())
            .finish()
    }
}

impl ProviderRegistry {
    /// Build the registry from TOML config.
    ///
    /// - Fails if an unknown provider name appears in `[providers.*]`.
    /// - Warns and skips providers that cannot be created (missing key, CLI absent).
    /// - Fails if an agent's `provider` field references a provider that didn't build.
    pub fn build(config: &PipelineTomlConfig) -> Result<Self> {
        // Validate all provider names first
        for name in config.providers.keys() {
            if !KNOWN_NAMES.contains(&name.as_str()) {
                return Err(ProviderError::UnknownProvider {
                    name: name.clone(),
                    known: KNOWN_NAMES.join(", "),
                }
                .into());
            }
        }

        // Build providers, warn and skip failures
        let mut providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
        for (name, entry) in &config.providers {
            match build_one(name, entry) {
                Ok(p) => {
                    providers.insert(name.clone(), p);
                }
                Err(e) => {
                    tracing::warn!("Provider '{}' unavailable: {}", name, e);
                }
            }
        }

        // Cross-check: every agent that specifies a provider must have it available
        for (agent_name, agent_cfg) in &config.agents {
            if let Some(ref provider_name) = agent_cfg.provider {
                if !providers.contains_key(provider_name.as_str()) {
                    return Err(ProviderError::Config(format!(
                        "Agent '{}' references provider '{}' which is not available. \
                         Check that the provider is configured and its credentials are set.",
                        agent_name, provider_name
                    ))
                    .into());
                }
            }
        }

        Ok(Self { providers })
    }

    /// Look up a provider by name. Returns `None` if unknown or unavailable.
    ///
    /// Callers should log a warning and fall back to the default when `None` is returned.
    pub fn get(&self, name: &str) -> Option<Arc<dyn LlmProvider>> {
        self.providers.get(name).cloned()
    }

    /// Return an iterator over all available (name, provider) pairs.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &Arc<dyn LlmProvider>)> {
        self.providers.iter().map(|(k, v)| (k.as_str(), v))
    }
}

fn build_one(name: &str, entry: &ProviderTomlEntry) -> Result<Arc<dyn LlmProvider>, ProviderError> {
    match name {
        "anthropic" => Ok(Arc::new(AnthropicProvider::from_config(entry)?)),
        "openai" => Ok(Arc::new(OpenAIProvider::from_config(entry)?)),
        "mistral" => Ok(Arc::new(MistralProvider::from_config(entry)?)),
        "ollama" => Ok(Arc::new(OllamaProvider::from_config(entry)?)),
        "claude-code" => Ok(Arc::new(ClaudeCodeCliProvider::from_config(entry)?)),
        "codex" => Ok(Arc::new(CodexCliProvider::from_config(entry)?)),
        _ => Err(ProviderError::UnknownProvider {
            name: name.to_string(),
            known: KNOWN_NAMES.join(", "),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AgentTomlConfig, PipelineTomlConfig, ProviderTomlEntry};

    fn make_toml_with_anthropic(key_set: bool) -> PipelineTomlConfig {
        if key_set {
            std::env::set_var("ANTHROPIC_API_KEY", "sk-test");
        } else {
            std::env::remove_var("ANTHROPIC_API_KEY");
        }
        let mut providers = HashMap::new();
        providers.insert(
            "anthropic".to_string(),
            ProviderTomlEntry {
                api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
                ..Default::default()
            },
        );
        PipelineTomlConfig {
            providers,
            ..Default::default()
        }
    }

    #[test]
    fn test_unknown_provider_name_fails_at_build() {
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers
            .insert("fancy-llm".to_string(), ProviderTomlEntry::default());
        let result = ProviderRegistry::build(&cfg);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("fancy-llm"));
    }

    #[test]
    fn test_known_name_with_key_resolves() {
        // Use a test-scoped env var to avoid racing with other tests
        let unique_var = "KOKLO_TEST_REG_ANTHROPIC_KEY_XYZ123";
        std::env::set_var(unique_var, "sk-test-registry");
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "anthropic".to_string(),
            ProviderTomlEntry {
                api_key_env: Some(unique_var.to_string()),
                ..Default::default()
            },
        );
        let registry = ProviderRegistry::build(&cfg).unwrap();
        assert!(registry.get("anthropic").is_some());
        std::env::remove_var(unique_var);
    }

    #[test]
    fn test_get_unknown_returns_none() {
        let cfg = PipelineTomlConfig::default();
        let registry = ProviderRegistry::build(&cfg).unwrap();
        assert!(registry.get("nonexistent").is_none());
    }

    #[test]
    fn test_agent_references_unavailable_provider_fails() {
        // anthropic key NOT set, so it won't build
        std::env::remove_var("ANTHROPIC_API_KEY");
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "anthropic".to_string(),
            ProviderTomlEntry {
                api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
                ..Default::default()
            },
        );
        cfg.agents.insert(
            "developer".to_string(),
            AgentTomlConfig {
                provider: Some("anthropic".to_string()),
                ..Default::default()
            },
        );
        let result = ProviderRegistry::build(&cfg);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("developer"));
        assert!(msg.contains("anthropic"));
    }

    #[test]
    fn test_empty_config_builds_empty_registry() {
        let cfg = PipelineTomlConfig::default();
        let registry = ProviderRegistry::build(&cfg).unwrap();
        assert!(registry.get("anthropic").is_none());
    }
}
