//! Pipeline orchestration engine.
//!
//! [`PipelineOrchestrator`] drives the multi-phase pipeline.  Which phases
//! are run depends on the [`presets::PresetKind`] stored in [`PipelineConfig`].
//!
//! The Review phase optionally creates a GitHub PR via octocrab when
//! `GITHUB_TOKEN` is set.

pub mod presets;

use anyhow::Result;
use chrono::Utc;
use koklo_agent_runtime::{AgentConfig, AgentRunner};
use koklo_events::{EventBus, GateAction, Phase, PipelineEvent};
use koklo_providers::{LlmProvider, ProviderRegistry};
use koklo_storage::{Session, SessionManager};
use presets::{phases_for_preset, PresetKind};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Optional GitHub integration config.
#[derive(Debug, Clone)]
pub struct GithubConfig {
    /// Personal access token (from `GITHUB_TOKEN`).
    pub token: String,
    /// Repository owner, e.g. `"koklo-dev"`.
    pub owner: String,
    /// Repository name, e.g. `"koklo"`.
    pub repo: String,
    /// Base branch for the PR (default: `"develop"`).
    pub base_branch: String,
}

impl GithubConfig {
    /// Read from environment variables; returns `None` if `GITHUB_TOKEN` is unset.
    pub fn from_env() -> Option<Self> {
        let token = std::env::var("GITHUB_TOKEN").ok()?;
        Some(Self {
            token,
            owner: std::env::var("KOKLO_GITHUB_OWNER").unwrap_or_else(|_| "koklo-dev".to_string()),
            repo: std::env::var("KOKLO_GITHUB_REPO").unwrap_or_else(|_| "koklo".to_string()),
            base_branch: std::env::var("KOKLO_BASE_BRANCH")
                .unwrap_or_else(|_| "develop".to_string()),
        })
    }
}

/// Configuration for the pipeline.
#[derive(Clone)]
pub struct PipelineConfig {
    /// Path to the global SQLite database (`~/.koklo/koklo.db`).
    pub db_path: String,
    pub artifacts_dir: PathBuf,
    /// Global koklo home directory (`~/.koklo/`).
    pub global_home: PathBuf,
    /// Project-level `.koklo/` directory. `None` when outside any project.
    pub project_context: Option<PathBuf>,
    /// Absolute path of the current project root (recorded on each session).
    pub project_path: String,
    /// Workflow preset used when none is specified at the call site.
    pub preset: PresetKind,
    /// Default provider used when no per-agent override is set.
    pub default_provider: Arc<dyn LlmProvider>,
    /// Per-agent provider overrides (keyed by agent name, e.g. `"pm"`, `"developer"`).
    pub agent_providers: HashMap<String, Arc<dyn LlmProvider>>,
    /// Registry for env-var runtime overrides (`KOKLO_PROVIDER_<AGENT>`).
    pub provider_registry: Arc<ProviderRegistry>,
    /// When `Some`, the Review phase creates a GitHub PR.
    pub github: Option<GithubConfig>,
}

impl PipelineConfig {
    /// Select the provider for a given agent.
    ///
    /// Priority:
    /// 1. `KOKLO_PROVIDER_<AGENT_UPPER>` env var → registry lookup (warns if unknown)
    /// 2. `agent_providers` map (from TOML)
    /// 3. `default_provider`
    pub fn resolve_provider_for_agent(&self, agent_name: &str) -> Arc<dyn LlmProvider> {
        let env_key = format!("KOKLO_PROVIDER_{}", agent_name.to_uppercase());
        if let Ok(name) = std::env::var(&env_key) {
            if let Some(p) = self.provider_registry.get(&name) {
                tracing::debug!(
                    "Agent '{}': using provider '{}' from env {}",
                    agent_name,
                    name,
                    env_key
                );
                return p;
            }
            tracing::warn!(
                "Agent '{}': env {}='{}' not found in registry, falling back to default",
                agent_name,
                env_key,
                name
            );
        }
        if let Some(p) = self.agent_providers.get(agent_name) {
            tracing::debug!("Agent '{}': using TOML-configured provider", agent_name);
            return p.clone();
        }
        tracing::debug!(
            "Agent '{}': using default provider '{}'",
            agent_name,
            self.default_provider.provider_name()
        );
        self.default_provider.clone()
    }
}

