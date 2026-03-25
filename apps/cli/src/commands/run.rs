use anyhow::Result;
use koklo_events::{GateChannel, UserInputChannel};
use koklo_workflow_engine::{
    presets::{phases_for_preset, PresetKind},
    GateHandler, PipelineUserInputHandler, TuiGateHandler, TuiUserInputHandler,
};
use std::sync::Arc;

use crate::{build_orchestrator, build_orchestrator_with_gate, monitor, open_storage};

pub(crate) async fn cmd_run(
    preset: PresetKind,
    pipeline_type: &str,
    title: &str,
    no_tui: bool,
) -> Result<()> {
    match pipeline_type {
        "feature" | "task" | "bug" => {}
        other => {
            anyhow::bail!(
                "Unknown pipeline type '{}'. Supported: feature, task, bug",
                other
            );
        }
    }

    if no_tui || std::env::var("CI").is_ok() {
        let orchestrator = build_orchestrator(None, Some(preset)).await?;
        let session_id = orchestrator.run_feature_with_preset(title, preset).await?;
        let storage = open_storage().await?;
        if let Some(session) = storage.get_session(&session_id).await? {
            println!(
                "\nPipeline complete — session: {}\nWorkspace: {}\nBranch: {}",
                session_id,
                session.workspace_path,
                if session.workspace_branch.is_empty() {
                    "(shared project tree)"
                } else {
                    &session.workspace_branch
                }
            );
        } else {
            println!("\nPipeline complete — session: {}", session_id);
        }
        return Ok(());
    }

    let gate_channel = GateChannel::new();
    let tui_gate_channel = gate_channel.clone_handle();
    let user_input_channel = UserInputChannel::new();
    let tui_user_input_channel = user_input_channel.clone_handle();

    let orchestrator = {
        let gate_handler: Arc<dyn GateHandler> = Arc::new(TuiGateHandler::new(gate_channel));
        let user_input_handler: Arc<dyn PipelineUserInputHandler> =
            Arc::new(TuiUserInputHandler::new(user_input_channel));
        build_orchestrator_with_gate(None, Some(preset), gate_handler, user_input_handler).await?
    };

    let event_rx = orchestrator.event_bus().subscribe();
    let storage = orchestrator.storage_handle();

    koklo_agent_runtime::set_stdout_streaming_enabled(false);

    let title_owned = title.to_string();
    let pipeline = tokio::spawn(async move {
        orchestrator
            .run_feature_with_preset(&title_owned, preset)
            .await
    });

    let preset_phase_names: Vec<String> = phases_for_preset(preset)
        .into_iter()
        .map(|(phase, _)| phase.to_string())
        .collect();
    monitor::run_integrated_tui(
        storage,
        Some(event_rx),
        Some(tui_gate_channel),
        Some(tui_user_input_channel),
        preset_phase_names,
    )
    .await?;

    match pipeline.await {
        Ok(Ok(session_id)) => {
            println!("\nPipeline complete — session: {}", session_id);
        }
        Ok(Err(error)) => {
            eprintln!("\nPipeline error: {}", error);
        }
        Err(error) => {
            eprintln!("\nPipeline task panicked: {}", error);
        }
    }

    Ok(())
}
