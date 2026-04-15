use super::*;
use koklo_providers::ProviderApprovalKind;
use serde_json::json;

fn render_provider_events(agent_name: &str, events: Vec<ProviderEvent>) -> String {
    let mut engine = PlainRenderEngine::new(true);
    let mut rendered = String::new();

    for (idx, event) in events.into_iter().enumerate() {
        rendered.push_str(&engine.push_record(provider_event_to_record(
            event,
            (idx + 1) as i64,
            Some(agent_name),
        )));
    }

    rendered
}

#[test]
fn incremental_markdown_only_prints_new_suffix() {
    let mut engine = PlainRenderEngine::new(true);
    let first = TranscriptItemRecord {
        id: "1".to_string(),
        session_id: "s".to_string(),
        phase: None,
        agent_name: Some("agent".to_string()),
        source: "agent".to_string(),
        kind: "message_delta".to_string(),
        status: "streaming".to_string(),
        item_key: None,
        summary: "Hello ".to_string(),
        payload_json: None,
        seq: 1,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    let second = TranscriptItemRecord {
        seq: 2,
        summary: "world".to_string(),
        id: "2".to_string(),
        ..first.clone()
    };

    assert_eq!(engine.push_record(first), "Hello ");
    assert_eq!(engine.push_record(second), "world");
}

#[test]
fn provider_event_record_uses_request_id_for_approvals() {
    let record = provider_event_to_record(
        ProviderEvent::ApprovalRequest {
            item_id: Some("item-1".to_string()),
            request_id: "approval-1".to_string(),
            kind: ProviderApprovalKind::CommandExecution,
            description: "Approve command".to_string(),
            details: serde_json::json!({}),
        },
        1,
        Some("agent"),
    );

    assert_eq!(record.kind, "approval_request");
    assert_eq!(record.item_key.as_deref(), Some("approval-1"));
}

#[test]
fn snapshot_codex_live_render() {
    let output = render_provider_events(
        "codex",
        vec![
            ProviderEvent::Reasoning {
                item_id: Some("reason-1".to_string()),
                text: "Inspecting workspace state".to_string(),
            },
            ProviderEvent::Plan {
                item_id: Some("plan-1".to_string()),
                text: "[ ] inspect files\n[x] update renderer".to_string(),
            },
            ProviderEvent::ToolCall {
                item_id: Some("tool-1".to_string()),
                tool_name: "Read".to_string(),
                input_summary: "apps/cli/src/monitor.rs".to_string(),
            },
            ProviderEvent::ToolResult {
                item_id: Some("tool-1".to_string()),
                tool_name: "Read".to_string(),
                output_summary: "loaded file".to_string(),
                success: Some(true),
            },
            ProviderEvent::Command {
                item_id: Some("cmd-1".to_string()),
                command: "cargo test -p koklo-cli".to_string(),
                status: "in_progress".to_string(),
                exit_code: None,
                output: Some("running tests\n".to_string()),
                details: None,
            },
            ProviderEvent::Command {
                item_id: Some("cmd-1".to_string()),
                command: "cargo test -p koklo-cli".to_string(),
                status: "completed".to_string(),
                exit_code: Some(0),
                output: Some("test result: ok\n".to_string()),
                details: None,
            },
            ProviderEvent::FileChange {
                item_id: Some("edit-1".to_string()),
                summary: "updated monitor and renderer".to_string(),
                files: vec![
                    "apps/cli/src/monitor.rs".to_string(),
                    "apps/cli/src/render_model.rs".to_string(),
                ],
                status: "completed".to_string(),
                details: None,
            },
            ProviderEvent::MessageDelta {
                text: "Lot 5 snapshot coverage is in place.".to_string(),
            },
            ProviderEvent::MessageCompleted,
        ],
    );

    let expected = "\
[00:00:00] │ Inspecting workspace state
[00:00:00] ☰ [ ] inspect files
[00:00:00] ☰ [x] update renderer
[00:00:00] ● Read: apps/cli/src/monitor.rs
[00:00:00]   → Read loaded file
[00:00:00] $ cargo test -p koklo-cli
[00:00:00]   │ running tests
[00:00:00]   │ test result: ok
[00:00:00] Δ updated monitor and renderer
[00:00:00] Δ apps/cli/src/monitor.rs
[00:00:00] Δ apps/cli/src/render_model.rs
Lot 5 snapshot coverage is in place.";

    assert_eq!(normalize_snapshot(&output), expected);
}

#[test]
fn snapshot_claude_live_render() {
    let output = render_provider_events(
        "claude",
        vec![
            ProviderEvent::ToolCall {
                item_id: Some("tool-1".to_string()),
                tool_name: "Read".to_string(),
                input_summary: "apps/cli/src/monitor.rs".to_string(),
            },
            ProviderEvent::ToolResult {
                item_id: Some("tool-1".to_string()),
                tool_name: "Read".to_string(),
                output_summary: "loaded file".to_string(),
                success: Some(true),
            },
            ProviderEvent::ToolCall {
                item_id: Some("tool-2".to_string()),
                tool_name: "Bash".to_string(),
                input_summary: "cargo test -p koklo-cli".to_string(),
            },
            ProviderEvent::ToolResult {
                item_id: Some("tool-2".to_string()),
                tool_name: "Bash".to_string(),
                output_summary: "completed".to_string(),
                success: Some(true),
            },
            ProviderEvent::FileChange {
                item_id: Some("edit-1".to_string()),
                summary: "updated monitor and renderer".to_string(),
                files: vec![
                    "apps/cli/src/monitor.rs".to_string(),
                    "apps/cli/src/render_model.rs".to_string(),
                ],
                status: "completed".to_string(),
                details: None,
            },
            ProviderEvent::MessageDelta {
                text: "Lot 5 snapshot coverage is in place.".to_string(),
            },
            ProviderEvent::MessageCompleted,
        ],
    );

    let expected = "\
[00:00:00] ● Read: apps/cli/src/monitor.rs
[00:00:00]   → Read loaded file
[00:00:00] ● Run: cargo test -p koklo-cli
[00:00:00]   → Bash completed
[00:00:00] Δ updated monitor and renderer
[00:00:00] Δ apps/cli/src/monitor.rs
[00:00:00] Δ apps/cli/src/render_model.rs
Lot 5 snapshot coverage is in place.";

    assert_eq!(normalize_snapshot(&output), expected);
}

#[test]
fn snapshot_openrouter_and_ollama_text_render_match() {
    let openrouter = render_provider_events(
        "openrouter",
        vec![
            ProviderEvent::MessageDelta {
                text: "Reviewing the current pipeline output.\n".to_string(),
            },
            ProviderEvent::MessageDelta {
                text: "I can summarize the next step.".to_string(),
            },
            ProviderEvent::MessageCompleted,
        ],
    );
    let ollama = render_provider_events(
        "ollama",
        vec![
            ProviderEvent::MessageDelta {
                text: "Reviewing the current pipeline output.\n".to_string(),
            },
            ProviderEvent::MessageDelta {
                text: "I can summarize the next step.".to_string(),
            },
            ProviderEvent::MessageCompleted,
        ],
    );

    let expected = "Reviewing the current pipeline output.\nI can summarize the next step.";
    assert_eq!(normalize_snapshot(&openrouter), expected);
    assert_eq!(normalize_snapshot(&ollama), expected);
    assert_eq!(normalize_snapshot(&openrouter), normalize_snapshot(&ollama));
}

#[test]
fn snapshot_pending_requests_render_consistently_across_providers() {
    let codex = render_provider_events(
        "codex",
        vec![ProviderEvent::ApprovalRequest {
            item_id: Some("cmd-1".to_string()),
            request_id: "approval-1".to_string(),
            kind: ProviderApprovalKind::CommandExecution,
            description: "Approve cargo test -p koklo-cli".to_string(),
            details: json!({"command": "cargo test -p koklo-cli"}),
        }],
    );
    let claude = render_provider_events(
        "claude",
        vec![ProviderEvent::ApprovalRequest {
            item_id: Some("cmd-1".to_string()),
            request_id: "approval-1".to_string(),
            kind: ProviderApprovalKind::CommandExecution,
            description: "Approve cargo test -p koklo-cli".to_string(),
            details: json!({"command": "cargo test -p koklo-cli"}),
        }],
    );

    let expected = "[00:00:00] ? Approve cargo test -p koklo-cli";
    assert_eq!(normalize_snapshot(&codex), expected);
    assert_eq!(normalize_snapshot(&claude), expected);
}

fn normalize_snapshot(text: &str) -> String {
    text.lines()
        .map(|line| {
            if line.len() >= 11
                && line.starts_with('[')
                && line.as_bytes().get(3) == Some(&b':')
                && line.as_bytes().get(6) == Some(&b':')
                && line.as_bytes().get(9) == Some(&b']')
            {
                format!("[00:00:00]{}", &line[10..])
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim_end()
        .to_string()
}
