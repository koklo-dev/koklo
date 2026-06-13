use crate::cli::RunMode;
use anyhow::Result;
use koklo_events::{GateChannel, UserInputChannel};
use koklo_workflow_engine::{
    presets::{phases_for_preset, PresetKind},
    AutoApproveGateHandler, GateHandler, PipelineUserInputHandler, StdinGateHandler,
    TuiGateHandler, TuiUserInputHandler,
};
use std::sync::Arc;

use crate::{build_orchestrator_with_gate, monitor, open_storage};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ComplexityBand {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ComplexityAssessment {
    band: ComplexityBand,
    score: u8,
    reasons: Vec<&'static str>,
}

pub(crate) async fn cmd_run(
    preset: PresetKind,
    mode: RunMode,
    pipeline_type: &str,
    title: &str,
    no_tui: bool,
) -> Result<()> {
    koklo_agent_runtime::set_reasoning_visibility(matches!(mode, RunMode::Deep));
    configure_non_interactive_provider_overrides(no_tui || std::env::var("CI").is_ok());

    match pipeline_type {
        "feature" | "task" | "bug" => {}
        other => {
            anyhow::bail!(
                "Unknown pipeline type '{}'. Supported: feature, task, bug",
                other
            );
        }
    }

    let execution_preset = resolve_execution_preset(preset, mode, pipeline_type, title);
    if execution_preset != preset {
        println!(
            "Preset auto-routed: {} -> {} ({})",
            preset,
            execution_preset,
            routing_reason(preset, execution_preset, pipeline_type, title)
        );
    }

    if no_tui || std::env::var("CI").is_ok() {
        let gate_handler: Arc<dyn GateHandler> =
            match std::env::var("KOKLO_NO_TUI_GATE_MODE").ok().as_deref() {
                Some("stdin") => Arc::new(StdinGateHandler),
                _ => Arc::new(AutoApproveGateHandler),
            };
        let user_input_handler: Arc<dyn PipelineUserInputHandler> =
            Arc::new(koklo_workflow_engine::StdinUserInputHandler);
        let orchestrator = build_orchestrator_with_gate(
            None,
            Some(execution_preset),
            gate_handler,
            user_input_handler,
        )
        .await?;
        let artifacts_dir = orchestrator.artifacts_dir().to_path_buf();
        let session_id = orchestrator
            .run_feature_with_preset(title, execution_preset)
            .await?;
        let storage = open_storage().await?;
        let session = storage.get_session(&session_id).await?;
        print_completion(&session_id, session.as_ref(), &artifacts_dir);
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
        build_orchestrator_with_gate(
            None,
            Some(execution_preset),
            gate_handler,
            user_input_handler,
        )
        .await?
    };

    let event_rx = orchestrator.event_bus().subscribe();
    let storage = orchestrator.storage_handle();
    let storage_for_summary = Arc::clone(&storage);
    let artifacts_dir = orchestrator.artifacts_dir().to_path_buf();

    koklo_agent_runtime::set_stdout_streaming_enabled(false);

    let title_owned = title.to_string();
    let pipeline = tokio::spawn(async move {
        orchestrator
            .run_feature_with_preset(&title_owned, execution_preset)
            .await
    });

    let preset_phase_names: Vec<String> = phases_for_preset(execution_preset)
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
            let session = storage_for_summary
                .get_session(&session_id)
                .await
                .ok()
                .flatten();
            print_completion(&session_id, session.as_ref(), &artifacts_dir);
            Ok(())
        }
        // Propagate failures so the process exits non-zero (CI/scripting can
        // detect them) instead of printing an error and exiting 0.
        Ok(Err(error)) => {
            eprintln!("\nPipeline error: {}", error);
            Err(error)
        }
        Err(error) => {
            eprintln!("\nPipeline task panicked: {}", error);
            Err(anyhow::anyhow!("pipeline task panicked: {error}"))
        }
    }
}

/// Print the end-of-run summary: session id, workspace, branch, and where the
/// generated artifacts landed in the user's project.
fn print_completion(
    session_id: &str,
    session: Option<&koklo_storage::Session>,
    artifacts_dir: &std::path::Path,
) {
    let Some(session) = session else {
        println!("\nPipeline complete — session: {}", session_id);
        return;
    };
    let branch = if session.workspace_branch.is_empty() {
        "(shared project tree)"
    } else {
        &session.workspace_branch
    };
    let artifacts_location = if artifacts_dir.is_absolute() {
        artifacts_dir.to_path_buf()
    } else {
        std::path::Path::new(&session.project_path).join(artifacts_dir)
    };
    println!(
        "\nPipeline complete — session: {}\nWorkspace: {}\nBranch: {}\nArtifacts: {}",
        session_id,
        session.workspace_path,
        branch,
        artifacts_location.display(),
    );
}

