use clap::{Parser, Subcommand};
use koklo_workflow_engine::presets::PresetKind;
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(
    name = "koklo",
    about = "Autonomous AI development pipeline",
    long_about = "Koklo — spec-driven autonomous development.\n\n\
        Run `koklo workflow list` to see available presets.\n\
        Run `koklo agent list` to see available agents.\n\
        Run `koklo init` to initialise a new project.",
    version
)]
pub(crate) struct Cli {
    #[command(subcommand)]
    pub(crate) command: Commands,
}

#[derive(Debug, Subcommand)]
pub(crate) enum Commands {
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
    ///   koklo run --no-tui feature "Auth JWT"
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

        /// Disable TUI; use stdin for gates (CI, scripting).
        #[arg(long)]
        no_tui: bool,
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
    ///   koklo monitor --project .
    Monitor {
        /// Focus on a specific session from launch (prefix match).
        #[arg(long)]
        session: Option<String>,

        /// Plain text stream mode — no TUI, good for CI/scripting.
        #[arg(long, value_name = "SESSION_ID")]
        follow: Option<String>,

        /// Filter sessions to the given project directory (use `.` for current dir).
        #[arg(long, value_name = "PROJECT_DIR")]
        project: Option<String>,
    },

    /// Manage project context files (.koklo/USER.md, MEMORY.md, memories/).
    ///
    /// Examples:
    ///   koklo context show
    ///   koklo context init
    #[command(subcommand)]
    Context(ContextCommands),

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

    #[command(hide = true, subcommand)]
    Internal(InternalCommands),
}

#[derive(Debug, Subcommand)]
pub(crate) enum SessionCommands {
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

#[derive(Debug, Subcommand)]
pub(crate) enum AgentCommands {
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

#[derive(Debug, Subcommand)]
pub(crate) enum WorkflowCommands {
    /// List all workflow presets.
    List,
    /// Show the phase sequence for a preset.
    Show {
        /// Preset name (sdd, bmad, speckit, light, custom).
        preset: String,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum ConfigCommands {
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

#[derive(Debug, Subcommand)]
pub(crate) enum ArtifactsCommands {
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

#[derive(Debug, Subcommand)]
pub(crate) enum ProviderCommands {
    /// List configured providers.
    List,
    /// Test connectivity to a provider.
    Test {
        /// Provider name (e.g. ollama, openrouter).
        name: String,
    },
    /// Add or update a provider in the config.
    ///
    /// Examples:
    ///   koklo provider add openrouter
    ///   koklo provider add openrouter --model "anthropic/claude-opus-4-6"
    ///   koklo provider add ollama --model qwen2.5-coder:7b --project
    Add {
        /// Provider name (openrouter, ollama, claude-code, codex).
        name: String,
        /// Model name (uses smart default if omitted).
        #[arg(long)]
        model: Option<String>,
        /// Env var holding the API key (uses smart default if omitted).
        #[arg(long)]
        key_env: Option<String>,
        /// Base URL (uses smart default if omitted).
        #[arg(long)]
        base_url: Option<String>,
        /// Write to project .koklo/pipeline.toml instead of global ~/.koklo/config.toml.
        #[arg(long)]
        project: bool,
    },
    /// Remove a provider from the config.
    Remove {
        /// Provider name to remove.
        name: String,
        /// Remove from project config instead of global config.
        #[arg(long)]
        project: bool,
    },
    /// Set the default provider.
    ///
    /// Examples:
    ///   koklo provider set-default claude-code
    ///   koklo provider set-default ollama --project
    SetDefault {
        /// Provider name to set as default.
        name: String,
        /// Write to project config instead of global config.
        #[arg(long)]
        project: bool,
    },
    /// Show API usage for configured providers.
    ///
    /// Examples:
    ///   koklo provider usage
    ///   koklo provider usage openrouter
    Usage {
        /// Show usage for a specific provider only.
        name: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum ContextCommands {
    /// List which context files exist and preview each one.
    Show,
    /// Create .koklo/USER.md interactively.
    Init,
}

#[derive(Debug, Subcommand)]
pub(crate) enum InternalCommands {
    #[command(hide = true)]
    ClaudePermissionBridge {
        #[arg(long, value_name = "DIR")]
        bridge_dir: PathBuf,
    },
}

fn parse_preset(s: &str) -> Result<PresetKind, String> {
    PresetKind::parse(s).ok_or_else(|| {
        format!(
            "Unknown preset '{}'. Valid: sdd, bmad, speckit, light, custom",
            s
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_run_command_with_flags() {
        let cli = Cli::try_parse_from([
            "koklo",
            "run",
            "--preset",
            "bmad",
            "--no-tui",
            "feature",
            "Ship auth",
        ])
        .unwrap();

        match cli.command {
            Commands::Run {
                preset,
                pipeline_type,
                title,
                no_tui,
            } => {
                assert_eq!(preset, PresetKind::Bmad);
                assert_eq!(pipeline_type, "feature");
                assert_eq!(title, "Ship auth");
                assert!(no_tui);
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn parses_monitor_follow_and_project() {
        let cli = Cli::try_parse_from(["koklo", "monitor", "--follow", "sess-1", "--project", "."])
            .unwrap();

        match cli.command {
            Commands::Monitor {
                session,
                follow,
                project,
            } => {
                assert_eq!(session, None);
                assert_eq!(follow.as_deref(), Some("sess-1"));
                assert_eq!(project.as_deref(), Some("."));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn parses_provider_add_project_command() {
        let cli = Cli::try_parse_from([
            "koklo",
            "provider",
            "add",
            "openrouter",
            "--model",
            "anthropic/claude-opus-4-1",
            "--key-env",
            "OPENROUTER_API_KEY",
            "--project",
        ])
        .unwrap();

        match cli.command {
            Commands::Provider(ProviderCommands::Add {
                name,
                model,
                key_env,
                base_url,
                project,
            }) => {
                assert_eq!(name, "openrouter");
                assert_eq!(model.as_deref(), Some("anthropic/claude-opus-4-1"));
                assert_eq!(key_env.as_deref(), Some("OPENROUTER_API_KEY"));
                assert_eq!(base_url, None);
                assert!(project);
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn parses_status_alias_with_optional_session() {
        let cli = Cli::try_parse_from(["koklo", "status", "sess-42"]).unwrap();

        match cli.command {
            Commands::Status { session_id } => {
                assert_eq!(session_id.as_deref(), Some("sess-42"));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn rejects_unknown_preset() {
        let err = Cli::try_parse_from(["koklo", "run", "--preset", "wat", "feature", "Test"])
            .unwrap_err()
            .to_string();

        assert!(err.contains("Unknown preset 'wat'"));
    }
}