/// The main pipeline orchestrator.
pub struct PipelineOrchestrator {
    config: PipelineConfig,
    storage: Arc<SessionManager>,
    bus: EventBus,
}

impl PipelineOrchestrator {
    pub async fn new(config: PipelineConfig) -> Result<Self> {
        let storage = Arc::new(SessionManager::open(&config.db_path).await?);
        let bus = EventBus::new(256);
        Ok(Self {
            config,
            storage,
            bus,
        })
    }

    pub fn event_bus(&self) -> EventBus {
        self.bus.clone()
    }

    /// Run the full pipeline for a new feature using the preset in [`PipelineConfig`].
    pub async fn run_feature(&self, feature_title: &str) -> Result<String> {
        self.run_feature_with_preset(feature_title, self.config.preset)
            .await
    }

    /// Run the full pipeline for a new feature using the given preset.
    ///
    /// This is the primary entry point for `koklo run --preset <P>`.
    pub async fn run_feature_with_preset(
        &self,
        feature_title: &str,
        preset: PresetKind,
    ) -> Result<String> {
        let session = self
            .storage
            .create_session(feature_title, preset.as_str(), &self.config.project_path)
            .await?;
        let session_id = session.id.clone();
        tracing::info!(
            "Pipeline started: session={} feature={} preset={}",
            session_id,
            feature_title,
            preset
        );
        self.storage
            .update_session_status(&session_id, "running")
            .await?;

        // Spawn background task: persist EventBus AgentLog events to SQLite.
        let log_bus = self.bus.clone();
        let log_storage = Arc::clone(&self.storage);
        let log_session_id = session_id.clone();
        let phase_map: HashMap<String, &'static str> = phases_for_preset(preset)
            .into_iter()
            .map(|(p, a)| (p.to_string(), a))
            .collect();

        tokio::spawn(async move {
            let mut rx = log_bus.subscribe();
            while let Ok(event) = rx.recv().await {
                if let PipelineEvent::AgentLog { phase, message } = event {
                    let agent_name = phase_map
                        .get(&phase.to_string())
                        .copied()
                        .unwrap_or("unknown");
                    log_storage
                        .record_agent_log(&log_session_id, &phase.to_string(), agent_name, &message)
                        .await
                        .ok();
                }
            }
        });

        let start_time = Utc::now();
        self.run_phases_from(&session_id, feature_title, preset, &HashSet::new())
            .await?;

        self.storage
            .update_session_status(&session_id, "completed")
            .await?;
        tracing::info!("Pipeline completed: session={}", session_id);

        // Append session summary to .koklo/memories/YYYY-MM-DD.md
        if let Err(e) = self.write_memory_log(&session, preset, start_time).await {
            tracing::warn!("Memory log write failed (non-fatal): {}", e);
        }

        Ok(session_id)
    }

