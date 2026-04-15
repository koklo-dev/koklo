use super::*;

fn record(kind: &str, summary: &str) -> TranscriptItemRecord {
    TranscriptItemRecord {
        id: "id-1".to_string(),
        session_id: "session-1".to_string(),
        phase: Some("implement".to_string()),
        agent_name: Some("developer".to_string()),
        source: "agent".to_string(),
        kind: kind.to_string(),
        status: "streaming".to_string(),
        item_key: None,
        summary: summary.to_string(),
        payload_json: None,
        seq: 1,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    }
}

#[test]
fn merges_assistant_message_deltas_into_one_markdown_block() {
    let first = record("message_delta", "Hello ");
    let second = record("message_delta", "world");

    let model = build_transcript_render_model([&first, &second]);

    assert_eq!(model.blocks.len(), 1);
    assert!(matches!(
        &model.blocks[0].body,
        RenderBlockBody::Markdown(text) if text == "Hello world"
    ));
}

#[test]
fn renders_tool_call_from_canonical_payload() {
    let mut tool = record("tool_call", "Read Cargo.toml");
    tool.status = "pending".to_string();
    tool.payload_json = Some(
        serde_json::json!({
            "tool_name": "Read",
            "tool_kind": "read",
            "input_summary": "Cargo.toml",
        })
        .to_string(),
    );

    let model = build_transcript_render_model([&tool]);

    assert_eq!(model.blocks.len(), 1);
    assert!(matches!(
        &model.blocks[0].body,
        RenderBlockBody::Lines(lines) if lines == &vec!["● Read: Cargo.toml".to_string()]
    ));
}

#[test]
fn merges_command_updates_by_item_key() {
    let mut first = record("command", "cmd-1");
    first.item_key = Some("cmd-1".to_string());
    first.payload_json = Some(
        serde_json::json!({
            "command": "cmd-1",
            "output": "line 1\n",
        })
        .to_string(),
    );

    let mut second = record("command", "cargo test");
    second.item_key = Some("cmd-1".to_string());
    second.status = "completed".to_string();
    second.payload_json = Some(
        serde_json::json!({
            "command": "cargo test",
            "output": "line 2\n",
        })
        .to_string(),
    );

    let model = build_transcript_render_model([&first, &second]);

    assert_eq!(model.blocks.len(), 1);
    assert!(matches!(
        &model.blocks[0].body,
        RenderBlockBody::Lines(lines)
            if lines == &vec![
                "$ cargo test".to_string(),
                "  │ line 1".to_string(),
                "  │ line 2".to_string(),
            ]
    ));
}

#[test]
fn merges_file_change_updates_by_item_key() {
    let mut first = record("file_change", "src/lib.rs");
    first.item_key = Some("edit-1".to_string());
    first.payload_json = Some(
        serde_json::json!({
            "summary": "src/lib.rs",
            "changes": [{
                "path": "src/lib.rs",
                "kind": "update",
                "removed": ["old line"],
                "added": ["new line"]
            }]
        })
        .to_string(),
    );

    let mut second = record("file_change", "ok");
    second.item_key = Some("edit-1".to_string());
    second.status = "completed".to_string();
    second.payload_json = Some(
        serde_json::json!({
            "summary": "ok",
            "files": ["src/lib.rs"]
        })
        .to_string(),
    );

    let model = build_transcript_render_model([&first, &second]);

    assert_eq!(model.blocks.len(), 1);
    assert!(matches!(
        &model.blocks[0].body,
        RenderBlockBody::Lines(lines)
            if lines.iter().any(|line| line == "● Update(src/lib.rs)")
                && lines.iter().any(|line| line == "- old line")
                && lines.iter().any(|line| line == "+ new line")
    ));
}

#[test]
fn live_model_exposes_latest_assistant_thinking_and_activity() {
    let assistant = record("message_delta", "Final answer");
    let reasoning = record("reasoning", "Inspecting files");
    let mut tool = record("tool_call", "Read Cargo.toml");
    tool.payload_json = Some(
        serde_json::json!({
            "tool_name": "Read",
            "tool_kind": "read",
            "input_summary": "Cargo.toml",
        })
        .to_string(),
    );

    let model = build_transcript_render_model([&reasoning, &tool, &assistant]);
    let live = model.live_model();

    assert!(matches!(
        live.latest_assistant
            .as_ref()
            .and_then(|block| match &block.body {
                RenderBlockBody::Markdown(text) => Some(text.as_str()),
                _ => None,
            }),
        Some("Final answer")
    ));
    assert_eq!(
        live.latest_thinking.as_ref().map(|block| block.kind),
        Some(RenderBlockKind::Reasoning)
    );
    assert_eq!(
        live.latest_activity.as_ref().map(|block| block.kind),
        Some(RenderBlockKind::Tool)
    );
    assert_eq!(live.recent_activity.len(), 1);
    assert_eq!(live.recent_activity[0].kind, RenderBlockKind::Tool);
}

#[test]
fn live_model_prioritizes_recent_actionable_activity_over_lifecycle() {
    let mut command = record("command", "cargo test -p koklo-cli");
    command.item_key = Some("cmd-1".to_string());
    command.status = "completed".to_string();
    command.payload_json = Some(
        serde_json::json!({
            "command": "cargo test -p koklo-cli",
            "output": "ok\n",
        })
        .to_string(),
    );

    let mut lifecycle = record("phase_lifecycle", "phase implement completed");
    lifecycle.status = "completed".to_string();

    let model = build_transcript_render_model([&command, &lifecycle]);
    let live = model.live_model();

    assert_eq!(live.recent_activity.len(), 1);
    assert_eq!(live.recent_activity[0].kind, RenderBlockKind::Command);
    assert_eq!(
        live.latest_activity.as_ref().map(|block| block.kind),
        Some(RenderBlockKind::Command)
    );
}

#[test]
fn live_model_keeps_only_unresolved_pending_requests() {
    let mut approval_request = record("approval_request", "Approve command");
    approval_request.item_key = Some("approval-1".to_string());

    let mut approval_decision = record("approval_decision", "Approved");
    approval_decision.item_key = Some("approval-1".to_string());

    let mut user_input_request = record("user_input_request", "Need API key");
    user_input_request.item_key = Some("input-1".to_string());

    let model =
        build_transcript_render_model([&approval_request, &approval_decision, &user_input_request]);
    let live = model.live_model();

    assert_eq!(live.pending.len(), 1);
    assert_eq!(live.pending[0].source_kind, "user_input_request");
    assert_eq!(live.pending[0].item_key.as_deref(), Some("input-1"));
}

#[test]
fn file_change_payload_preserves_structured_diff_details() {
    let mut file_change = record("file_change", "updated renderer");
    file_change.status = "completed".to_string();
    file_change.payload_json = Some(
        serde_json::json!({
            "summary": "updated renderer",
            "files": ["apps/cli/src/monitor.rs"],
            "changes": [{
                "path": "apps/cli/src/monitor.rs",
                "kind": "update",
                "patch": "@@ -1,2 +1,2 @@\n-old line\n+new line"
            }]
        })
        .to_string(),
    );

    let model = build_transcript_render_model([&file_change]);

    assert!(matches!(
        &model.blocks[0].body,
        RenderBlockBody::Lines(lines)
            if lines.iter().any(|line| line == "● Update(apps/cli/src/monitor.rs)")
                && lines.iter().any(|line| line == "-old line")
                && lines.iter().any(|line| line == "+new line")
    ));
}