fn configure_non_interactive_provider_overrides(non_interactive: bool) {
    if !non_interactive {
        return;
    }
    if std::env::var("KOKLO_ENABLE_CLAUDE_PERMISSION_BRIDGE").is_ok() {
        return;
    }
    std::env::set_var("KOKLO_DISABLE_CLAUDE_PERMISSION_BRIDGE", "1");
}

fn resolve_execution_preset(
    requested: PresetKind,
    mode: RunMode,
    pipeline_type: &str,
    title: &str,
) -> PresetKind {
    let assessment = assess_complexity(pipeline_type, title);
    match mode {
        RunMode::Standard | RunMode::Deep => requested,
        RunMode::Patch => patch_mode_preset(pipeline_type),
        RunMode::Review => PresetKind::Review,
        RunMode::Audit => PresetKind::Audit,
        RunMode::Short => short_mode_preset(requested, pipeline_type, &assessment),
        RunMode::Auto => auto_mode_preset(requested, pipeline_type, &assessment),
    }
}

fn patch_mode_preset(pipeline_type: &str) -> PresetKind {
    match pipeline_type {
        "bug" => PresetKind::Bugfix,
        _ => PresetKind::Light,
    }
}

fn auto_mode_preset(
    requested: PresetKind,
    pipeline_type: &str,
    assessment: &ComplexityAssessment,
) -> PresetKind {
    match requested {
        PresetKind::Sdd | PresetKind::Custom => match pipeline_type {
            "bug" => PresetKind::Bugfix,
            "task" if assessment.band == ComplexityBand::Small => PresetKind::Light,
            "feature" if assessment.band == ComplexityBand::Small => PresetKind::Light,
            _ => requested,
        },
        _ => requested,
    }
}

fn short_mode_preset(
    requested: PresetKind,
    pipeline_type: &str,
    assessment: &ComplexityAssessment,
) -> PresetKind {
    match pipeline_type {
        "bug" => PresetKind::Bugfix,
        "task" => PresetKind::Light,
        "feature" => {
            if requested == PresetKind::Release {
                PresetKind::Release
            } else if requested == PresetKind::Bugfix {
                PresetKind::Bugfix
            } else if assessment.band == ComplexityBand::Large {
                requested
            } else {
                PresetKind::Light
            }
        }
        _ => requested,
    }
}

fn assess_complexity(pipeline_type: &str, title: &str) -> ComplexityAssessment {
    let lower = title.to_ascii_lowercase();
    let word_count = title.split_whitespace().count();
    let char_count = title.chars().count();
    let strong_keywords = [
        "migration",
        "refactor",
        "architecture",
        "security",
        "oauth",
        "payment",
        "database",
        "infra",
        "deploy",
        "integration",
        "multi-tenant",
        "multi tenant",
        "schema",
        "permissions",
        "authorization",
        "authentication",
        "billing",
        "queue",
        "worker",
    ];
    let medium_keywords = [
        "api",
        "endpoint",
        "dashboard",
        "filter",
        "search",
        "pagination",
        "cache",
        "retry",
        "upload",
        "export",
        "import",
        "form",
    ];
    let mut score: u8 = match pipeline_type {
        "bug" => 1,
        "task" => 0,
        "feature" => 1,
        _ => 0,
    };
    let mut reasons = Vec::new();

    if char_count > 72 || word_count > 10 {
        score += 1;
        reasons.push("long request");
    }
    if char_count > 120 || word_count > 16 {
        score += 1;
        reasons.push("very long request");
    }
    if title.contains(':') || title.contains(',') || title.contains(" and ") {
        score += 1;
        reasons.push("multi-part scope");
    }
    if strong_keywords.iter().any(|needle| lower.contains(needle)) {
        score += 2;
        reasons.push("high-risk keyword");
    } else if medium_keywords.iter().any(|needle| lower.contains(needle)) {
        score += 1;
        reasons.push("medium-complexity keyword");
    }
    if lower.contains("fix") && pipeline_type == "bug" && word_count <= 6 {
        score = score.saturating_sub(1);
        reasons.push("tight bug scope");
    }

    let band = if score >= 4 {
        ComplexityBand::Large
    } else if score >= 2 {
        ComplexityBand::Medium
    } else {
        ComplexityBand::Small
    };

    ComplexityAssessment {
        band,
        score,
        reasons,
    }
}

