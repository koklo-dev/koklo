//! Koklo CLI — autonomous AI development pipeline.
//!
//! # Usage
//! ```text
//! koklo [OPTIONS] <COMMAND>
//!
//! Core:
//!   init          Initialize Koklo in the current project
//!   run           Run a workflow pipeline
//!   session       Manage pipeline sessions
//!   agent         Manage and run built-in agents
//!   workflow      List and inspect workflow presets
//!   config        View project configuration
//!   artifacts     Browse pipeline artifacts
//!   provider      Manage LLM providers
//!   monitor       Live TUI dashboard
//!   context       Manage context files
//!
//! Aliases (backward-compat):
//!   status        → session list / session show <id>
//!   resume        → session resume <id>
//! ```

mod monitor;

use anyhow::Result;
use clap::{Parser, Subcommand};
use koklo_providers::{
    AnthropicProvider, LlmProvider, MistralProvider, OllamaProvider, OpenAIProvider,
    PipelineTomlConfig, ProviderRegistry,
};
use koklo_workflow_engine::{
    presets::{phases_for_preset, PresetKind},
    GithubConfig, PipelineConfig, PipelineOrchestrator,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

// ── CLI structure ─────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(
    name = "koklo",
    about = "Autonomous AI development pipeline",
    long_about = "Koklo — spec-driven autonomous development.\n\n\
        Run `koklo workflow list` to see available presets.\n\
        Run `koklo agent list` to see available agents.\n\
        Run `koklo init` to initialise a new project.",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialise Koklo in the current project (creates .koklo/pipeline.toml).
    ///
    /// Examples:
    ///   koklo init
    ///   koklo init --preset bmad --yes
    ///   koklo .
    Init {
        /// Path to initialise (default: current directory).
        #[arg(value_name = "PATH", default_value = ".")]
        path: PathBuf,

        /// Workflow preset to use for this project.
        #[arg(long, default_value = "sdd", value_parser = parse_preset)]
        preset: PresetKind,

        /// Skip interactive prompts and use defaults.
        #[arg(long, short = 'y')]
        yes: bool,
    },

    /// Run a workflow pipeline.
    ///
    /// Examples:
    ///   koklo run feature "Auth JWT"
    ///   koklo run --preset bmad feature "Add OAuth2"
    ///   koklo run --preset speckit feature "Refactor storage"
    ///   koklo run --preset light task "Fix typo in README"
    Run {
        /// Workflow preset to use.
        #[arg(long, default_value = "sdd", value_parser = parse_preset)]
        preset: PresetKind,

        /// Pipeline type (currently: feature, task, bug).
        #[arg(value_name = "TYPE")]
        pipeline_type: String,

        /// Title / description of the work item.
        #[arg(value_name = "TITLE")]
        title: String,
    },

    /// Manage pipeline sessions.
    ///
    /// Examples:
    ///   koklo session list
    ///   koklo session show <id>
    ///   koklo session resume <id>
    #[command(subcommand)]
    Session(SessionCommands),

    /// Manage and run built-in agents.
    ///
    /// Examples:
    ///   koklo agent list
    ///   koklo agent show security
    ///   koklo agent run pm --input "Add user authentication"
    #[command(subcommand)]
    Agent(AgentCommands),

    /// List and inspect workflow presets.
    ///
    /// Examples:
    ///   koklo workflow list
    ///   koklo workflow show bmad
    #[command(subcommand)]
    Workflow(WorkflowCommands),

    /// View project configuration.
    ///
    /// Examples:
    ///   koklo config show
    ///   koklo config init --preset sdd --yes
    #[command(subcommand)]
    Config(ConfigCommands),

    /// Browse pipeline artifacts.
    ///
    /// Examples:
    ///   koklo artifacts list <session-id>
    ///   koklo artifacts show <session-id> spec
    #[command(subcommand)]
    Artifacts(ArtifactsCommands),

    /// Manage LLM providers.
    ///
    /// Examples:
    ///   koklo provider list
    ///   koklo provider test ollama
    #[command(subcommand)]
    Provider(ProviderCommands),

    // ── Backward-compatible aliases ───────────────────────────────────────────

    /// [alias] Show status of pipeline sessions (same as `session list/show`).
    Status {
        /// Session ID to inspect (omit for all sessions).
        session_id: Option<String>,
    },

    /// [alias] Resume a paused or failed session (same as `session resume`).
    Resume {
        /// Session ID to resume.
        session_id: String,
    },

    /// Live TUI dashboard showing what agents are doing.
    ///
    /// Examples:
    ///   koklo monitor
    ///   koklo monitor --session <id>
    ///   koklo monitor --follow <id>
    Monitor {
        /// Focus on a specific session from launch (prefix match).
        #[arg(long)]
        session: Option<String>,

        /// Plain text stream mode — no TUI, good for CI/scripting.
        #[arg(long, value_name = "SESSION_ID")]
        follow: Option<String>,
    },

    /// Manage project context files (.koklo/USER.md, MEMORY.md, memories/).
    ///
    /// Examples:
    ///   koklo context show
    ///   koklo context init
    #[command(subcommand)]
    Context(ContextCommands),

    // ── Future stubs ──────────────────────────────────────────────────────────

    /// [coming soon] Integrated ticket system — Phase 5.
    Tickets,
    /// [coming soon] Multi-provider deployment — Phase 10.
    Deploy,
    /// [coming soon] Cloud collaboration sync — Phase 12.
    Sync,
    /// [coming soon] Git constellation visualisation — Phase 9.
    Constellation,
    /// [coming soon] Agent marketplace — Phase 11.
    Marketplace,
    /// [coming soon] Voice input — Phase 8.
    Voice,
    /// [coming soon] IDE bridge — Phase 7.
    Ide,
}

