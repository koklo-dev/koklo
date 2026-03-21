use crate::render_model::{build_transcript_render_model, RenderBlock, RenderBlockBody};
use chrono::Utc;
use koklo_providers::ProviderEvent;
use koklo_storage::TranscriptItemRecord;

#[derive(Debug, Clone)]
pub struct PlainRenderEngine {
    records: Vec<TranscriptItemRecord>,
    rendered_blocks: Vec<RenderBlock>,
    timestamps: bool,
}

impl PlainRenderEngine {
    pub fn new(timestamps: bool) -> Self {
        Self {
            records: Vec::new(),
            rendered_blocks: Vec::new(),
            timestamps,
        }
    }

    pub fn push_record(&mut self, record: TranscriptItemRecord) -> String {
        self.push_records([record])
    }

    pub fn push_records<I>(&mut self, records: I) -> String
    where
        I: IntoIterator<Item = TranscriptItemRecord>,
    {
        self.records.extend(records);
        let next_model = build_transcript_render_model(self.records.iter());
        let rendered = render_delta(&self.rendered_blocks, &next_model.blocks, self.timestamps);
        self.rendered_blocks = next_model.blocks;
        rendered
    }
}

pub fn provider_event_to_record(
    event: ProviderEvent,
    seq: i64,
    agent_name: Option<&str>,
) -> TranscriptItemRecord {
    let created_at = Utc::now().to_rfc3339();
    let kind = provider_event_kind(&event).to_string();
    let status = event.canonical_status().to_string();
    let item_key = provider_event_item_key(&event);
    let summary = provider_event_summary(&event);
    let payload_json = Some(event.canonical_payload().to_string());

    TranscriptItemRecord {
        id: format!("agent-run-{seq}"),
        session_id: "agent-run".to_string(),
        phase: None,
        agent_name: agent_name.map(str::to_string),
        source: provider_event_source(&event).to_string(),
        kind,
        status,
        item_key,
        summary,
        payload_json,
        seq,
        created_at,
    }
}

fn render_delta(previous: &[RenderBlock], next: &[RenderBlock], timestamps: bool) -> String {
    let mut first_changed = 0usize;
    while first_changed < previous.len()
        && first_changed < next.len()
        && previous[first_changed] == next[first_changed]
    {
        first_changed += 1;
    }

    if first_changed == next.len() {
        return String::new();
    }

    let mut output = String::new();
    let mut next_index = first_changed;

    if first_changed < previous.len() {
        if let Some(delta) =
            render_incremental_block(&previous[first_changed], &next[first_changed], timestamps)
        {
            output.push_str(&delta);
            next_index += 1;
        }
    }

    for block in &next[next_index..] {
        output.push_str(&render_block(block, timestamps));
    }

    output
}

fn render_incremental_block(
    previous: &RenderBlock,
    next: &RenderBlock,
    timestamps: bool,
) -> Option<String> {
    if !same_block_stream(previous, next) {
        return None;
    }

    match (&previous.body, &next.body) {
        (RenderBlockBody::Markdown(old), RenderBlockBody::Markdown(new))
            if new.starts_with(old) =>
        {
            Some(new[old.len()..].to_string())
        }
        (RenderBlockBody::Lines(old), RenderBlockBody::Lines(new))
            if new.len() >= old.len() && new[..old.len()] == old[..] =>
        {
            Some(render_lines(
                next.created_at.as_deref(),
                &new[old.len()..],
                timestamps,
            ))
        }
        _ => None,
    }
}

fn render_block(block: &RenderBlock, timestamps: bool) -> String {
    match &block.body {
        RenderBlockBody::Markdown(text) => text.clone(),
        RenderBlockBody::Lines(lines) => {
            render_lines(block.created_at.as_deref(), lines, timestamps)
        }
    }
}

fn render_lines(created_at: Option<&str>, lines: &[String], timestamps: bool) -> String {
    let mut rendered = String::new();
    let time = created_at
        .and_then(|value| value.get(11..19))
        .unwrap_or("??:??:??");

    for line in lines {
        if timestamps {
            rendered.push_str(&format!("[{time}] {line}\n"));
        } else {
            rendered.push_str(line);
            rendered.push('\n');
        }
    }

    rendered
}

fn same_block_stream(previous: &RenderBlock, next: &RenderBlock) -> bool {
    previous.kind == next.kind
        && previous.source_kind == next.source_kind
        && previous.item_key == next.item_key
}

