//! Provider registry: builds and looks up Arc<dyn LlmProvider> by name.
use crate::cli::claude_code::ClaudeCodeCliProvider;
use crate::cli::codex::CodexCliProvider;
use crate::config::{PipelineTomlConfig, ProviderTomlEntry};
use crate::error::ProviderError;
use crate::ollama::OllamaProvider;
use crate::openrouter::OpenRouterProvider;
use crate::LlmProvider;
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;

const KNOWN_NAMES: &[&str] = &["openrouter", "ollama", "claude-code", "codex-cli"];

fn canonical_provider_name(name: &str) -> &str {
    match name {
        "codex" => "codex-cli",
        "claude-code-cli" => "claude-code",
        other => other,
    }
}

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
    /// - Warns and skips providers with unknown names (allows old configs to keep working).
    /// - Warns and skips providers that cannot be created (missing key, CLI absent).
    /// - Fails if an agent's `provider` field references a provider that didn't build.
    pub fn build(config: &PipelineTomlConfig) -> Result<Self> {
        // Build providers, warn and skip failures or unknown names
        let mut providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
        for (name, entry) in &config.providers {
            let canonical = canonical_provider_name(name);
            if !KNOWN_NAMES.contains(&canonical) {
                tracing::warn!(
                    "Provider '{}' is not supported (known: {}), skipping",
                    name,
                    KNOWN_NAMES.join(", ")
                );
                continue;
            }
            match build_provider(canonical, entry) {
                Ok(p) => {
                    providers.insert(canonical.to_string(), p);
                }
                Err(e) => {
                    tracing::warn!("Provider '{}' unavailable: {}", name, e);
                }
            }
        }

        // Cross-check: every agent that specifies a provider must have it available
        for (agent_name, agent_cfg) in &config.agents {
            if let Some(ref provider_name) = agent_cfg.provider {
                let canonical = canonical_provider_name(provider_name);
                if !providers.contains_key(canonical) {
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
        self.providers.get(canonical_provider_name(name)).cloned()
    }

    /// Return an iterator over all available (name, provider) pairs.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &Arc<dyn LlmProvider>)> {
        self.providers.iter().map(|(k, v)| (k.as_str(), v))
    }
}

pub fn build_provider(
    name: &str,
    entry: &ProviderTomlEntry,
) -> Result<Arc<dyn LlmProvider>, ProviderError> {
    match canonical_provider_name(name) {
        "openrouter" => Ok(Arc::new(OpenRouterProvider::from_config(entry)?)),
        "ollama" => Ok(Arc::new(OllamaProvider::from_config(entry)?)),
        "claude-code" => Ok(Arc::new(ClaudeCodeCliProvider::from_config(entry)?)),
        "codex-cli" => Ok(Arc::new(CodexCliProvider::from_config(entry)?)),
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
    use crate::{Message, ProviderCapabilities, ProviderSession, StreamChunk};
    use async_trait::async_trait;
    use koklo_events::CompletionUsage;
    use std::collections::HashMap;
    use std::sync::Arc;

    struct DummyProvider;

    #[async_trait]
    impl LlmProvider for DummyProvider {
        async fn complete_stream(
            &self,
            _messages: Vec<Message>,
            _on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
        ) -> Result<(String, CompletionUsage)> {
            Ok((String::new(), CompletionUsage::default()))
        }

        async fn start_session(
            self: Arc<Self>,
            _messages: Vec<Message>,
        ) -> Result<Box<dyn ProviderSession>>
        where
            Self: 'static,
        {
            anyhow::bail!("dummy provider does not start sessions")
        }

        fn capabilities(&self) -> ProviderCapabilities {
            ProviderCapabilities::default()
        }

        fn provider_name(&self) -> &str {
            "dummy"
        }
    }

    #[test]
    fn test_unknown_provider_name_is_skipped_with_warning() {
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers
            .insert("fancy-llm".to_string(), ProviderTomlEntry::default());
        // Should succeed (warn and skip), not fail
        let registry = ProviderRegistry::build(&cfg).unwrap();
        // Unknown provider is simply absent from the registry
        assert!(registry.get("fancy-llm").is_none());
    }

    #[test]
    fn test_known_name_with_key_resolves() {
        let unique_var = "KOKLO_TEST_REG_OPENROUTER_KEY_XYZ123";
        std::env::set_var(unique_var, "sk-or-test-registry");
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "openrouter".to_string(),
            ProviderTomlEntry {
                api_key_env: Some(unique_var.to_string()),
                ..Default::default()
            },
        );
        let registry = ProviderRegistry::build(&cfg).unwrap();
        assert!(registry.get("openrouter").is_some());
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
        // openrouter key NOT set, so it won't build
        std::env::remove_var("OPENROUTER_API_KEY");
        let mut cfg = PipelineTomlConfig::default();
        cfg.providers.insert(
            "openrouter".to_string(),
            ProviderTomlEntry {
                api_key_env: Some("OPENROUTER_API_KEY".to_string()),
                ..Default::default()
            },
        );
        cfg.agents.insert(
            "developer".to_string(),
            AgentTomlConfig {
                provider: Some("openrouter".to_string()),
                ..Default::default()
            },
        );
        let result = ProviderRegistry::build(&cfg);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("developer"));
        assert!(msg.contains("openrouter"));
    }

    #[test]
    fn test_empty_config_builds_empty_registry() {
        let cfg = PipelineTomlConfig::default();
        let registry = ProviderRegistry::build(&cfg).unwrap();
        assert!(registry.get("openrouter").is_none());
    }

    #[test]
    fn test_codex_cli_alias_resolves_to_codex_provider() {
        let mut providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
        providers.insert("codex-cli".to_string(), Arc::new(DummyProvider));
        let registry = ProviderRegistry { providers };
        assert!(registry.get("codex-cli").is_some());
        assert!(registry.get("codex").is_some());
    }

    #[test]
    fn test_claude_code_cli_alias_resolves_to_claude_provider() {
        let mut providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
        providers.insert("claude-code".to_string(), Arc::new(DummyProvider));
        let registry = ProviderRegistry { providers };
        assert!(registry.get("claude-code").is_some());
        assert!(registry.get("claude-code-cli").is_some());
    }
}