// ── session subcommands ───────────────────────────────────────────────────────

#[derive(Subcommand)]
enum SessionCommands {
    /// List all pipeline sessions.
    List,
    /// Show details of a specific session.
    Show {
        /// Session ID to inspect.
        id: String,
    },
    /// Resume a paused or failed session.
    Resume {
        /// Session ID to resume.
        id: String,
    },
}

// ── agent subcommands ─────────────────────────────────────────────────────────

#[derive(Subcommand)]
enum AgentCommands {
    /// List all built-in agents.
    List,
    /// Show the system prompt for an agent.
    Show {
        /// Agent name (e.g. pm, architect, security).
        name: String,
    },
    /// Run an agent with the given input.
    Run {
        /// Agent name.
        name: String,
        /// Input prompt (reads from stdin if omitted).
        #[arg(long)]
        input: Option<String>,
    },
}

// ── workflow subcommands ──────────────────────────────────────────────────────

#[derive(Subcommand)]
enum WorkflowCommands {
    /// List all workflow presets.
    List,
    /// Show the phase sequence for a preset.
    Show {
        /// Preset name (sdd, bmad, speckit, light, custom).
        preset: String,
    },
}

// ── config subcommands ────────────────────────────────────────────────────────

#[derive(Subcommand)]
enum ConfigCommands {
    /// Show the current project configuration.
    Show,
    /// Create or update .koklo/pipeline.toml.
    Init {
        /// Workflow preset to configure.
        #[arg(long, default_value = "sdd", value_parser = parse_preset)]
        preset: PresetKind,

        /// Skip interactive prompts.
        #[arg(long, short = 'y')]
        yes: bool,
    },
}

// ── artifacts subcommands ─────────────────────────────────────────────────────

#[derive(Subcommand)]
enum ArtifactsCommands {
    /// List artifacts for a session.
    List {
        /// Session ID.
        session_id: String,
    },
    /// Show the content of a specific phase artifact.
    Show {
        /// Session ID.
        session_id: String,
        /// Phase name (e.g. spec, plan, implement).
        phase: String,
    },
}

// ── provider subcommands ──────────────────────────────────────────────────────

#[derive(Subcommand)]
enum ProviderCommands {
    /// List configured providers.
    List,
    /// Test connectivity to a provider.
    Test {
        /// Provider name (e.g. ollama, anthropic).
        name: String,
    },
}

// ── context subcommands ───────────────────────────────────────────────────────

#[derive(Subcommand)]
enum ContextCommands {
    /// List which context files exist and preview each one.
    Show,
    /// Create .koklo/USER.md interactively.
    Init,
}