fn provider_event_source(event: &ProviderEvent) -> &'static str {
    match event {
        ProviderEvent::ToolCall { .. }
        | ProviderEvent::ToolResult { .. }
        | ProviderEvent::Command { .. }
        | ProviderEvent::FileChange { .. }
        | ProviderEvent::UserInputRequest { .. }
        | ProviderEvent::ApprovalRequest { .. } => "tool",
        _ => "agent",
    }
}

fn provider_event_kind(event: &ProviderEvent) -> &'static str {
    match event {
        ProviderEvent::MessageDelta { .. } => "message_delta",
        ProviderEvent::MessageCompleted => "message",
        ProviderEvent::ToolCall { .. } => "tool_call",
        ProviderEvent::ToolResult { .. } => "tool_result",
        ProviderEvent::Reasoning { .. } => "reasoning",
        ProviderEvent::Plan { .. } => "plan",
        ProviderEvent::Command { .. } => "command",
        ProviderEvent::FileChange { .. } => "file_change",
        ProviderEvent::UserInputRequest { .. } => "user_input_request",
        ProviderEvent::ApprovalRequest { .. } => "approval_request",
        ProviderEvent::Metadata { .. } => "message",
    }
}

fn provider_event_item_key(event: &ProviderEvent) -> Option<String> {
    match event {
        ProviderEvent::ApprovalRequest { request_id, .. } => Some(request_id.clone()),
        ProviderEvent::ToolCall { item_id, .. }
        | ProviderEvent::ToolResult { item_id, .. }
        | ProviderEvent::Reasoning { item_id, .. }
        | ProviderEvent::Plan { item_id, .. }
        | ProviderEvent::Command { item_id, .. }
        | ProviderEvent::FileChange { item_id, .. }
        | ProviderEvent::UserInputRequest { item_id, .. }
        | ProviderEvent::Metadata { item_id, .. } => item_id.clone(),
        ProviderEvent::MessageDelta { .. } | ProviderEvent::MessageCompleted => None,
    }
}

fn provider_event_summary(event: &ProviderEvent) -> String {
    match event {
        ProviderEvent::MessageDelta { text } => text.clone(),
        ProviderEvent::MessageCompleted => "message completed".to_string(),
        ProviderEvent::ToolCall {
            tool_name,
            input_summary,
            ..
        } => format!("{tool_name} {input_summary}"),
        ProviderEvent::ToolResult {
            tool_name,
            output_summary,
            ..
        } => format!("{tool_name} {output_summary}"),
        ProviderEvent::Reasoning { text, .. } | ProviderEvent::Plan { text, .. } => text.clone(),
        ProviderEvent::Command { command, .. } => command.clone(),
        ProviderEvent::FileChange { summary, .. } => summary.clone(),
        ProviderEvent::UserInputRequest { questions, .. } => {
            format!("{} question(s) for the user", questions.len())
        }
        ProviderEvent::ApprovalRequest { description, .. } => description.clone(),
        ProviderEvent::Metadata { kind, .. } => format!("provider metadata: {kind}"),
    }
}

#[cfg(test)]
mod tests {
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
                },
                ProviderEvent::Command {
                    item_id: Some("cmd-1".to_string()),
                    command: "cargo test -p koklo-cli".to_string(),
                    status: "completed".to_string(),
                    exit_code: Some(0),
                    output: Some("test result: ok\n".to_string()),
                },
                ProviderEvent::FileChange {
                    item_id: Some("edit-1".to_string()),
                    summary: "updated monitor and renderer".to_string(),
                    files: vec![
                        "apps/cli/src/monitor.rs".to_string(),
                        "apps/cli/src/render_model.rs".to_string(),
                    ],
                    status: "completed".to_string(),
                },
                ProviderEvent::MessageDelta {
                    text: "Lot 5 snapshot coverage is in place.".to_string(),
                },
                ProviderEvent::MessageCompleted,
            ],
        );

        let expected = "\
[00:00:00] ⋯ Inspecting workspace state
[00:00:00] ☰ [ ] inspect files
[00:00:00] ☰ [x] update renderer
[00:00:00] ⚙ Read apps/cli/src/monitor.rs
[00:00:00] ↳ Read loaded file
[00:00:00] $ cargo test -p koklo-cli
[00:00:00] │ running tests
[00:00:00] │ test result: ok
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
                },
                ProviderEvent::MessageDelta {
                    text: "Lot 5 snapshot coverage is in place.".to_string(),
                },
                ProviderEvent::MessageCompleted,
            ],
        );

        let expected = "\
[00:00:00] ⚙ Read apps/cli/src/monitor.rs
[00:00:00] ↳ Read loaded file
[00:00:00] ⚙ Run cargo test -p koklo-cli
[00:00:00] ↳ Bash completed
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
}