    /// Resume a failed/paused session, skipping already-completed phases.
    ///
    /// The preset is read from the session record so the same workflow
    /// methodology is used as when the session was originally started.
    pub async fn resume(&self, session_id: &str) -> Result<()> {
        let session = self
            .storage
            .get_session(session_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", session_id))?;

        let preset = PresetKind::parse(&session.preset).unwrap_or_else(|| {
            tracing::warn!(
                "Unknown preset '{}' in session {}, falling back to SDD",
                session.preset,
                session_id
            );
            PresetKind::Sdd
        });

        let phase_records = self.storage.get_phases_for_session(session_id).await?;
        let completed: HashSet<String> = phase_records
            .iter()
            .filter(|p| p.status == "completed")
            .map(|p| p.phase.clone())
            .collect();

        tracing::info!(
            "Resuming session {}: preset={} skipping {} completed phase(s)",
            session_id,
            preset,
            completed.len()
        );

        self.storage
            .update_session_status(session_id, "running")
            .await?;
        self.run_phases_from(session_id, &session.feature_title, preset, &completed)
            .await?;
        self.storage
            .update_session_status(session_id, "completed")
            .await?;
        Ok(())
    }

    // ── internals ─────────────────────────────────────────────────────────────

    async fn run_phases_from(
        &self,
        session_id: &str,
        feature_title: &str,
        preset: PresetKind,
        skip: &HashSet<String>,
    ) -> Result<()> {
        let phases = phases_for_preset(preset);

        for (phase, agent_name) in &phases {
            if skip.contains(&phase.to_string()) {
                tracing::info!("Skipping completed phase: {}", phase);
                continue;
            }

            let output = match self
                .run_phase(session_id, feature_title, *phase, agent_name)
                .await
            {
                Ok(out) => out,
                Err(e) => {
                    tracing::error!("Phase {} failed: {}", phase, e);
                    self.bus.send(PipelineEvent::PhaseFailed {
                        phase: *phase,
                        session_id: session_id.to_string(),
                        error: e.to_string(),
                    });
                    self.storage
                        .update_session_status(session_id, "failed")
                        .await?;
                    return Err(e);
                }
            };

            if *phase == Phase::Review {
                if let Some(gh) = &self.config.github {
                    match self
                        .create_github_pr(session_id, feature_title, &output, gh)
                        .await
                    {
                        Ok(url) => {
                            println!("\nPR created: {}", url);
                            self.bus.send(PipelineEvent::PrCreated {
                                session_id: session_id.to_string(),
                                url: url.clone(),
                                title: format!("feat: {}", feature_title),
                            });
                        }
                        Err(e) => {
                            tracing::warn!("PR creation failed (non-fatal): {}", e);
                        }
                    }
                } else {
                    tracing::info!("GITHUB_TOKEN not set — skipping PR creation");
                }
            }

            self.gate(session_id, *phase).await?;
        }

        Ok(())
    }

    async fn run_phase(
        &self,
        session_id: &str,
        feature_title: &str,
        phase: Phase,
        agent_name: &str,
    ) -> Result<String> {
        self.bus.send(PipelineEvent::PhaseStarted {
            phase,
            session_id: session_id.to_string(),
        });

        let phase_record = self
            .storage
            .create_phase_record(session_id, &phase.to_string())
            .await?;

        let config = AgentConfig {
            name: agent_name.to_string(),
            phase,
            agent_slug: agent_name.to_string(),
            timeout_secs: 300,
            global_home: self.config.global_home.clone(),
            project_context: self.config.project_context.clone(),
        };

        let provider = self.config.resolve_provider_for_agent(agent_name);
        let runner = AgentRunner::new(config, provider, self.bus.clone());
        let prompt = format!("Feature: {}\nSession: {}", feature_title, session_id);
        let output = runner.run(session_id, &prompt).await?;

        let artifact_path = self
            .config
            .artifacts_dir
            .join(format!("{}-{}.md", session_id, phase));
        if let Some(parent) = artifact_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&artifact_path, &output).await?;

        // Record artifact in the database.
        let size_bytes = output.len() as i64;
        self.storage
            .record_artifact(
                session_id,
                &phase.to_string(),
                &artifact_path.to_string_lossy(),
                size_bytes,
            )
            .await?;

        self.storage
            .complete_phase(&phase_record.id, "completed", None)
            .await?;
        self.bus.send(PipelineEvent::PhaseCompleted {
            phase,
            session_id: session_id.to_string(),
        });
        Ok(output)
    }

    async fn create_github_pr(
        &self,
        session_id: &str,
        feature_title: &str,
        reviewer_output: &str,
        gh: &GithubConfig,
    ) -> Result<String> {
        let octo = octocrab::OctocrabBuilder::default()
            .personal_token(gh.token.clone())
            .build()?;

        let branch = format!("koklo/session/{}", session_id);
        let title = format!("feat: {}", feature_title);
        let body = format!(
            "## Summary\n\nAutonomously developed by the Koklo pipeline.\n\n\
             **Session:** `{}`\n\n---\n\n{}",
            session_id, reviewer_output
        );

        let pr = octo
            .pulls(&gh.owner, &gh.repo)
            .create(&title, &branch, &gh.base_branch)
            .body(&body)
            .send()
            .await?;

        let url = pr
            .html_url
            .map(|u| u.to_string())
            .unwrap_or_else(|| format!("https://github.com/{}/{}/pulls", gh.owner, gh.repo));
        Ok(url)
    }

