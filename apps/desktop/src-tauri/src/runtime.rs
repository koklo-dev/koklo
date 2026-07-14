use crate::bridge::{pump_transcript, TranscriptSink};
use crate::gates::{GateDecisionInput, GateDto};
use crate::handlers;
use crate::ipc::{SessionDto, TranscriptLineDto, UsageSummaryDto};
use crate::sessions::{self, RunSessionInput, RunSpec, SessionRunner};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use koklo_events::{GateChannel, UserInputChannel};
use koklo_providers::registry::build_provider;
use koklo_providers::{
    detect_provider, LlmProvider, PipelineTomlConfig, ProviderDetection, ProviderRegistry,
    ProviderTomlEntry,
};
use koklo_storage::SessionManager;
use koklo_workflow_engine::{
    GithubConfig, PipelineConfig, PipelineOrchestrator, TuiGateHandler, TuiUserInputHandler,
};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{Emitter, Manager, State};

/// A [`TranscriptSink`] backed by the Tauri app handle: every live transcript line is
/// emitted on the contract event channel, where the TS client's `transcript.subscribe`
/// listener filters it by `sessionId` (US-014). Cloneable and `'static` so the EventBus
/// pump can own one per run.
#[derive(Clone)]
struct AppHandleSink {
    app: tauri::AppHandle,
}

impl TranscriptSink for AppHandleSink {
    fn emit_line(&self, channel: &str, line: &TranscriptLineDto) -> Result<()> {
        self.app
            .emit(channel, line.clone())
            .map_err(|error| anyhow!("failed to emit transcript line: {error}"))
    }
}

pub struct WorkflowEngineRunner {
    gate_channel: GateChannel,
    user_input_channel: UserInputChannel,
    /// Set once the Tauri app is built (in `setup`); lets a run stream live lines into the
    /// window. `None` only in the brief window before setup, or in headless tests.
    app: Arc<OnceLock<tauri::AppHandle>>,
}

impl WorkflowEngineRunner {
    fn new(gate_channel: GateChannel, user_input_channel: UserInputChannel) -> Self {
        Self {
            gate_channel,
            user_input_channel,
            app: Arc::new(OnceLock::new()),
        }
    }
}

#[async_trait]
impl SessionRunner for WorkflowEngineRunner {
    async fn run(&self, spec: RunSpec) -> Result<String> {
        let config = pipeline_config(&spec).await?;
        let storage = SessionManager::open(&config.db_path).await?;
        let existing_ids: HashSet<String> = storage
            .list_sessions_for_project(&spec.project_path)
            .await?
            .into_iter()
            .map(|session| session.id)
            .collect();
        let orchestrator = PipelineOrchestrator::new_with_handlers(
            config,
            Arc::new(TuiGateHandler::new(self.gate_channel.clone())),
            Arc::new(TuiUserInputHandler::new(self.user_input_channel.clone())),
        )
        .await?;

        // Stream live transcript lines into the window. Subscribe to the EventBus BEFORE
        // the pipeline starts so no early line is missed (the broadcast channel buffers);
        // the pump exits when the run ends and the bus closes. Skipped only in headless
        // tests where no AppHandle was set (roadmap P2 §4 — live streaming).
        if let Some(app) = self.app.get() {
            let receiver = orchestrator.event_bus().subscribe();
            let sink = AppHandleSink { app: app.clone() };
            tokio::spawn(pump_transcript(receiver, sink));
        }

        let title = spec.title.clone();
        let project_path = spec.project_path.clone();
        let preset = spec.preset.as_str().to_string();
        tokio::spawn(async move {
            if let Err(error) = orchestrator
                .run_feature_with_preset(&spec.title, spec.preset)
                .await
            {
                tracing::error!("desktop pipeline execution failed: {error}");
            }
        });

        wait_for_started_session(&storage, &existing_ids, &title, &project_path, &preset).await
    }
}

pub struct DesktopState {
    storage: SessionManager,
    runner: WorkflowEngineRunner,
}

impl DesktopState {
    async fn load() -> Result<Self> {
        let gate_channel = GateChannel::new();
        let user_input_channel = UserInputChannel::new();
        Ok(Self {
            storage: SessionManager::open(&database_path()).await?,
            runner: WorkflowEngineRunner::new(gate_channel, user_input_channel),
        })
    }
}

