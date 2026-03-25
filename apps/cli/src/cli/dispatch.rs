use anyhow::Result;

use super::{
    AgentCommands, ArtifactsCommands, Cli, Commands, ConfigCommands, ContextCommands,
    InternalCommands, ProviderCommands, SessionCommands, WorkflowCommands,
};
use crate::commands;

pub(crate) async fn dispatch(cli: Cli) -> Result<()> {
    if let Some((command, phase)) = future_stub_info(&cli.command) {
        print_future_stub(command, phase);
        return Ok(());
    }

    match cli.command {
        Commands::Init { path, preset, yes } => commands::cmd_init(&path, preset, yes).await?,
        Commands::Run {
            preset,
            pipeline_type,
            title,
            no_tui,
        } => commands::cmd_run(preset, &pipeline_type, &title, no_tui).await?,

        Commands::Session(subcommand) => dispatch_session(subcommand).await?,
        Commands::Agent(subcommand) => dispatch_agent(subcommand).await?,
        Commands::Workflow(subcommand) => dispatch_workflow(subcommand).await?,
        Commands::Config(subcommand) => dispatch_config(subcommand).await?,
        Commands::Artifacts(subcommand) => dispatch_artifacts(subcommand).await?,
        Commands::Provider(subcommand) => dispatch_provider(subcommand).await?,

        Commands::Monitor {
            session,
            follow,
            project,
        } => commands::cmd_monitor(session, follow, project).await?,

        Commands::Context(subcommand) => dispatch_context(subcommand).await?,

        Commands::Status { session_id } => match session_id {
            Some(id) => commands::cmd_session_show(&id).await?,
            None => commands::cmd_session_list().await?,
        },
        Commands::Resume { session_id } => commands::cmd_session_resume(&session_id).await?,

        Commands::Tickets
        | Commands::Deploy
        | Commands::Sync
        | Commands::Constellation
        | Commands::Marketplace
        | Commands::Voice
        | Commands::Ide => unreachable!("future stub commands are handled above"),

        Commands::Internal(subcommand) => match subcommand {
            InternalCommands::ClaudePermissionBridge { bridge_dir } => {
                crate::bridge::claude_permission::run_claude_permission_bridge(&bridge_dir)?
            }
        },
    }

    Ok(())
}

fn future_stub_info(command: &Commands) -> Option<(&'static str, &'static str)> {
    match command {
        Commands::Tickets => Some(("Tickets", "Phase 5 (Integrated Ticketing)")),
        Commands::Deploy => Some(("Deploy", "Phase 10 (Multi-provider Deployment)")),
        Commands::Sync => Some(("Sync", "Phase 12 (Cloud Collaboration)")),
        Commands::Constellation => Some(("Constellation", "Phase 9 (Git Visualisation)")),
        Commands::Marketplace => Some(("Marketplace", "Phase 11 (Agent Marketplace)")),
        Commands::Voice => Some(("Voice", "Phase 8 (Voice Input)")),
        Commands::Ide => Some(("IDE Bridge", "Phase 7 (IDE Integration)")),
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

fn print_future_stub(command: &str, phase: &str) {
    eprintln!("{command}: coming in {phase}. See roadmap at https://github.com/koklo-dev/koklo");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_stub_info_maps_expected_commands() {
        assert_eq!(
            future_stub_info(&Commands::Tickets),
            Some(("Tickets", "Phase 5 (Integrated Ticketing)"))
        );
        assert_eq!(
            future_stub_info(&Commands::Ide),
            Some(("IDE Bridge", "Phase 7 (IDE Integration)"))
        );
        assert_eq!(
            future_stub_info(&Commands::Marketplace),
            Some(("Marketplace", "Phase 11 (Agent Marketplace)"))
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