// ── entry point ───────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Init { path, preset, yes } => cmd_init(&path, preset, yes).await?,
        Commands::Run { preset, pipeline_type, title } => {
            cmd_run(preset, &pipeline_type, &title).await?
        }

        Commands::Session(sub) => match sub {
            SessionCommands::List => cmd_session_list().await?,
            SessionCommands::Show { id } => cmd_session_show(&id).await?,
            SessionCommands::Resume { id } => cmd_session_resume(&id).await?,
        },

        Commands::Agent(sub) => match sub {
            AgentCommands::List => cmd_agent_list().await?,
            AgentCommands::Show { name } => cmd_agent_show(&name).await?,
            AgentCommands::Run { name, input } => cmd_agent_run(&name, input).await?,
        },

        Commands::Workflow(sub) => match sub {
            WorkflowCommands::List => cmd_workflow_list(),
            WorkflowCommands::Show { preset } => cmd_workflow_show(&preset)?,
        },

        Commands::Config(sub) => match sub {
            ConfigCommands::Show => cmd_config_show().await?,
            ConfigCommands::Init { preset, yes } => cmd_config_init(preset, yes).await?,
        },

        Commands::Artifacts(sub) => match sub {
            ArtifactsCommands::List { session_id } => {
                cmd_artifacts_list(&session_id).await?
            }
            ArtifactsCommands::Show { session_id, phase } => {
                cmd_artifacts_show(&session_id, &phase).await?
            }
        },

        Commands::Provider(sub) => match sub {
            ProviderCommands::List => cmd_provider_list().await?,
            ProviderCommands::Test { name } => cmd_provider_test(&name).await?,
        },

        Commands::Monitor { session, follow } => {
            cmd_monitor(session, follow).await?
        }

        Commands::Context(sub) => match sub {
            ContextCommands::Show => cmd_context_show().await?,
            ContextCommands::Init => cmd_context_init().await?,
        },

        // Backward-compat aliases
        Commands::Status { session_id } => match session_id {
            Some(id) => cmd_session_show(&id).await?,
            None => cmd_session_list().await?,
        },
        Commands::Resume { session_id } => cmd_session_resume(&session_id).await?,

        // Future stubs — informative message, no crash.
        Commands::Tickets => {
            eprintln!(
                "Tickets: coming in Phase 5 (Integrated Ticketing). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
        Commands::Deploy => {
            eprintln!(
                "Deploy: coming in Phase 10 (Multi-provider Deployment). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
        Commands::Sync => {
            eprintln!(
                "Sync: coming in Phase 12 (Cloud Collaboration). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
        Commands::Constellation => {
            eprintln!(
                "Constellation: coming in Phase 9 (Git Visualisation). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
        Commands::Marketplace => {
            eprintln!(
                "Marketplace: coming in Phase 11 (Agent Marketplace). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
        Commands::Voice => {
            eprintln!(
                "Voice: coming in Phase 8 (Voice Input). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
        Commands::Ide => {
            eprintln!(
                "IDE Bridge: coming in Phase 7 (IDE Integration). \
                 See roadmap at https://github.com/koklo-dev/koklo"
            );
        }
    }

    Ok(())
}

// ── preset parser (for clap value_parser) ────────────────────────────────────

fn parse_preset(s: &str) -> Result<PresetKind, String> {
    PresetKind::from_str(s)
        .ok_or_else(|| format!("Unknown preset '{}'. Valid: sdd, bmad, speckit, light, custom", s))
}

// ── orchestrator construction ─────────────────────────────────────────────────

/// Walk up from `cwd` to find the directory containing `.koklo/`.
/// Falls back to `cwd` if not found.
fn find_project_root() -> Result<PathBuf> {
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
/// 1. `KOKLO_PROVIDER` env var → registry lookup
/// 2. `ANTHROPIC_API_KEY` set → AnthropicProvider
/// 3. `OPENAI_API_KEY` set → OpenAIProvider
/// 4. `MISTRAL_API_KEY` set → MistralProvider
/// 5. OllamaProvider (fallback)
fn determine_default_provider(registry: &ProviderRegistry) -> Result<Arc<dyn LlmProvider>> {
    if let Ok(name) = std::env::var("KOKLO_PROVIDER") {
        if let Some(p) = registry.get(&name) {
            tracing::info!("Default provider: '{}' (from KOKLO_PROVIDER)", name);
            return Ok(p);
        }
        tracing::warn!("KOKLO_PROVIDER='{}' not in registry, falling back", name);
    }

    if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        let p: Arc<dyn LlmProvider> = match registry.get("anthropic") {
            Some(p) => p,
            None => Arc::new(AnthropicProvider::from_env()?),
        };
        tracing::info!("Default provider: anthropic (ANTHROPIC_API_KEY)");
        return Ok(p);
    }

    if std::env::var("OPENAI_API_KEY").is_ok() {
        let p: Arc<dyn LlmProvider> = match registry.get("openai") {
            Some(p) => p,
            None => Arc::new(OpenAIProvider::from_env()?),
        };
        tracing::info!("Default provider: openai (OPENAI_API_KEY)");
        return Ok(p);
    }

    if std::env::var("MISTRAL_API_KEY").is_ok() {
        let p: Arc<dyn LlmProvider> = match registry.get("mistral") {
            Some(p) => p,
            None => Arc::new(MistralProvider::from_env()?),
        };
        tracing::info!("Default provider: mistral (MISTRAL_API_KEY)");
        return Ok(p);
    }

    let p: Arc<dyn LlmProvider> = match registry.get("ollama") {
        Some(p) => p,
        None => Arc::new(OllamaProvider::from_env()),
    };
    tracing::info!("Default provider: ollama (fallback)");
    Ok(p)
}

/// Build a `PipelineOrchestrator` from `.koklo/pipeline.toml` + environment,
/// using the given preset (overrides the TOML default).
async fn build_orchestrator(preset_override: Option<PresetKind>) -> Result<PipelineOrchestrator> {
    let project_root = find_project_root()?;
    tracing::debug!("Project root: {}", project_root.display());

    let toml_config = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let registry = Arc::new(ProviderRegistry::build(&toml_config)?);

    let mut agent_providers: HashMap<String, Arc<dyn LlmProvider>> = HashMap::new();
    for (agent_name, agent_cfg) in &toml_config.agents {
        if let Some(ref provider_name) = agent_cfg.provider {
            if let Some(p) = registry.get(provider_name) {
                agent_providers.insert(agent_name.clone(), p);
            }
        }
    }

    let default_provider = determine_default_provider(&registry)?;

    // Preset resolution: explicit override > CLI TOML default > SDD
    let preset = preset_override.unwrap_or_else(|| {
        toml_config
            .workflow
            .preset
            .as_deref()
            .and_then(PresetKind::from_str)
            .unwrap_or_default()
    });

    let config = PipelineConfig {
        db_path: toml_config
            .pipeline
            .db_path
            .clone()
            .or_else(|| std::env::var("KOKLO_DB_PATH").ok())
            .unwrap_or_else(|| "sqlite://koklo-sessions.db".to_string()),
        artifacts_dir: PathBuf::from(
            toml_config
                .pipeline
                .artifacts_dir
                .as_deref()
                .unwrap_or("docs/planning_artifacts"),
        ),
        agents_dir: PathBuf::from(
            toml_config
                .pipeline
                .agents_dir
                .as_deref()
                .unwrap_or("agents/built-in"),
        ),
        context_dir: Some(project_root.join(".koklo")),
        preset,
        default_provider,
        agent_providers,
        provider_registry: registry,
        github: GithubConfig::from_env(),
    };

    PipelineOrchestrator::new(config).await
}

/// Return the DB path from config or environment.
async fn open_storage() -> Result<koklo_storage::SessionManager> {
    let project_root = find_project_root()?;
    let toml_config = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let db_path = toml_config
        .pipeline
        .db_path
        .or_else(|| std::env::var("KOKLO_DB_PATH").ok())
        .unwrap_or_else(|| "sqlite://koklo-sessions.db".to_string());
    koklo_storage::SessionManager::open(&db_path).await
}

/// Return the agents directory from config.
fn agents_dir() -> PathBuf {
    let project_root = find_project_root().unwrap_or_else(|_| PathBuf::from("."));
    let toml_config =
        PipelineTomlConfig::load_from_project_root(&project_root).unwrap_or_default();
    PathBuf::from(
        toml_config
            .pipeline
            .agents_dir
            .as_deref()
            .unwrap_or("agents/built-in"),
    )
}

// ── command handlers ──────────────────────────────────────────────────────────

/// `koklo init [PATH] [--preset P] [--yes]`
async fn cmd_init(path: &PathBuf, preset: PresetKind, yes: bool) -> Result<()> {
    let target = if path == &PathBuf::from(".") {
        std::env::current_dir()?
    } else {
        path.clone()
    };

    let koklo_dir = target.join(".koklo");
    let toml_path = koklo_dir.join("pipeline.toml");

    if toml_path.exists() {
        println!("Already initialised: {}", toml_path.display());
        println!("Use `koklo config init` to reconfigure.");
        return Ok(());
    }

    // Detect project stack
    let detected_preset = detect_stack_preset(&target);
    let chosen_preset = if !yes && detected_preset != preset {
        println!(
            "Detected stack suggests '{}' preset. You specified '{}'. Using '{}'.",
            detected_preset.as_str(),
            preset.as_str(),
            preset.as_str()
        );
        preset
    } else {
        preset
    };

    if !yes {
        println!(
            "Initialising Koklo in: {}\nPreset: {} — {}\nCreate .koklo/pipeline.toml? [Y/n] ",
            target.display(),
            chosen_preset.as_str(),
            chosen_preset.display_name()
        );
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        let trimmed = input.trim().to_lowercase();
        if trimmed == "n" || trimmed == "no" {
            println!("Aborted.");
            return Ok(());
        }
    }

    std::fs::create_dir_all(&koklo_dir)?;
    write_default_pipeline_toml(&toml_path, chosen_preset)?;

    println!(
        "Initialised: {}\nPreset: {} ({})",
        toml_path.display(),
        chosen_preset.as_str(),
        chosen_preset.display_name()
    );
    println!("\nNext steps:");
    println!("  koklo run feature \"<title>\"");
    println!("  koklo workflow list");
    Ok(())
}

/// Detect the likely project stack and return a suggested preset.
fn detect_stack_preset(dir: &PathBuf) -> PresetKind {
    if dir.join("Cargo.toml").exists() {
        return PresetKind::Sdd; // Rust → SDD
    }
    if dir.join("package.json").exists() {
        return PresetKind::SpecKit; // Node/TS → Spec Kit
    }
    if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        return PresetKind::Sdd; // Python → SDD
    }
    if dir.join("go.mod").exists() {
        return PresetKind::Sdd; // Go → SDD
    }
    PresetKind::Sdd // default
}

/// Write a minimal `.koklo/pipeline.toml` with the given preset.
fn write_default_pipeline_toml(path: &PathBuf, preset: PresetKind) -> Result<()> {
    let content = format!(
        r#"[pipeline]
db_path = "sqlite://koklo-sessions.db"
artifacts_dir = "docs/planning_artifacts"
agents_dir = "agents/built-in"

[workflow]
preset = "{preset}"

[providers.ollama]
base_url = "http://127.0.0.1:11434"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"
"#,
        preset = preset.as_str()
    );
    std::fs::write(path, content)?;
    Ok(())
}

/// `koklo run [--preset P] <type> <title>`
async fn cmd_run(preset: PresetKind, pipeline_type: &str, title: &str) -> Result<()> {
    match pipeline_type {
        "feature" | "task" | "bug" => {}
        other => {
            anyhow::bail!(
                "Unknown pipeline type '{}'. Supported: feature, task, bug",
                other
            );
        }
    }
    let orchestrator = build_orchestrator(Some(preset)).await?;
    let session_id = orchestrator.run_feature_with_preset(title, preset).await?;
    println!("\nPipeline complete — session: {}", session_id);
    Ok(())
}

/// `koklo session list`
async fn cmd_session_list() -> Result<()> {
    let storage = open_storage().await?;
    let sessions = storage.list_sessions().await?;
    if sessions.is_empty() {
        println!("No sessions found.");
    } else {
        println!(
            "{:<38} {:<8} {:<30} {}",
            "SESSION ID", "PRESET", "FEATURE", "STATUS"
        );
        println!("{}", "-".repeat(88));
        for s in sessions {
            println!(
                "{:<38} {:<8} {:<30} {}",
                s.id, s.preset, s.feature_title, s.status
            );
        }
    }
    Ok(())
}

/// `koklo session show <id>`
async fn cmd_session_show(id: &str) -> Result<()> {
    let storage = open_storage().await?;
    match storage.get_session(id).await? {
        Some(s) => {
            println!("Session:  {}", s.id);
            println!("Feature:  {}", s.feature_title);
            println!("Preset:   {}", s.preset);
            println!("Status:   {}", s.status);
            println!("Created:  {}", s.created_at);
            println!("Updated:  {}", s.updated_at);
            println!();
            let phases = storage.get_phases_for_session(id).await?;
            if phases.is_empty() {
                println!("No phases recorded.");
            } else {
                println!("{:<14} {:<12} {}", "PHASE", "STATUS", "COMPLETED");
                println!("{}", "-".repeat(50));
                for p in phases {
                    println!(
                        "{:<14} {:<12} {}",
                        p.phase,
                        p.status,
                        p.completed_at.as_deref().unwrap_or("-")
                    );
                }
            }
        }
        None => println!("Session not found: {}", id),
    }
    Ok(())
}

/// `koklo session resume <id>`
async fn cmd_session_resume(id: &str) -> Result<()> {
    let orchestrator = build_orchestrator(None).await?;
    orchestrator.resume(id).await?;
    println!("\nSession {} resumed and completed.", id);
    Ok(())
}

/// `koklo agent list`
async fn cmd_agent_list() -> Result<()> {
    // Collect unique agent names across all presets.
    let mut seen = std::collections::BTreeSet::new();
    for &kind in PresetKind::all() {
        for (_, name) in phases_for_preset(kind) {
            seen.insert(name);
        }
    }
    let dir = agents_dir();
    println!("{:<22} {}", "AGENT", "SYSTEM PROMPT");
    println!("{}", "-".repeat(60));
    for name in &seen {
        let prompt_path = dir.join(format!("{}.md", name));
        let status = if prompt_path.exists() {
            prompt_path.to_string_lossy().into_owned()
        } else {
            "(prompt file not found)".to_string()
        };
        println!("{:<22} {}", name, status);
    }
    Ok(())
}

/// `koklo agent show <name>` — print the fully assembled system prompt (all layers stacked).
async fn cmd_agent_show(name: &str) -> Result<()> {
    use koklo_agent_runtime::{build_system_prompt, AgentConfig};
    use koklo_events::Phase;

    let dir = agents_dir();
    let path = dir.join(format!("{}.md", name));
    if !path.exists() {
        anyhow::bail!("Agent '{}' not found (expected: {})", name, path.display());
    }

    let project_root = find_project_root()?;
    let config = AgentConfig {
        name: name.to_string(),
        phase: Phase::Spec, // placeholder — doesn't affect prompt assembly
        system_prompt_file: path,
        timeout_secs: 0,
        agents_dir: Some(dir),
        context_dir: Some(project_root.join(".koklo")),
    };

    let prompt = build_system_prompt(&config)?;
    println!("{}", prompt);
    Ok(())
}

/// `koklo agent run <name> [--input <text>]`
async fn cmd_agent_run(name: &str, input: Option<String>) -> Result<()> {
    let prompt = match input {
        Some(p) => p,
        None => {
            println!("Enter input (Ctrl+D to finish):");
            let mut buf = String::new();
            loop {
                let mut line = String::new();
                let n = std::io::stdin().read_line(&mut line)?;
                if n == 0 {
                    break;
                }
                buf.push_str(&line);
            }
            buf
        }
    };

    // Build a minimal orchestrator to get the provider.
    let project_root = find_project_root()?;
    let toml_config = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let registry = Arc::new(ProviderRegistry::build(&toml_config)?);
    let provider = determine_default_provider(&registry)?;

    let dir = agents_dir();
    let system_prompt_file = dir.join(format!("{}.md", name));
    let system_prompt = if system_prompt_file.exists() {
        std::fs::read_to_string(&system_prompt_file)?
    } else {
        format!("You are the {} agent for the koklo AI development pipeline.", name)
    };

    println!("Running agent '{}'...\n", name);
    use koklo_providers::Message;
    let messages = vec![Message::system(system_prompt), Message::user(prompt)];
    let mut output = String::new();
    provider
        .complete_stream(messages, &mut |chunk| {
            if !chunk.text.is_empty() {
                print!("{}", chunk.text);
                output.push_str(&chunk.text);
            }
        })
        .await?;
    println!();
    Ok(())
}

/// `koklo workflow list`
fn cmd_workflow_list() {
    println!(
        "{:<10} {:<30} {:<8} {}",
        "PRESET", "NAME", "PHASES", "REFERENCE"
    );
    println!("{}", "-".repeat(75));
    for &kind in PresetKind::all() {
        let phases = phases_for_preset(kind);
        let url = kind.reference_url().unwrap_or("");
        println!(
            "{:<10} {:<30} {:<8} {}",
            kind.as_str(),
            kind.display_name(),
            phases.len(),
            url
        );
    }
}

/// `koklo workflow show <preset>`
fn cmd_workflow_show(preset_str: &str) -> Result<()> {
    let kind = PresetKind::from_str(preset_str)
        .ok_or_else(|| anyhow::anyhow!("Unknown preset '{}'. Run `koklo workflow list`.", preset_str))?;
    let phases = phases_for_preset(kind);
    println!("{} — {}", kind.display_name(), kind.description());
    if let Some(url) = kind.reference_url() {
        println!("Reference: {}", url);
    }
    println!();
    let phase_names: Vec<String> = phases
        .iter()
        .map(|(p, agent)| format!("{} ({})", p, agent))
        .collect();
    println!("{}", phase_names.join(" → "));
    Ok(())
}

/// `koklo config show`
async fn cmd_config_show() -> Result<()> {
    let project_root = find_project_root()?;
    let toml_path = project_root.join(".koklo").join("pipeline.toml");
    if toml_path.exists() {
        let content = std::fs::read_to_string(&toml_path)?;
        println!("# {}", toml_path.display());
        println!("{}", content);
    } else {
        println!("No .koklo/pipeline.toml found in or above {}.", project_root.display());
        println!("Run `koklo init` to create one.");
    }
    Ok(())
}

/// `koklo config init [--preset P] [--yes]`
async fn cmd_config_init(preset: PresetKind, yes: bool) -> Result<()> {
    let project_root = find_project_root()?;
    cmd_init(&project_root, preset, yes).await
}

/// `koklo artifacts list <session-id>`
async fn cmd_artifacts_list(session_id: &str) -> Result<()> {
    let storage = open_storage().await?;
    let artifacts = storage.list_artifacts(session_id).await?;
    if artifacts.is_empty() {
        println!("No artifacts recorded for session {}.", session_id);
    } else {
        println!("{:<14} {:<12} {}", "PHASE", "SIZE", "PATH");
        println!("{}", "-".repeat(70));
        for a in artifacts {
            println!("{:<14} {:<12} {}", a.phase, a.size_bytes, a.path);
        }
    }
    Ok(())
}

/// `koklo artifacts show <session-id> <phase>`
async fn cmd_artifacts_show(session_id: &str, phase: &str) -> Result<()> {
    let storage = open_storage().await?;
    let artifacts = storage.list_artifacts(session_id).await?;
    let artifact = artifacts
        .into_iter()
        .find(|a| a.phase == phase)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "No artifact for phase '{}' in session '{}'",
                phase,
                session_id
            )
        })?;
    let content = std::fs::read_to_string(&artifact.path)
        .map_err(|e| anyhow::anyhow!("Cannot read {}: {}", artifact.path, e))?;
    println!("{}", content);
    Ok(())
}

/// `koklo provider list`
async fn cmd_provider_list() -> Result<()> {
    let project_root = find_project_root()?;
    let toml_config = PipelineTomlConfig::load_from_project_root(&project_root)?;
    if toml_config.providers.is_empty() {
        println!("No providers configured. Run `koklo init` or edit .koklo/pipeline.toml.");
        return Ok(());
    }
    println!("{:<20} {:<30} {}", "NAME", "MODEL", "STATUS");
    println!("{}", "-".repeat(65));
    for (name, entry) in &toml_config.providers {
        let model = entry.model.as_deref().unwrap_or("-");
        let status = if let Some(ref key_env) = entry.api_key_env {
            if std::env::var(key_env).is_ok() {
                "configured"
            } else {
                "missing key"
            }
        } else {
            "configured"
        };
        println!("{:<20} {:<30} {}", name, model, status);
    }
    Ok(())
}

/// `koklo monitor [--session <id>] [--follow <id>]`
async fn cmd_monitor(session: Option<String>, follow: Option<String>) -> Result<()> {
    let storage = std::sync::Arc::new(open_storage().await?);
    let (session_filter, follow_mode) = if let Some(id) = follow {
        (Some(id), true)
    } else {
        (session, false)
    };
    monitor::run_monitor(session_filter, follow_mode, storage).await
}

/// `koklo context show`
async fn cmd_context_show() -> Result<()> {
    let project_root = find_project_root()?;
    let koklo_dir = project_root.join(".koklo");

    let context_files = [
        ("USER.md", "Who the user is"),
        ("MEMORY.md", "Long-term hand-curated memory"),
    ];

    println!("Context directory: {}", koklo_dir.display());
    println!();

    for (file, desc) in &context_files {
        let path = koklo_dir.join(file);
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let first_line = content.lines().next().unwrap_or("(empty)");
            println!("  {} — {} ✓", file, desc);
            println!("    {}", first_line);
        } else {
            println!("  {} — {} (not found)", file, desc);
        }
    }

    // Show memories/
    let memories_dir = koklo_dir.join("memories");
    if memories_dir.exists() {
        let mut entries: Vec<_> = std::fs::read_dir(&memories_dir)?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        println!();
        println!("  memories/ ({} files)", entries.len());
        for entry in entries.iter().rev().take(3) {
            println!("    {}", entry.file_name().to_string_lossy());
        }
        if entries.len() > 3 {
            println!("    ... and {} more", entries.len() - 3);
        }
    } else {
        println!();
        println!("  memories/ (no session logs yet)");
    }

    Ok(())
}

/// `koklo context init`
async fn cmd_context_init() -> Result<()> {
    let project_root = find_project_root()?;
    let koklo_dir = project_root.join(".koklo");
    std::fs::create_dir_all(&koklo_dir)?;

    let user_md = koklo_dir.join("USER.md");
    if user_md.exists() {
        println!("USER.md already exists: {}", user_md.display());
        println!("Edit it directly to update your user context.");
        return Ok(());
    }

    println!("Creating .koklo/USER.md");
    println!("This file is injected into every agent prompt so agents know who they're working with.");
    println!();

    println!("Your name (or handle): ");
    let mut name = String::new();
    std::io::stdin().read_line(&mut name)?;
    let name = name.trim().to_string();

    println!("Your role/title (e.g. 'Senior Rust Engineer', 'indie hacker'): ");
    let mut role = String::new();
    std::io::stdin().read_line(&mut role)?;
    let role = role.trim().to_string();

    println!("Your main stack/languages (e.g. 'Rust, TypeScript, Python'): ");
    let mut stack = String::new();
    std::io::stdin().read_line(&mut stack)?;
    let stack = stack.trim().to_string();

    let content = format!(
        "# User Context\n\nName: {}\nRole: {}\nStack: {}\n\n\
         ## Preferences\n\n\
         - Prefer concise, direct explanations\n\
         - Show me the code, not just the theory\n\
         - Flag trade-offs explicitly\n",
        if name.is_empty() { "Unknown" } else { &name },
        if role.is_empty() { "Developer" } else { &role },
        if stack.is_empty() { "Not specified" } else { &stack },
    );

    std::fs::write(&user_md, &content)?;
    println!("\nCreated: {}", user_md.display());
    println!("Edit this file anytime to update what agents know about you.");

    // Also create empty MEMORY.md if it doesn't exist
    let memory_md = koklo_dir.join("MEMORY.md");
    if !memory_md.exists() {
        std::fs::write(
            &memory_md,
            "# Project Memory\n\n\
             Add hand-curated notes here. This file is injected into every agent prompt.\n\
             Keep it concise — agents read this on every pipeline run.\n",
        )?;
        println!("Created: {}", memory_md.display());
    }

    Ok(())
}

/// `koklo provider test <name>`
async fn cmd_provider_test(name: &str) -> Result<()> {
    let project_root = find_project_root()?;
    let toml_config = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let registry = Arc::new(ProviderRegistry::build(&toml_config)?);

    let provider = registry
        .get(name)
        .ok_or_else(|| anyhow::anyhow!("Provider '{}' not found in registry.", name))?;

    println!("Testing provider '{}'...", name);
    use koklo_providers::Message;
    let messages = vec![Message::user("Reply with exactly: OK".to_string())];
    match provider
        .complete_stream(messages, &mut |chunk| {
            if !chunk.text.is_empty() {
                print!("{}", chunk.text);
            }
        })
        .await
    {
        Ok(_) => {
            println!("\nProvider '{}': OK", name);
        }
        Err(e) => {
            eprintln!("\nProvider '{}' failed: {}", name, e);
        }
    }
    Ok(())
}