fn routing_reason(
    requested: PresetKind,
    actual: PresetKind,
    pipeline_type: &str,
    title: &str,
) -> String {
    let assessment = assess_complexity(pipeline_type, title);
    if requested == actual {
        return "unchanged".to_string();
    }
    if pipeline_type == "bug" && actual == PresetKind::Bugfix {
        return "bug flow".to_string();
    }
    if actual == PresetKind::Review {
        return "review mode".to_string();
    }
    if actual == PresetKind::Audit {
        return "audit mode".to_string();
    }
    if actual == PresetKind::Light && assessment.band == ComplexityBand::Small {
        return format!("small complexity score {}", assessment.score);
    }
    if !assessment.reasons.is_empty() {
        return format!(
            "complexity score {} ({})",
            assessment.score,
            assessment.reasons.join(", ")
        );
    }
    "execution mode".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_mode_routes_small_task_to_light() {
        assert_eq!(
            resolve_execution_preset(PresetKind::Sdd, RunMode::Auto, "task", "Fix typo in README"),
            PresetKind::Light
        );
    }

    #[test]
    fn auto_mode_routes_bug_to_bugfix() {
        assert_eq!(
            resolve_execution_preset(PresetKind::Sdd, RunMode::Auto, "bug", "Fix login crash"),
            PresetKind::Bugfix
        );
    }

    #[test]
    fn auto_mode_keeps_complex_feature_on_sdd() {
        assert_eq!(
            resolve_execution_preset(
                PresetKind::Sdd,
                RunMode::Auto,
                "feature",
                "Refactor payment integration architecture"
            ),
            PresetKind::Sdd
        );
    }

    #[test]
    fn short_mode_forces_light_for_simple_feature() {
        assert_eq!(
            resolve_execution_preset(
                PresetKind::Bmad,
                RunMode::Short,
                "feature",
                "Add button label"
            ),
            PresetKind::Light
        );
    }

    #[test]
    fn complexity_assessment_detects_large_scope() {
        let assessment = assess_complexity(
            "feature",
            "Refactor payment integration architecture and database migration",
        );
        assert_eq!(assessment.band, ComplexityBand::Large);
        assert!(assessment.score >= 4);
    }

    #[test]
    fn complexity_assessment_detects_small_bug_scope() {
        let assessment = assess_complexity("bug", "Fix login typo");
        assert_eq!(assessment.band, ComplexityBand::Small);
    }

    #[test]
    fn routing_reason_mentions_complexity_score() {
        let reason = routing_reason(
            PresetKind::Sdd,
            PresetKind::Light,
            "task",
            "Fix typo in README",
        );
        assert!(reason.contains("small complexity score"));
    }

    #[test]
    fn patch_mode_routes_to_minimal_presets() {
        assert_eq!(
            resolve_execution_preset(
                PresetKind::Bmad,
                RunMode::Patch,
                "feature",
                "Change CTA copy"
            ),
            PresetKind::Light
        );
        assert_eq!(
            resolve_execution_preset(PresetKind::Sdd, RunMode::Patch, "bug", "Fix crash"),
            PresetKind::Bugfix
        );
    }

    #[test]
    fn review_mode_routes_to_review_preset() {
        assert_eq!(
            resolve_execution_preset(
                PresetKind::Sdd,
                RunMode::Review,
                "feature",
                "Review current changes"
            ),
            PresetKind::Review
        );
    }

    #[test]
    fn audit_mode_routes_to_audit_preset() {
        assert_eq!(
            resolve_execution_preset(PresetKind::Light, RunMode::Audit, "task", "Audit auth flow"),
            PresetKind::Audit
        );
    }

    #[test]
    fn non_interactive_run_disables_claude_permission_bridge_by_default() {
        std::env::remove_var("KOKLO_ENABLE_CLAUDE_PERMISSION_BRIDGE");
        std::env::remove_var("KOKLO_DISABLE_CLAUDE_PERMISSION_BRIDGE");
        configure_non_interactive_provider_overrides(true);
        assert_eq!(
            std::env::var("KOKLO_DISABLE_CLAUDE_PERMISSION_BRIDGE")
                .ok()
                .as_deref(),
            Some("1")
        );
        std::env::remove_var("KOKLO_DISABLE_CLAUDE_PERMISSION_BRIDGE");
    }
}
