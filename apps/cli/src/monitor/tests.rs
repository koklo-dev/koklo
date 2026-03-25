use super::{
    activity_card_lines, block_kind_label, format_status_line, live_card_title,
    live_overview_height, parse_command_action, select_live_overview_cards,
    style_file_change_lines, terminal_layout, timeline_section_header, timeline_window,
    CommandAction, LiveOverviewCardKind, Panel, TerminalLayout,
};
use crate::render::model::{
    RenderBlock, RenderBlockBody, RenderBlockKind, RenderTone, TranscriptLiveModel,
};
use ratatui::{layout::Rect, style::Color};
use std::path::PathBuf;

#[test]
fn parses_focus_command() {
    let parsed = parse_command_action("/focus log").unwrap();
    assert_eq!(parsed, Some(CommandAction::Focus(Panel::Log)));
}

#[test]
fn parses_workspace_command() {
    let parsed = parse_command_action("/workspace").unwrap();
    assert_eq!(parsed, Some(CommandAction::Workspace));
}

#[test]
fn parses_edit_command() {
    let parsed = parse_command_action("/edit docs/spec.md").unwrap();
    assert_eq!(
        parsed,
        Some(CommandAction::Edit(PathBuf::from("docs/spec.md")))
    );
}

#[test]
fn rejects_unknown_command() {
    let err = parse_command_action("/wat").unwrap_err();
    assert!(err.to_string().contains("Unknown command"));
}

#[test]
fn live_waiting_card_title_shows_count() {
    assert_eq!(live_card_title("WAITING", 3, None), "? WAITING (3)");
}

#[test]
fn timeline_header_uses_kind_label() {
    let header = timeline_section_header(RenderBlockKind::Command);
    assert!(header
        .spans
        .iter()
        .any(|span| span.content.contains("COMMANDS")));
    assert_eq!(block_kind_label(RenderBlockKind::FileChange), "Files");
}

#[test]
fn live_card_title_includes_block_label() {
    let block = RenderBlock {
        kind: RenderBlockKind::Reasoning,
        tone: RenderTone::Info,
        source_kind: "reasoning".to_string(),
        status: Some("streaming".to_string()),
        item_key: Some("r1".to_string()),
        seq: 10,
        created_at: None,
        body: RenderBlockBody::Lines(vec!["⋯ inspecting".to_string()]),
    };

    assert_eq!(
        live_card_title("THINKING", 0, Some(&block)),
        "⋯ THINKING · Reasoning"
    );
}

#[test]
fn activity_card_lines_show_recent_summaries() {
    let command = RenderBlock {
        kind: RenderBlockKind::Command,
        tone: RenderTone::Warning,
        source_kind: "command".to_string(),
        status: Some("completed".to_string()),
        item_key: Some("cmd-1".to_string()),
        seq: 1,
        created_at: Some("2026-01-01T12:00:00Z".to_string()),
        body: RenderBlockBody::Lines(vec!["$ cargo test -p koklo-cli".to_string()]),
    };
    let file_change = RenderBlock {
        kind: RenderBlockKind::FileChange,
        tone: RenderTone::Info,
        source_kind: "file_change".to_string(),
        status: Some("updated".to_string()),
        item_key: Some("patch-1".to_string()),
        seq: 2,
        created_at: Some("2026-01-01T12:00:01Z".to_string()),
        body: RenderBlockBody::Lines(vec!["Δ apps/cli/src/monitor.rs".to_string()]),
    };

    let lines = activity_card_lines(&[command, file_change], 3);
    let rendered = lines
        .iter()
        .map(|line| {
            line.spans
                .iter()
                .map(|span| span.content.as_ref())
                .collect::<String>()
        })
        .collect::<Vec<_>>();

    assert!(rendered[0].contains("cargo test -p koklo-cli"));
    assert!(rendered[1].contains("apps/cli/src/monitor.rs"));
}

#[test]
fn overview_hides_stale_completed_assistant_and_activity() {
    let assistant = RenderBlock {
        kind: RenderBlockKind::Assistant,
        tone: RenderTone::Default,
        source_kind: "message_delta".to_string(),
        status: Some("completed".to_string()),
        item_key: Some("a1".to_string()),
        seq: 5,
        created_at: None,
        body: RenderBlockBody::Markdown("Final answer".to_string()),
    };
    let activity = RenderBlock {
        kind: RenderBlockKind::Command,
        tone: RenderTone::Warning,
        source_kind: "command".to_string(),
        status: Some("completed".to_string()),
        item_key: Some("cmd-1".to_string()),
        seq: 4,
        created_at: None,
        body: RenderBlockBody::Lines(vec!["$ cargo test".to_string()]),
    };
    let live = TranscriptLiveModel {
        latest_assistant: Some(assistant),
        latest_activity: Some(activity.clone()),
        recent_activity: vec![activity],
        ..TranscriptLiveModel::default()
    };

    let cards = select_live_overview_cards(&live);
    assert!(cards.is_empty());
    assert_eq!(live_overview_height(&cards), 0);
}

#[test]
fn overview_prefers_newer_activity_over_completed_assistant() {
    let assistant = RenderBlock {
        kind: RenderBlockKind::Assistant,
        tone: RenderTone::Default,
        source_kind: "message_delta".to_string(),
        status: Some("completed".to_string()),
        item_key: Some("a1".to_string()),
        seq: 5,
        created_at: None,
        body: RenderBlockBody::Markdown("Final answer".to_string()),
    };
    let activity = RenderBlock {
        kind: RenderBlockKind::Command,
        tone: RenderTone::Warning,
        source_kind: "command".to_string(),
        status: Some("completed".to_string()),
        item_key: Some("cmd-2".to_string()),
        seq: 6,
        created_at: None,
        body: RenderBlockBody::Lines(vec!["$ cargo fmt".to_string()]),
    };
    let live = TranscriptLiveModel {
        latest_assistant: Some(assistant),
        latest_activity: Some(activity.clone()),
        recent_activity: vec![activity],
        ..TranscriptLiveModel::default()
    };

    assert_eq!(
        select_live_overview_cards(&live),
        vec![LiveOverviewCardKind::Activity]
    );
}

