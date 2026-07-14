//! Pipeline configuration resolution for desktop runs: project-root validation,
//! provider selection, and the `~/.koklo` home/database paths. Extracted from
//! [`crate::runtime`] (§9 file-size ceiling).

use crate::sessions::RunSpec;
use anyhow::{anyhow, Result};
use koklo_providers::registry::build_provider;
use koklo_providers::{
    detect_provider, LlmProvider, PipelineTomlConfig, ProviderDetection, ProviderRegistry,
    ProviderTomlEntry,
};
use koklo_workflow_engine::{GithubConfig, PipelineConfig};
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub(crate) async fn pipeline_config(spec: &RunSpec) -> Result<PipelineConfig> {
    let project_root = validated_project_root(&spec.project_path)?;
    let global_home = koklo_home();
    let global = PipelineTomlConfig::load_from_path(&global_home.join("config.toml"))?;
    let project = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let merged = global.merge(project);
    let registry = Arc::new(ProviderRegistry::build(&merged)?);
    let default_provider = resolve_provider(&merged, &registry).await?;
    let agent_providers = merged
        .agents
        .iter()
        .filter_map(|(name, config)| {
            config
                .provider
                .as_deref()
                .and_then(|provider| registry.get(provider))
                .map(|provider| (name.clone(), provider))
        })
        .collect();
    let agent_sandboxes = merged
        .agents
        .iter()
        .filter_map(|(name, config)| {
            config
                .sandbox
                .as_ref()
                .map(|sandbox| (name.clone(), sandbox.clone()))
        })
        .collect();

    Ok(PipelineConfig {
        db_path: database_path(),
        artifacts_dir: PathBuf::from(
            merged
                .pipeline
                .artifacts_dir
                .as_deref()
                .unwrap_or("docs/planning_artifacts"),
        ),
        global_home,
        project_context: project_root
            .join(".koklo")
            .is_dir()
            .then(|| project_root.join(".koklo")),
        project_path: spec.project_path.clone(),
        preset: spec.preset,
        default_provider,
        agent_providers,
        provider_entries: merged.providers,
        agent_sandboxes,
        controlled_shell: env_flag("KOKLO_CONTROLLED_SHELL"),
        provider_registry: registry,
        github: GithubConfig::from_env(),
    })
}

async fn resolve_provider(
    config: &PipelineTomlConfig,
    registry: &ProviderRegistry,
) -> Result<Arc<dyn LlmProvider>> {
    if let Some(name) = std::env::var("KOKLO_PROVIDER")
        .ok()
        .or_else(|| config.pipeline.default_provider.clone())
    {
        return registry.get(&name).ok_or_else(|| {
            anyhow!("provider `{name}` is configured but unavailable; check credentials and binary installation")
        });
    }
    if let ProviderDetection::Detected { provider, .. } = detect_provider(config).await {
        if let Some(instance) = registry.get(&provider) {
            return Ok(instance);
        }
        return build_provider(&provider, &ProviderTomlEntry::default()).map_err(Into::into);
    }
    Err(anyhow!(
        "no provider detected; configure KOKLO_PROVIDER, a local Claude/Codex CLI, Ollama, or OpenRouter"
    ))
}

/// Resolve the run's project root, refusing anything relative: a relative path
/// resolves against the Tauri process cwd (`src-tauri` under `tauri dev`), where
/// pipeline artifact writes trip the dev watcher and restart the whole app the
/// moment a phase gate opens.
fn validated_project_root(path: &str) -> Result<PathBuf> {
    let root = PathBuf::from(path);
    if path.trim().is_empty() || !root.is_absolute() {
        return Err(anyhow!(
            "projectPath `{path}` must be an absolute path — a relative path would target the app's own working directory, not your project"
        ));
    }
    if !root.is_dir() {
        return Err(anyhow!("projectPath `{path}` is not an existing directory"));
    }
    Ok(root)
}

pub(crate) fn koklo_home() -> PathBuf {
    std::env::var("KOKLO_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| Path::new(".").to_path_buf())
                .join(".koklo")
        })
}

pub(crate) fn database_path() -> String {
    std::env::var("KOKLO_DB_PATH")
        .unwrap_or_else(|_| koklo_home().join("koklo.db").to_string_lossy().into_owned())
}

fn env_flag(name: &str) -> bool {
    std::env::var(name)
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validated_project_root_rejects_relative_paths() {
        for relative in [".", "sub/dir", "../elsewhere", ""] {
            let error = validated_project_root(relative)
                .expect_err("a relative projectPath must be refused");
            assert!(
                error.to_string().contains("absolute"),
                "error for `{relative}` should explain the absolute-path requirement, got: {error}"
            );
        }
    }

    #[test]
    fn validated_project_root_rejects_a_missing_directory() {
        let error = validated_project_root("/nonexistent/koklo-test-dir")
            .expect_err("a missing directory must be refused");
        assert!(error.to_string().contains("existing directory"));
    }

    #[test]
    fn validated_project_root_accepts_an_absolute_directory() {
        let dir = std::env::temp_dir();
        let root = validated_project_root(&dir.to_string_lossy()).unwrap();
        assert_eq!(root, dir);
    }
}
