use super::*;

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

pub(super) fn provider_event_source(event: &ProviderEvent) -> &'static str {
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

pub(super) fn provider_event_kind(event: &ProviderEvent) -> &'static str {
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

pub(super) fn provider_event_item_key(event: &ProviderEvent) -> Option<String> {
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

pub(super) fn provider_event_summary(event: &ProviderEvent) -> String {
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
