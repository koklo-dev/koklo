use anyhow::Result;

use super::{
    AgentCommands, ArtifactsCommands, Cli, Commands, ConfigCommands, ContextCommands, DocsCommands,
    IdeCommands, InternalCommands, PresetCommands, ProviderCommands, SessionCommands,
    TicketCommands, WorkflowCommands,
};
use crate::commands;

pub(crate) async fn dispatch(cli: Cli) -> Result<()> {
    if let Some((command, phase)) = future_stub_info(&cli.command) {
        print_future_stub(command, phase);
        return Ok(());
    }

    match cli.command {
        Commands::Init { path, preset, yes } => commands::cmd_init(&path, preset, yes).await?,
        Commands::Start { title, yes } => commands::cmd_start(yes, title).await?,
        Commands::Run {
            preset,
            mode,
            pipeline_type,
            title,
            no_tui,
        } => commands::cmd_run(preset, mode, &pipeline_type, &title, no_tui).await?,

        Commands::Session(subcommand) => dispatch_session(subcommand).await?,
        Commands::Agent(subcommand) => dispatch_agent(subcommand).await?,
        Commands::Workflow(subcommand) => dispatch_workflow(subcommand).await?,
        Commands::Preset(subcommand) => dispatch_preset(subcommand).await?,
        Commands::Config(subcommand) => dispatch_config(subcommand).await?,
        Commands::Artifacts(subcommand) => dispatch_artifacts(subcommand).await?,
        Commands::Provider(subcommand) => dispatch_provider(subcommand).await?,

        Commands::Monitor {
            session,
            follow,
            project,
        } => commands::cmd_monitor(session, follow, project).await?,

        Commands::Context(subcommand) => dispatch_context(subcommand).await?,
        Commands::Docs(subcommand) => dispatch_docs(subcommand).await?,
        Commands::Ide(subcommand) => dispatch_ide(subcommand).await?,
        Commands::Tickets(subcommand) => dispatch_tickets(subcommand).await?,

        Commands::Status { session_id } => match session_id {
            Some(id) => commands::cmd_session_show(&id).await?,
            None => commands::cmd_session_list().await?,
        },
        Commands::Resume { session_id } => commands::cmd_session_resume(&session_id).await?,

        Commands::Deploy
        | Commands::Sync
        | Commands::Constellation
        | Commands::Marketplace
        | Commands::Voice => unreachable!("future stub commands are handled above"),

        Commands::Internal(subcommand) => match subcommand {
            InternalCommands::ClaudePermissionBridge { bridge_dir } => {
                crate::bridge::claude_permission::run_claude_permission_bridge(&bridge_dir)?
            }
        },
    }

    Ok(())
}

async fn dispatch_ide(command: IdeCommands) -> Result<()> {
    match command {
        IdeCommands::Detect => commands::cmd_ide_detect().await?,
        IdeCommands::Open { file, line } => commands::cmd_ide_open(&file, line).await?,
    }
    Ok(())
}

async fn dispatch_docs(command: DocsCommands) -> Result<()> {
    match command {
        DocsCommands::Readme { output } => commands::cmd_docs_readme(output).await?,
        DocsCommands::Changelog { since } => commands::cmd_docs_changelog(since).await?,
        DocsCommands::Adr { title } => commands::cmd_docs_adr(&title).await?,
    }
    Ok(())
}

async fn dispatch_tickets(command: TicketCommands) -> Result<()> {
    match command {
        TicketCommands::List { status } => commands::cmd_tickets_list(status).await?,
        TicketCommands::Create {
            title,
            description,
            priority,
            tags,
        } => commands::cmd_tickets_create(&title, description, priority, tags).await?,
        TicketCommands::Show { id } => commands::cmd_tickets_show(&id).await?,
        TicketCommands::Update { id, status } => commands::cmd_tickets_update(&id, &status).await?,
        TicketCommands::Close { id } => commands::cmd_tickets_close(&id).await?,
    }
    Ok(())
}

fn future_stub_info(command: &Commands) -> Option<(&'static str, &'static str)> {
    match command {
        Commands::Deploy => Some(("Deploy", "Phase 10 (Multi-provider Deployment)")),
        Commands::Sync => Some(("Sync", "Phase 12 (Cloud Collaboration)")),
        Commands::Constellation => Some(("Constellation", "Phase 9 (Git Visualisation)")),
        Commands::Marketplace => Some(("Marketplace", "Phase 11 (Agent Marketplace)")),
        Commands::Voice => Some(("Voice", "Phase 8 (Voice Input)")),
        _ => None,
    }
}

