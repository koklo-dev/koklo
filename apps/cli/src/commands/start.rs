//! `koklo start` — guided first-run flow (US-007).
//!
//! One zero-to-artifact path: detect context, ensure a light-preset config,
//! resolve a provider (US-006), run the light pipeline, surface the artifact.
//! API keys land in the *global* secrets file, never the repo.

use anyhow::Result;
use koklo_providers::{
    detect_provider, ollama_base_url, secrets_path, PipelineTomlConfig, ProviderDetection,
    ProviderError,
};
use koklo_workflow_engine::{
    presets::PresetKind, AutoApproveGateHandler, GateHandler, PipelineUserInputHandler,
    StdinUserInputHandler,
};
use std::io::{IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::init::write_default_pipeline_toml;
use crate::{build_orchestrator_with_gate, find_project_root, home_dirs, open_storage};

/// Default first-run work item when the user does not supply one.
const DEFAULT_FIRST_RUN_TITLE: &str = "Describe this project and produce an initial spec";

/// Detected facts about the directory `koklo start` was launched in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProjectContext {
    pub(crate) root: PathBuf,
    /// `.koklo/pipeline.toml` already exists — do not clobber it.
    pub(crate) has_existing_config: bool,
    /// Human-readable stack label for the context summary.
    pub(crate) stack: &'static str,
    pub(crate) is_git: bool,
}

/// Inspect `dir` and report the first-run context (pure, filesystem-only).
pub(crate) fn detect_project_context(dir: &Path) -> ProjectContext {
    ProjectContext {
        root: dir.to_path_buf(),
        has_existing_config: dir.join(".koklo").join("pipeline.toml").exists(),
        stack: detect_stack_label(dir),
        is_git: dir.join(".git").exists(),
    }
}

fn detect_stack_label(dir: &Path) -> &'static str {
    if dir.join("Cargo.toml").exists() {
        "Rust"
    } else if dir.join("package.json").exists() {
        "Node"
    } else if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        "Python"
    } else if dir.join("go.mod").exists() {
        "Go"
    } else {
        "unknown"
    }
}

/// The preset a first run always uses (AC#2).
pub(crate) fn first_run_preset() -> PresetKind {
    PresetKind::Light
}

/// Where first-run API keys are persisted: always the global secrets file,
/// never the project tree (AC#3).
pub(crate) fn key_storage_path() -> PathBuf {
    secrets_path()
}

/// Final user-facing message; always names the generated artifact path (AC#4).
pub(crate) fn success_message(session_id: &str, artifact_path: Option<&str>) -> String {
    let mut out = format!("\n✓ Done — session {session_id}\n");
    match artifact_path {
        Some(path) => out.push_str(&format!("  Spec: {path}\n")),
        None => out.push_str(&format!(
            "  Artifacts: run `koklo artifacts list {session_id}`\n"
        )),
    }
    out.push_str("  Next: koklo run feature \"your next idea\"\n");
    out
}

pub(crate) async fn cmd_start(yes: bool, title: Option<String>) -> Result<()> {
    println!("Koklo first-run setup\n");
    home_dirs::ensure_home()?;

    let cwd = std::env::current_dir()?;
    let ctx = detect_project_context(&cwd);
    println!(
        "1/4  Project   {}  ({}{})",
        ctx.root.display(),
        ctx.stack,
        if ctx.is_git { " · git" } else { "" }
    );

    let preset = first_run_preset();
    ensure_project_config(&ctx, preset)?;
    println!(
        "2/4  Preset    {} ({})",
        preset.as_str(),
        if ctx.has_existing_config {
            "existing config"
        } else {
            "first run"
        }
    );

    ensure_provider(yes).await?;

    println!("4/4  Pipeline  running light pipeline…\n");
    let session_id = run_light_pipeline(&resolve_title(title), preset).await?;
    let artifact = first_artifact_path(&session_id).await;
    print!("{}", success_message(&session_id, artifact.as_deref()));
    Ok(())
}