#[tauri::command(rename_all = "camelCase")]
async fn sessions_run(
    state: State<'_, DesktopState>,
    r#type: String,
    title: String,
    preset: String,
    project_path: String,
) -> Result<SessionDto, String> {
    sessions::sessions_run(
        &state.storage,
        &state.runner,
        RunSessionInput {
            run_type: r#type,
            title,
            preset,
            project_path,
        },
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn sessions_list(state: State<'_, DesktopState>) -> Result<Vec<SessionDto>, String> {
    handlers::sessions_list(&state.storage)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn sessions_list_for_project(
    state: State<'_, DesktopState>,
    project_path: String,
) -> Result<Vec<SessionDto>, String> {
    handlers::sessions_list_for_project(&state.storage, &project_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn sessions_get(
    state: State<'_, DesktopState>,
    id: String,
) -> Result<Option<SessionDto>, String> {
    handlers::session_get(&state.storage, &id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn sessions_usage(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<UsageSummaryDto, String> {
    handlers::session_usage(&state.storage, &session_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn transcript_list(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<Vec<TranscriptLineDto>, String> {
    handlers::transcript_list(&state.storage, &session_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn transcript_since(
    state: State<'_, DesktopState>,
    session_id: String,
    since_seq: i64,
) -> Result<Vec<TranscriptLineDto>, String> {
    handlers::transcript_since(&state.storage, &session_id, since_seq)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn gates_pending(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<Vec<GateDto>, String> {
    handlers::gates_pending(&state.storage, &session_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn gates_decide(
    state: State<'_, DesktopState>,
    session_id: String,
    request_id: Option<String>,
    action: String,
    note: Option<String>,
    edit_path: Option<String>,
) -> Result<(), String> {
    handlers::gates_decide(
        &state.runner.gate_channel,
        &state.storage,
        GateDecisionInput {
            session_id,
            request_id,
            action,
            note,
            edit_path,
        },
    )
    .await
    .map_err(|error| error.to_string())
}

/// Hand off from the frontend boot flow: close the frameless `splashscreen`
/// window and reveal the (initially hidden) `main` window. Driven from the
/// backend so it needs no `core:window` capability — closing a *different*
/// window from the frontend is denied unless that window is itself granted the
/// permission, whereas the backend has full window access. Missing windows are
/// ignored so the command is safe to call more than once.
#[tauri::command]
fn finish_boot(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_icon(tauri::include_image!("icons/icon.png"));
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// `account.get` — the saved local account, or `null` when onboarding is pending.
/// Drives the desktop boot gate (`UserSetupScreen` shows when this is `null`).
#[tauri::command]
fn account_get() -> Result<Option<crate::account::AccountDto>, String> {
    crate::account::account_get(&koklo_home()).map_err(|error| error.to_string())
}

/// `account.save` — persist the local identity submitted by `UserSetupScreen`.
/// Shares `~/.koklo/account.toml` with the CLI. Avatar is not persisted (v1).
#[tauri::command(rename_all = "camelCase")]
fn account_save(
    name: String,
    email: String,
    role: Option<String>,
) -> Result<crate::account::AccountDto, String> {
    crate::account::account_save(
        &koklo_home(),
        crate::account::AccountInput { name, email, role },
    )
    .map_err(|error| error.to_string())
}

pub fn run() {
    let state = tauri::async_runtime::block_on(DesktopState::load())
        .expect("failed to initialize Koklo desktop state");
    // Share the runner's AppHandle slot so `setup` can populate it once the app exists;
    // the live transcript pump reads it when a run starts.
    let app_slot = Arc::clone(&state.runner.app);
    tauri::Builder::default()
        .manage(state)
        .setup(move |app| {
            let _ = app_slot.set(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sessions_run,
            sessions_list,
            sessions_list_for_project,
            sessions_get,
            sessions_usage,
            transcript_list,
            transcript_since,
            gates_pending,
            gates_decide,
            account_get,
            account_save,
            finish_boot
        ])
        .run(tauri::generate_context!())
        .expect("error while running Koklo desktop");
}

async fn pipeline_config(spec: &RunSpec) -> Result<PipelineConfig> {
    let project_root = PathBuf::from(&spec.project_path);
    if !project_root.is_dir() {
        return Err(anyhow!(
            "projectPath `{}` is not an existing directory",
            spec.project_path
        ));
    }
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

fn koklo_home() -> PathBuf {
    std::env::var("KOKLO_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| Path::new(".").to_path_buf())
                .join(".koklo")
        })
}

fn database_path() -> String {
    std::env::var("KOKLO_DB_PATH")
        .unwrap_or_else(|_| koklo_home().join("koklo.db").to_string_lossy().into_owned())
}

fn env_flag(name: &str) -> bool {
    std::env::var(name)
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

async fn wait_for_started_session(
    storage: &SessionManager,
    existing_ids: &HashSet<String>,
    title: &str,
    project_path: &str,
    preset: &str,
) -> Result<String> {
    for _ in 0..100 {
        if let Some(session) = storage
            .list_sessions_for_project(project_path)
            .await?
            .into_iter()
            .find(|session| {
                !existing_ids.contains(&session.id)
                    && session.feature_title == title
                    && session.preset == preset
            })
        {
            return Ok(session.id);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err(anyhow!(
        "workflow engine did not persist the new session within 5 seconds"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn started_session_lookup_returns_only_a_new_matching_session() {
        let storage = SessionManager::in_memory().await.unwrap();
        let old = storage
            .create_session("Desktop run", "light", "/repo")
            .await
            .unwrap();
        let existing_ids = HashSet::from([old.id]);
        let new = storage
            .create_session("Desktop run", "light", "/repo")
            .await
            .unwrap();

        let found =
            wait_for_started_session(&storage, &existing_ids, "Desktop run", "/repo", "light")
                .await
                .unwrap();

        assert_eq!(found, new.id);
    }
}