    async fn gate(&self, session_id: &str, phase: Phase) -> Result<()> {
        self.bus.send(PipelineEvent::GateRequired {
            phase,
            session_id: session_id.to_string(),
            description: format!("Review '{}' phase output and approve to continue.", phase),
        });

        println!("\n[GATE] Phase '{}' complete. Approve? [y/N] ", phase);
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        let trimmed = input.trim().to_lowercase();

        let action = if trimmed == "y" || trimmed == "yes" {
            GateAction::Approve
        } else {
            GateAction::Reject
        };

        // Record the gate decision in the database.
        self.storage
            .record_gate_decision(
                session_id,
                &phase.to_string(),
                match &action {
                    GateAction::Approve => "approve",
                    GateAction::Reject => "reject",
                    GateAction::Edit(_) => "edit",
                },
                None,
            )
            .await?;

        self.bus.send(PipelineEvent::GateResolved {
            phase,
            session_id: session_id.to_string(),
            action: action.clone(),
        });

        match action {
            GateAction::Approve => Ok(()),
            _ => {
                self.storage
                    .update_session_status(session_id, "paused")
                    .await?;
                anyhow::bail!("Gate rejected at phase '{}' — session paused", phase)
            }
        }
    }

    /// Append a session summary to the memories directory.
    ///
    /// Writes to the project memories dir if available, otherwise global.
    async fn write_memory_log(
        &self,
        session: &Session,
        preset: PresetKind,
        start_time: chrono::DateTime<Utc>,
    ) -> Result<()> {
        let ctx_dir = match &self.config.project_context {
            Some(d) => d.clone(),
            None => self.config.global_home.clone(),
        };

        let phases = self.storage.get_phases_for_session(&session.id).await?;
        let artifacts = self.storage.list_artifacts(&session.id).await?;

        let agent_map: HashMap<String, &'static str> = phases_for_preset(preset)
            .into_iter()
            .map(|(p, a)| (p.to_string(), a))
            .collect();

        let human_names: HashMap<&str, &str> = [
            ("pm", "John"),
            ("architect", "Winston"),
            ("developer", "Amelia"),
            ("qa", "Quinn"),
            ("reviewer", "Rex"),
            ("analyst", "Mary"),
            ("security", "Nova"),
            ("doc-writer", "Iris"),
            ("constitution-writer", "Sage"),
            ("task-planner", "Bob"),
        ]
        .into_iter()
        .collect();

        let total_secs = (Utc::now() - start_time).num_seconds();
        let duration = format_duration(total_secs);
        let header_time = chrono::Local::now().format("%H:%M");

        let mut content = format!(
            "\n## {}  —  {}  [{} · {} phases · {}]\n\n",
            header_time,
            session.feature_title,
            preset.as_str(),
            phases.len(),
            duration
        );

        for phase in &phases {
            let agent_slug = agent_map.get(&phase.phase).copied().unwrap_or("unknown");
            let human = human_names.get(agent_slug).copied().unwrap_or(agent_slug);

            let phase_dur = phase_duration_str(&phase.started_at, &phase.completed_at);

            let artifact_info = artifacts
                .iter()
                .find(|a| a.phase == phase.phase)
                .map(|a| {
                    let kb = a.size_bytes as f64 / 1024.0;
                    let filename = Path::new(&a.path)
                        .file_name()
                        .and_then(|f| f.to_str())
                        .unwrap_or(&a.path);
                    format!(" → {} ({:.1} KB)", filename, kb)
                })
                .unwrap_or_default();

            let status = if phase.status == "completed" {
                format!("completed in {}{}", phase_dur, artifact_info)
            } else {
                format!(
                    "failed: {}",
                    phase.error.as_deref().unwrap_or("unknown error")
                )
            };

            content.push_str(&format!("- {} ({}): {}\n", phase.phase, human, status));
        }

        let memories_dir = ctx_dir.join("memories");
        tokio::fs::create_dir_all(&memories_dir).await?;
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let memory_file = memories_dir.join(format!("{}.md", today));

        use tokio::io::AsyncWriteExt;
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&memory_file)
            .await?;
        file.write_all(content.as_bytes()).await?;

        tracing::info!("Memory log appended: {}", memory_file.display());
        Ok(())
    }
}

fn format_duration(secs: i64) -> String {
    if secs < 60 {
        format!("{}s", secs)
    } else {
        format!("{}m {}s", secs / 60, secs % 60)
    }
}