/// Write a light-preset `.koklo/pipeline.toml` on first run; never overwrite an
/// existing one.
fn ensure_project_config(ctx: &ProjectContext, preset: PresetKind) -> Result<()> {
    if ctx.has_existing_config {
        return Ok(());
    }
    let koklo_dir = ctx.root.join(".koklo");
    std::fs::create_dir_all(&koklo_dir)?;
    write_default_pipeline_toml(&koklo_dir.join("pipeline.toml"), preset)
}

/// Resolve a provider via US-006 auto-detection. On a TTY with nothing
/// detected, prompt for an API key and store it globally; otherwise raise the
/// actionable `NoProviderDetected` error rather than hang.
async fn ensure_provider(yes: bool) -> Result<()> {
    let config = merged_config()?;
    match detect_provider(&config).await {
        ProviderDetection::Detected { provider, source } => {
            println!(
                "3/4  Provider  {}  (detected: {})",
                provider,
                source.describe()
            );
            Ok(())
        }
        ProviderDetection::NeedsSelection => {
            if !yes && std::io::stdin().is_terminal() {
                let path = key_storage_path();
                print!(
                    "No provider detected. Paste an OpenRouter API key \
                     (stored in {}, never in your repo): ",
                    path.display()
                );
                std::io::stdout().flush()?;
                let mut key = String::new();
                std::io::stdin().read_line(&mut key)?;
                let key = key.trim();
                if key.is_empty() {
                    return Err(no_provider_error(&config).into());
                }
                store_api_key_globally("OPENROUTER_API_KEY", key)?;
                std::env::set_var("OPENROUTER_API_KEY", key);
                println!(
                    "3/4  Provider  openrouter  (key stored in {})",
                    path.display()
                );
                Ok(())
            } else {
                Err(no_provider_error(&config).into())
            }
        }
    }
}

fn no_provider_error(config: &PipelineTomlConfig) -> ProviderError {
    ProviderError::NoProviderDetected {
        ollama_url: ollama_base_url(config),
    }
}

/// Persist `var_name=value` under the `[env]` table of the global secrets file,
/// preserving any other keys already stored. Returns the file path.
fn store_api_key_globally(var_name: &str, value: &str) -> Result<PathBuf> {
    let path = key_storage_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut doc: toml::Value = if path.exists() {
        toml::from_str(&std::fs::read_to_string(&path)?).unwrap_or_else(|_| empty_table())
    } else {
        empty_table()
    };
    let table = doc.as_table_mut().expect("secrets root is a table");
    let env = table.entry("env".to_string()).or_insert_with(empty_table);
    env.as_table_mut()
        .expect("[env] is a table")
        .insert(var_name.to_string(), toml::Value::String(value.to_string()));
    std::fs::write(&path, toml::to_string_pretty(&doc)?)?;
    Ok(path)
}

fn empty_table() -> toml::Value {
    toml::Value::Table(toml::map::Map::new())
}

fn merged_config() -> Result<PipelineTomlConfig> {
    let project_root = find_project_root()?;
    let global = home_dirs::load_global_config();
    let project = PipelineTomlConfig::load_from_project_root(&project_root)?;
    Ok(global.merge(project))
}

fn resolve_title(title: Option<String>) -> String {
    match title {
        Some(t) if !t.trim().is_empty() => t,
        _ => DEFAULT_FIRST_RUN_TITLE.to_string(),
    }
}

async fn run_light_pipeline(title: &str, preset: PresetKind) -> Result<String> {
    let gate_handler: Arc<dyn GateHandler> = Arc::new(AutoApproveGateHandler);
    let user_input_handler: Arc<dyn PipelineUserInputHandler> = Arc::new(StdinUserInputHandler);
    let orchestrator =
        build_orchestrator_with_gate(None, Some(preset), gate_handler, user_input_handler).await?;
    orchestrator.run_feature_with_preset(title, preset).await
}