async fn dispatch_session(command: SessionCommands) -> Result<()> {
    match command {
        SessionCommands::List => commands::cmd_session_list().await?,
        SessionCommands::Show { id } => commands::cmd_session_show(&id).await?,
        SessionCommands::Resume { id } => commands::cmd_session_resume(&id).await?,
    }
    Ok(())
}

async fn dispatch_agent(command: AgentCommands) -> Result<()> {
    match command {
        AgentCommands::List => commands::cmd_agent_list().await?,
        AgentCommands::Sync { force } => commands::cmd_agent_sync(force).await?,
        AgentCommands::Show { name } => commands::cmd_agent_show(&name).await?,
        AgentCommands::Run { name, input } => commands::cmd_agent_run(&name, input).await?,
    }
    Ok(())
}

async fn dispatch_workflow(command: WorkflowCommands) -> Result<()> {
    match command {
        WorkflowCommands::List => commands::cmd_workflow_list(),
        WorkflowCommands::Show { preset } => commands::cmd_workflow_show(&preset)?,
    }
    Ok(())
}

async fn dispatch_config(command: ConfigCommands) -> Result<()> {
    match command {
        ConfigCommands::Show => commands::cmd_config_show().await?,
        ConfigCommands::Init { preset, yes } => commands::cmd_config_init(preset, yes).await?,
    }
    Ok(())
}

async fn dispatch_artifacts(command: ArtifactsCommands) -> Result<()> {
    match command {
        ArtifactsCommands::List { session_id } => commands::cmd_artifacts_list(&session_id).await?,
        ArtifactsCommands::Show { session_id, phase } => {
            commands::cmd_artifacts_show(&session_id, &phase).await?
        }
    }
    Ok(())
}

async fn dispatch_provider(command: ProviderCommands) -> Result<()> {
    match command {
        ProviderCommands::List => commands::cmd_provider_list().await?,
        ProviderCommands::Test { name } => commands::cmd_provider_test(&name).await?,
        ProviderCommands::Add {
            name,
            model,
            key_env,
            base_url,
            project,
        } => commands::cmd_provider_add(&name, model, key_env, base_url, project).await?,
        ProviderCommands::Remove { name, project } => {
            commands::cmd_provider_remove(&name, project).await?
        }
        ProviderCommands::SetDefault { name, project } => {
            commands::cmd_provider_set_default(&name, project).await?
        }
        ProviderCommands::Usage { name } => commands::cmd_provider_usage(name).await?,
    }
    Ok(())
}

async fn dispatch_context(command: ContextCommands) -> Result<()> {
    match command {
        ContextCommands::Show => commands::cmd_context_show().await?,
        ContextCommands::Init => commands::cmd_context_init().await?,
    }
    Ok(())
}

async fn dispatch_preset(command: PresetCommands) -> Result<()> {
    match command {
        PresetCommands::List => commands::cmd_preset_list().await?,
        PresetCommands::Show { slug } => commands::cmd_preset_show(&slug).await?,
        PresetCommands::Create {
            slug,
            name,
            description,
            phases,
        } => commands::cmd_preset_create(&slug, name, description, &phases).await?,
        PresetCommands::Delete { slug } => commands::cmd_preset_delete(&slug).await?,
    }
    Ok(())
}

fn print_future_stub(command: &str, phase: &str) {
    eprintln!("{command}: coming in {phase}. See roadmap at https://github.com/koklo-dev/koklo");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_stub_info_maps_expected_commands() {
        assert_eq!(
            future_stub_info(&Commands::Marketplace),
            Some(("Marketplace", "Phase 11 (Agent Marketplace)"))
        );
        assert_eq!(
            future_stub_info(&Commands::Deploy),
            Some(("Deploy", "Phase 10 (Multi-provider Deployment)"))
        );
        assert_eq!(
            future_stub_info(&Commands::Voice),
            Some(("Voice", "Phase 8 (Voice Input)"))
        );
    }

    #[test]
    fn future_stub_info_ignores_real_commands() {
        assert_eq!(
            future_stub_info(&Commands::Status { session_id: None }),
            None
        );
        assert_eq!(
            future_stub_info(&Commands::Resume {
                session_id: "sess-1".to_string()
            }),
            None
        );
    }
}