#[test]
fn overview_keeps_waiting_and_primary_live_card_only() {
    let waiting = RenderBlock {
        kind: RenderBlockKind::Approval,
        tone: RenderTone::Warning,
        source_kind: "approval_request".to_string(),
        status: Some("pending".to_string()),
        item_key: Some("approval-1".to_string()),
        seq: 7,
        created_at: None,
        body: RenderBlockBody::Lines(vec!["? Approve".to_string()]),
    };
    let assistant = RenderBlock {
        kind: RenderBlockKind::Assistant,
        tone: RenderTone::Default,
        source_kind: "message_delta".to_string(),
        status: Some("streaming".to_string()),
        item_key: Some("a2".to_string()),
        seq: 8,
        created_at: None,
        body: RenderBlockBody::Markdown("Working".to_string()),
    };
    let live = TranscriptLiveModel {
        latest_assistant: Some(assistant),
        pending: vec![waiting],
        ..TranscriptLiveModel::default()
    };

    assert_eq!(
        select_live_overview_cards(&live),
        vec![
            LiveOverviewCardKind::Waiting,
            LiveOverviewCardKind::Assistant
        ]
    );
    assert_eq!(live_overview_height(&select_live_overview_cards(&live)), 7);
}

#[test]
fn phase_status_rank_orders_correctly() {
    use super::phase_status_rank;
    assert!(phase_status_rank("running") > phase_status_rank("pending"));
    assert!(phase_status_rank("completed") > phase_status_rank("running"));
    assert!(phase_status_rank("failed") > phase_status_rank("running"));
    assert_eq!(phase_status_rank("completed"), phase_status_rank("failed"));
}

#[test]
fn timeline_window_follows_live_tail_by_default() {
    assert_eq!(timeline_window(20, 5, 0), (15, 20, 0));
}

#[test]
fn timeline_window_clamps_history_scroll() {
    assert_eq!(timeline_window(20, 5, 999), (0, 5, 15));
}

#[test]
fn timeline_window_handles_empty_or_tiny_viewports() {
    assert_eq!(timeline_window(0, 5, 3), (0, 0, 0));
    assert_eq!(timeline_window(8, 0, 3), (0, 0, 0));
}

#[test]
fn terminal_layout_switches_at_small_sizes() {
    assert_eq!(
        terminal_layout(Rect::new(0, 0, 140, 40)),
        TerminalLayout::Wide
    );
    assert_eq!(
        terminal_layout(Rect::new(0, 0, 90, 28)),
        TerminalLayout::Stacked
    );
    assert_eq!(
        terminal_layout(Rect::new(0, 0, 60, 20)),
        TerminalLayout::Compact
    );
}

#[test]
fn status_line_prioritizes_core_information_when_narrow() {
    let text = format_status_line(
        28,
        "LIVE",
        None,
        "[q] quit  [Tab] next panel",
        Some("Tokens: 120"),
    );
    assert!(text.contains("LIVE"));
    assert!(!text.contains("Tokens: 120"));
}

#[test]
fn file_change_lines_highlight_additions_and_removals() {
    let lines = style_file_change_lines(&[
        "● Update(src/lib.rs)".to_string(),
        "- old line".to_string(),
        "+ new line".to_string(),
    ]);

    assert_eq!(lines[1].spans[0].style.fg, Some(Color::Red));
    assert_eq!(lines[2].spans[0].style.fg, Some(Color::Green));
}

#[test]
fn bus_phase_override_survives_db_rebuild() {
    use koklo_storage::PhaseRecord;
    use std::collections::HashMap;

    // Simulate: bus says "spec" is running, but DB hasn't caught up yet.
    let preset_phases = ["spec".to_string(), "dev".to_string()];
    let bus_phase_status: HashMap<String, (String, Option<String>)> = {
        let mut m = HashMap::new();
        m.insert(
            "spec".to_string(),
            (
                "running".to_string(),
                Some("2026-01-01T00:00:00Z".to_string()),
            ),
        );
        m
    };

    // DB returns no phases (not yet inserted).
    let db_phases: Vec<PhaseRecord> = vec![];

    // Rebuild from preset (same logic as tick())
    let db_map: HashMap<String, PhaseRecord> = db_phases
        .into_iter()
        .map(|p| (p.phase.clone(), p))
        .collect();
    let mut phases: Vec<PhaseRecord> = preset_phases
        .iter()
        .map(|name| {
            db_map.get(name).cloned().unwrap_or_else(|| PhaseRecord {
                id: format!("pending-{}", name),
                session_id: "test-session".to_string(),
                phase: name.clone(),
                status: "pending".to_string(),
                started_at: None,
                completed_at: None,
                error: None,
            })
        })
        .collect();

    // Re-apply bus overrides
    for phase in &mut phases {
        if let Some((bus_status, bus_started_at)) = bus_phase_status.get(&phase.phase) {
            if super::phase_status_rank(bus_status) > super::phase_status_rank(&phase.status) {
                phase.status = bus_status.clone();
                if bus_status == "running" && phase.started_at.is_none() {
                    phase.started_at = bus_started_at.clone();
                }
            }
        }
    }

    assert_eq!(phases[0].phase, "spec");
    assert_eq!(phases[0].status, "running");
    assert!(phases[0].started_at.is_some());
    assert_eq!(phases[1].phase, "dev");
    assert_eq!(phases[1].status, "pending");
}