/// The path of the generated artifact to advertise: prefer a spec-like phase,
/// else the first recorded artifact.
async fn first_artifact_path(session_id: &str) -> Option<String> {
    let storage = open_storage().await.ok()?;
    let artifacts = storage.list_artifacts(session_id).await.ok()?;
    artifacts
        .iter()
        .find(|a| a.phase.contains("spec"))
        .or_else(|| artifacts.first())
        .map(|a| a.path.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_run_always_uses_light_preset() {
        assert_eq!(first_run_preset(), PresetKind::Light);
    }

    #[test]
    fn detect_project_context_reads_stack_git_and_config() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "[package]\nname='x'\n").unwrap();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();

        let ctx = detect_project_context(dir.path());
        assert_eq!(ctx.stack, "Rust");
        assert!(ctx.is_git);
        assert!(!ctx.has_existing_config);
    }

    #[test]
    fn detect_project_context_flags_existing_koklo_config() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".koklo")).unwrap();
        std::fs::write(dir.path().join(".koklo").join("pipeline.toml"), "").unwrap();

        assert!(detect_project_context(dir.path()).has_existing_config);
    }

    #[test]
    fn detect_stack_label_falls_back_to_unknown() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(detect_stack_label(dir.path()), "unknown");
    }

    #[test]
    fn ensure_project_config_writes_light_when_absent() {
        let dir = tempfile::tempdir().unwrap();
        let ctx = detect_project_context(dir.path());
        ensure_project_config(&ctx, PresetKind::Light).unwrap();

        let toml =
            std::fs::read_to_string(dir.path().join(".koklo").join("pipeline.toml")).unwrap();
        assert!(toml.contains("preset = \"light\""));
    }

    #[test]
    fn ensure_project_config_never_overwrites_existing() {
        let dir = tempfile::tempdir().unwrap();
        let koklo = dir.path().join(".koklo");
        std::fs::create_dir_all(&koklo).unwrap();
        std::fs::write(koklo.join("pipeline.toml"), "preset = \"sdd\"\n").unwrap();

        let ctx = detect_project_context(dir.path());
        ensure_project_config(&ctx, PresetKind::Light).unwrap();

        let toml = std::fs::read_to_string(koklo.join("pipeline.toml")).unwrap();
        assert_eq!(toml, "preset = \"sdd\"\n");
    }

    #[test]
    fn key_storage_path_is_never_inside_the_project_tree() {
        // The secrets file resolves to the global home, not the project's .koklo.
        let project = std::env::current_dir().unwrap().join(".koklo");
        let target = key_storage_path();
        assert!(
            !target.starts_with(&project),
            "API key target {} must not live in the repo {}",
            target.display(),
            project.display()
        );
        assert_eq!(
            target.file_name().and_then(|n| n.to_str()),
            Some("secrets.toml")
        );
    }

    #[test]
    fn store_api_key_globally_writes_env_table_and_preserves_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("secrets.toml");
        std::env::set_var("KOKLO_SECRETS_FILE", &path);

        std::fs::write(&path, "[env]\nEXISTING = \"keep\"\n").unwrap();
        store_api_key_globally("OPENROUTER_API_KEY", "sk-test").unwrap();

        let written = std::fs::read_to_string(&path).unwrap();
        assert!(written.contains("OPENROUTER_API_KEY = \"sk-test\""));
        assert!(written.contains("EXISTING = \"keep\""));
        std::env::remove_var("KOKLO_SECRETS_FILE");
    }

    #[test]
    fn success_message_surfaces_artifact_path_or_fallback() {
        let with = success_message("sess-1", Some("/abs/docs/planning_artifacts/spec.md"));
        assert!(with.contains("sess-1"));
        assert!(with.contains("/abs/docs/planning_artifacts/spec.md"));

        let without = success_message("sess-2", None);
        assert!(without.contains("koklo artifacts list sess-2"));
    }

    #[test]
    fn resolve_title_uses_default_when_blank() {
        assert_eq!(resolve_title(None), DEFAULT_FIRST_RUN_TITLE);
        assert_eq!(
            resolve_title(Some("   ".to_string())),
            DEFAULT_FIRST_RUN_TITLE
        );
        assert_eq!(resolve_title(Some("Ship auth".to_string())), "Ship auth");
    }
}