fn phase_duration_str(started_at: &Option<String>, completed_at: &Option<String>) -> String {
    if let (Some(start), Some(end)) = (started_at, completed_at) {
        if let (Ok(s), Ok(e)) = (
            chrono::DateTime::parse_from_rfc3339(start),
            chrono::DateTime::parse_from_rfc3339(end),
        ) {
            return format_duration((e - s).num_seconds());
        }
    }
    "?s".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use koklo_providers::{OllamaProvider, PipelineTomlConfig};

    #[test]
    fn test_phase_ordering_sdd() {
        use koklo_events::Phase;
        let phases = presets::phases_for_preset(PresetKind::Sdd);
        assert_eq!(phases[0].0, Phase::Spec);
        assert_eq!(phases[4].0, Phase::Review);
    }

    #[test]
    fn test_phase_ordering_bmad() {
        let phases = presets::phases_for_preset(PresetKind::Bmad);
        assert_eq!(phases.len(), 8);
    }

    #[test]
    fn test_phase_ordering_speckit() {
        let phases = presets::phases_for_preset(PresetKind::SpecKit);
        assert_eq!(phases.len(), 6);
    }

    #[test]
    fn test_github_config_from_env() {
        let saved = std::env::var("GITHUB_TOKEN").ok();

        std::env::remove_var("GITHUB_TOKEN");
        assert!(GithubConfig::from_env().is_none());

        std::env::set_var("GITHUB_TOKEN", "ghp_test");
        std::env::set_var("KOKLO_GITHUB_OWNER", "my-org");
        let cfg = GithubConfig::from_env().unwrap();
        assert_eq!(cfg.owner, "my-org");
        assert_eq!(cfg.base_branch, "develop");

        std::env::remove_var("KOKLO_GITHUB_OWNER");
        match saved {
            Some(v) => std::env::set_var("GITHUB_TOKEN", v),
            None => std::env::remove_var("GITHUB_TOKEN"),
        }
    }

    fn make_test_config(
        default: Arc<dyn LlmProvider>,
        agent_providers: HashMap<String, Arc<dyn LlmProvider>>,
    ) -> PipelineConfig {
        let registry = Arc::new(ProviderRegistry::build(&PipelineTomlConfig::default()).unwrap());
        PipelineConfig {
            db_path: "sqlite://test.db".to_string(),
            artifacts_dir: PathBuf::from("/tmp"),
            global_home: PathBuf::from("/tmp"),
            project_context: None,
            project_path: String::new(),
            preset: PresetKind::Sdd,
            default_provider: default,
            agent_providers,
            provider_registry: registry,
            github: None,
        }
    }

    #[test]
    fn test_resolve_provider_returns_default() {
        let default: Arc<dyn LlmProvider> = Arc::new(OllamaProvider::from_env());
        std::env::remove_var("KOKLO_PROVIDER_PM");
        let cfg = make_test_config(default, HashMap::new());
        let p = cfg.resolve_provider_for_agent("pm");
        assert_eq!(p.provider_name(), "ollama");
    }

    #[test]
    fn test_resolve_provider_agent_toml_override() {
        let default: Arc<dyn LlmProvider> = Arc::new(OllamaProvider::new(
            "http://127.0.0.1:11434",
            "default-model",
        ));
        let pm: Arc<dyn LlmProvider> =
            Arc::new(OllamaProvider::new("http://127.0.0.1:11434", "pm-model"));
        let mut agent_providers = HashMap::new();
        agent_providers.insert("pm".to_string(), pm);
        std::env::remove_var("KOKLO_PROVIDER_PM");
        let cfg = make_test_config(default, agent_providers);
        let p = cfg.resolve_provider_for_agent("pm");
        assert_eq!(p.model_name(), Some("pm-model"));
    }

    #[test]
    fn test_resolve_provider_unknown_env_falls_back() {
        let default: Arc<dyn LlmProvider> = Arc::new(OllamaProvider::from_env());
        std::env::set_var("KOKLO_PROVIDER_PM", "unknown-xyz");
        let cfg = make_test_config(default, HashMap::new());
        let p = cfg.resolve_provider_for_agent("pm");
        assert_eq!(p.provider_name(), "ollama");
        std::env::remove_var("KOKLO_PROVIDER_PM");
    }

    #[test]
    fn test_pipeline_config_default_preset_is_sdd() {
        let cfg = make_test_config(Arc::new(OllamaProvider::from_env()), HashMap::new());
        assert_eq!(cfg.preset, PresetKind::Sdd);
    }

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(0), "0s");
        assert_eq!(format_duration(45), "45s");
        assert_eq!(format_duration(60), "1m 0s");
        assert_eq!(format_duration(125), "2m 5s");
    }
}
