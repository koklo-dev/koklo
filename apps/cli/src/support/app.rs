use anyhow::Result;
use koklo_providers::{
    resolve_secret, LlmProvider, OllamaProvider, OpenRouterProvider, PipelineTomlConfig,
    ProviderRegistry,
};
use koklo_workflow_engine::{
    presets::PresetKind, GateHandler, GithubConfig, PipelineConfig, PipelineOrchestrator,
    PipelineUserInputHandler,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use super::home;

pub(crate) fn canonical_provider_name(name: &str) -> &str {
    match name {
        "codex" => "codex-cli",
        "claude-code-cli" => "claude-code",
        other => other,
    }
}

pub(crate) fn provider_name_candidates(name: &str) -> Vec<&str> {
    let canonical = canonical_provider_name(name);
    match canonical {
        "codex-cli" => vec!["codex-cli", "codex"],
        "claude-code" => vec!["claude-code", "claude-code-cli"],
        other => vec![other],
    }
}

pub(crate) fn normalize_pipeline_config(config: &mut PipelineTomlConfig) {
    config.pipeline.default_provider = config
        .pipeline
        .default_provider
        .as_deref()
        .map(canonical_provider_name)
        .map(str::to_string);

    for agent in config.agents.values_mut() {
        agent.provider = agent
            .provider
            .as_deref()
            .map(canonical_provider_name)
            .map(str::to_string);
    }

    let mut normalized = std::collections::HashMap::new();
    for (name, entry) in std::mem::take(&mut config.providers) {
        let canonical = canonical_provider_name(&name).to_string();
        normalized.entry(canonical).or_insert(entry);
    }
    config.providers = normalized;
}

/// Walk up from `cwd` to find the directory containing `.koklo/`.
/// Falls back to `cwd` if not found.
pub(crate) fn find_project_root() -> Result<PathBuf> {
    let mut dir = std::env::current_dir()?;
    loop {
        if dir.join(".koklo").exists() {
            return Ok(dir);
        }
        if !dir.pop() {
            return Ok(std::env::current_dir()?);
        }
    }
}

/// Select the default provider.
///
/// Priority:
/// 0. `toml_default` field from merged config (highest priority)
/// 1. `KOKLO_PROVIDER` env var → registry lookup
/// 2. `OPENROUTER_API_KEY` set → openrouter
/// 3. OllamaProvider (fallback)
pub(crate) fn determine_default_provider(
    registry: &ProviderRegistry,
    toml_default: Option<&str>,
) -> Result<Arc<dyn LlmProvider>> {
    if let Some(name) = toml_default {
        if let Some(p) = registry.get(name) {
            tracing::info!(
                "Default provider: '{}' (from config default_provider)",
                name
            );
            return Ok(p);
        }
        tracing::warn!(
            "Config default_provider='{}' not in registry, falling back",
            name
        );
    }

    if let Ok(name) = std::env::var("KOKLO_PROVIDER") {
        if let Some(p) = registry.get(&name) {
            tracing::info!("Default provider: '{}' (from KOKLO_PROVIDER)", name);
            return Ok(p);
        }
        tracing::warn!("KOKLO_PROVIDER='{}' not in registry, falling back", name);
    }

    if let Some(api_key) = resolve_secret("OPENROUTER_API_KEY") {
        let p: Arc<dyn LlmProvider> = match registry.get("openrouter") {
            Some(p) => p,
            None => Arc::new(OpenRouterProvider::new(
                api_key,
                "openai/gpt-4o".to_string(),
                None,
            )),
        };
        tracing::info!("Default provider: openrouter (OPENROUTER_API_KEY)");
        return Ok(p);
    }

    let p: Arc<dyn LlmProvider> = match registry.get("ollama") {
        Some(p) => p,
        None => Arc::new(OllamaProvider::from_env()),
    };
    tracing::info!("Default provider: ollama (fallback)");
    Ok(p)
}

pub(crate) async fn build_orchestrator(
    project_root_override: Option<PathBuf>,
    preset_override: Option<PresetKind>,
) -> Result<PipelineOrchestrator> {
    let config = build_pipeline_config(project_root_override, preset_override)?;
    PipelineOrchestrator::new(config).await
}

pub(crate) async fn build_orchestrator_with_gate(
    project_root_override: Option<PathBuf>,
    preset_override: Option<PresetKind>,
    gate_handler: Arc<dyn GateHandler>,
    user_input_handler: Arc<dyn PipelineUserInputHandler>,
) -> Result<PipelineOrchestrator> {
    let config = build_pipeline_config(project_root_override, preset_override)?;
    PipelineOrchestrator::new_with_handlers(config, gate_handler, user_input_handler).await
}

pub(crate) async fn open_storage() -> Result<koklo_storage::SessionManager> {
    let db_path = home::koklo_db_path();
    koklo_storage::SessionManager::open(&db_path).await
}

pub(crate) fn agents_dir() -> PathBuf {
    home::koklo_home().join("agents")
}

pub(crate) fn load_writable_config(project: bool) -> Result<(PathBuf, PipelineTomlConfig)> {
    if project {
        let project_root = find_project_root()?;
        let path = project_root.join(".koklo").join("pipeline.toml");
        let mut config = PipelineTomlConfig::load_from_project_root(&project_root)?;
        normalize_pipeline_config(&mut config);
        Ok((path, config))
    } else {
        let path = home::koklo_home().join("config.toml");
        let mut config = home::load_global_config();
        normalize_pipeline_config(&mut config);
        Ok((path, config))
    }
}

pub(crate) fn write_config(path: &PathBuf, config: &PipelineTomlConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let toml_str = toml::to_string_pretty(config)
        .map_err(|e| anyhow::anyhow!("Failed to serialize config: {}", e))?;
    std::fs::write(path, toml_str)?;
    Ok(())
}

fn build_pipeline_config(
    project_root_override: Option<PathBuf>,
    preset_override: Option<PresetKind>,
) -> Result<PipelineConfig> {
    let project_root = match project_root_override {
        Some(path) => path,
        None => find_project_root()?,
    };
    tracing::debug!("Project root: {}", project_root.display());

    let global = home::load_global_config();
    let project = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let merged = global.merge(project);

    let registry = Arc::new(ProviderRegistry::build(&merged)?);

    let mut agent_providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
    let mut agent_sandboxes: HashMap<String, String> = HashMap::new();
    for (agent_name, agent_cfg) in &merged.agents {
        if let Some(ref provider_name) = agent_cfg.provider {
            if let Some(p) = registry.get(provider_name) {
                agent_providers.insert(agent_name.clone(), p);
            }
        }
        if let Some(ref sandbox_name) = agent_cfg.sandbox {
            agent_sandboxes.insert(agent_name.clone(), sandbox_name.clone());
        }
    }

    let default_provider =
        determine_default_provider(&registry, merged.pipeline.default_provider.as_deref())?;

    let preset = preset_override.unwrap_or_else(|| {
        merged
            .workflow
            .preset
            .as_deref()
            .and_then(PresetKind::parse)
            .unwrap_or_default()
    });

    let global_home = home::koklo_home();
    let project_context_dir = project_root.join(".koklo");
    let project_context = if project_context_dir.exists() {
        Some(project_context_dir)
    } else {
        None
    };

    Ok(PipelineConfig {
        db_path: home::koklo_db_path(),
        artifacts_dir: PathBuf::from(
            merged
                .pipeline
                .artifacts_dir
                .as_deref()
                .unwrap_or("docs/planning_artifacts"),
        ),
        global_home,
        project_context,
        project_path: project_root.to_string_lossy().into_owned(),
        preset,
        default_provider,
        agent_providers,
        provider_entries: merged.providers.clone(),
        agent_sandboxes,
        controlled_shell: std::env::var("KOKLO_CONTROLLED_SHELL")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false),
        provider_registry: registry,
        github: GithubConfig::from_env(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use koklo_providers::ProviderTomlEntry;

    #[test]
    fn canonical_provider_aliases_map_to_canonical_names() {
        assert_eq!(canonical_provider_name("codex"), "codex-cli");
        assert_eq!(canonical_provider_name("codex-cli"), "codex-cli");
        assert_eq!(canonical_provider_name("claude-code-cli"), "claude-code");
        assert_eq!(canonical_provider_name("openrouter"), "openrouter");
    }

    #[test]
    fn normalize_pipeline_config_rewrites_provider_keys_and_defaults() {
        let mut config = PipelineTomlConfig::default();
        config.pipeline.default_provider = Some("codex-cli".to_string());
        config
            .providers
            .insert("codex-cli".to_string(), ProviderTomlEntry::default());
        config.agents.insert(
            "developer".to_string(),
            koklo_providers::AgentTomlConfig {
                provider: Some("claude-code-cli".to_string()),
                ..Default::default()
            },
        );

        normalize_pipeline_config(&mut config);

        assert_eq!(
            config.pipeline.default_provider.as_deref(),
            Some("codex-cli")
        );
        assert!(config.providers.contains_key("codex-cli"));
        assert!(!config.providers.contains_key("codex"));
        assert_eq!(
            config
                .agents
                .get("developer")
                .and_then(|agent| agent.provider.as_deref()),
            Some("claude-code")
        );
    }
}
