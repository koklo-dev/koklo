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
    ///   koklo agent sync --force
    #[command(subcommand)]
    Agent(AgentCommands),

    /// List and inspect workflow presets.
    ///
    /// Examples:
    ///   koklo workflow list
    ///   koklo workflow show bmad
    #[command(subcommand)]
    Workflow(WorkflowCommands),

    /// Manage custom presets (create, list, delete).
    ///
    /// Examples:
    ///   koklo preset list
    ///   koklo preset create my-flow --phases spec:pm,implement:developer,review:reviewer
    ///   koklo preset show my-flow
    ///   koklo preset delete my-flow
    #[command(subcommand)]
    Preset(PresetCommands),

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

    /// Generate documentation.
    ///
    /// Examples:
    ///   koklo docs readme
    ///   koklo docs changelog --since v0.1.0
    ///   koklo docs adr "Use SQLite for storage"
    #[command(subcommand)]
    Docs(DocsCommands),

    /// Manage local tickets.
    ///
    /// Examples:
    ///   koklo tickets list
    ///   koklo tickets create "Fix login bug" --priority high
    ///   koklo tickets show <id>
    ///   koklo tickets update <id> --status done
    ///   koklo tickets close <id>
    #[command(subcommand)]
    Tickets(TicketCommands),
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
    /// Open files in your editor.
    ///
    /// Examples:
    ///   koklo ide detect
    ///   koklo ide open src/main.rs --line 42
    #[command(subcommand)]
    Ide(IdeCommands),

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
    /// Sync built-in agent profiles into ~/.koklo/agents.
    Sync {
        /// Overwrite built-in fragment files when they already exist.
        #[arg(long)]
        force: bool,
    },
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
pub(crate) enum PresetCommands {
    /// List all presets (built-in + custom).
    List,
    /// Show the phase sequence for a preset.
    Show {
        /// Preset slug (e.g. sdd, my-custom-flow).
        slug: String,
    },
    /// Create a custom preset.
    Create {
        /// Unique slug for the preset (e.g. my-flow).
        slug: String,
        /// Display name.
        #[arg(long)]
        name: Option<String>,
        /// Description.
        #[arg(long)]
        description: Option<String>,
        /// Comma-separated phase:agent pairs (e.g. spec:pm,implement:developer,review:reviewer).
        #[arg(long)]
        phases: String,
    },
    /// Delete a custom preset (soft-delete).
    Delete {
        /// Preset slug to delete.
        slug: String,
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
pub(crate) enum IdeCommands {
    /// Detect which editor would be used.
    Detect,
    /// Open a file in your editor.
    Open {
        /// File path to open.
        file: String,
        /// Line number to jump to.
        #[arg(long, short = 'l')]
        line: Option<u32>,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum DocsCommands {
    /// Generate a README skeleton from the current project.
    Readme {
        /// Write to file instead of stdout.
        #[arg(long, short = 'o')]
        output: Option<String>,
    },
    /// Generate a CHANGELOG from git history.
    Changelog {
        /// Only include commits since this tag.
        #[arg(long)]
        since: Option<String>,
    },
    /// Generate an Architecture Decision Record skeleton.
    Adr {
        /// Title of the ADR.
        title: String,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum TicketCommands {
    /// List tickets.
    List {
        /// Filter by status (open, in-progress, done, closed).
        #[arg(long)]
        status: Option<String>,
    },
    /// Create a new ticket.
    Create {
        /// Ticket title.
        title: String,
        /// Description of the ticket.
        #[arg(long, short = 'd')]
        description: Option<String>,
        /// Priority: low, medium, high, critical (default: medium).
        #[arg(long, short = 'p')]
        priority: Option<String>,
        /// Comma-separated tags.
        #[arg(long)]
        tags: Option<String>,
    },
    /// Show details of a ticket.
    Show {
        /// Ticket ID (prefix match).
        id: String,
    },
    /// Update ticket status.
    Update {
        /// Ticket ID (prefix match).
        id: String,
        /// New status: open, in-progress, done, closed.
        #[arg(long)]
        status: String,
    },
    /// Close a ticket.
    Close {
        /// Ticket ID (prefix match).
        id: String,
    },
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
            "Unknown preset '{}'. Valid: sdd, bmad, speckit, light, bugfix, release, strict, custom",
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

    #[test]
    fn parses_agent_sync_force() {
        let cli = Cli::try_parse_from(["koklo", "agent", "sync", "--force"]).unwrap();

        match cli.command {
            Commands::Agent(AgentCommands::Sync { force }) => {
                assert!(force);
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }
}
