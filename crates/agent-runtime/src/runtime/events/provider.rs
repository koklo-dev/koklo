use super::contracts::interaction_mode_label;
use super::transcript::{
    emit_provider_transcript, emit_text_delta, emit_user_input_request, transcript_status,
};
use super::types::{AgentTurnContext, RuntimeApprovalRequest, RuntimeInterruption, TextBuffers};
use crate::synthetic_user_input::SyntheticUserInputParser;
use koklo_events::{
    PipelineEvent, TranscriptItemKind, TranscriptItemStatus, TranscriptSource, UserInputDisplay,
};
use koklo_providers::ProviderEvent;
use uuid::Uuid;

pub(crate) fn handle_provider_event(
    context: &AgentTurnContext<'_>,
    buffers: &mut TextBuffers<'_>,
    parser: Option<&mut SyntheticUserInputParser>,
    event: ProviderEvent,
) -> Option<RuntimeInterruption> {
    match event {
        ProviderEvent::MessageDelta { text } => {
            emit_text_delta(context, buffers, parser, &text);
            None
        }
        ProviderEvent::MessageCompleted => None,
        ProviderEvent::ToolCall {
            item_id,
            tool_name,
            input_summary,
        } => {
            context.bus.send(PipelineEvent::ToolCall {
                phase: context.phase,
                session_id: context.session_id.to_string(),
                tool_name: tool_name.clone(),
                input_summary: input_summary.clone(),
            });
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Tool,
                TranscriptItemKind::ToolCall,
                TranscriptItemStatus::Pending,
                format!("{} {}", tool_name, input_summary),
                ProviderEvent::ToolCall {
                    item_id,
                    tool_name,
                    input_summary,
                },
            );
            None
        }
        ProviderEvent::ToolResult {
            item_id,
            tool_name,
            output_summary,
            success,
        } => {
            context.bus.send(PipelineEvent::ToolResult {
                phase: context.phase,
                session_id: context.session_id.to_string(),
                tool_name: tool_name.clone(),
                output_summary: output_summary.clone(),
            });
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Tool,
                TranscriptItemKind::ToolResult,
                if success == Some(false) {
                    TranscriptItemStatus::Failed
                } else {
                    TranscriptItemStatus::Completed
                },
                format!("{} {}", tool_name, output_summary),
                ProviderEvent::ToolResult {
                    item_id,
                    tool_name,
                    output_summary,
                    success,
                },
            );
            None
        }
        ProviderEvent::Reasoning { item_id, text } => {
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Agent,
                TranscriptItemKind::Reasoning,
                TranscriptItemStatus::Info,
                text.clone(),
                ProviderEvent::Reasoning { item_id, text },
            );
            None
        }
        ProviderEvent::Plan { item_id, text } => {
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Agent,
                TranscriptItemKind::Plan,
                TranscriptItemStatus::Info,
                text.clone(),
                ProviderEvent::Plan { item_id, text },
            );
            None
        }
        ProviderEvent::Command {
            item_id,
            command,
            status,
            exit_code,
            output,
            details,
        } => {
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Tool,
                TranscriptItemKind::Command,
                transcript_status(&status),
                command.clone(),
                ProviderEvent::Command {
                    item_id,
                    command,
                    status,
                    exit_code,
                    output,
                    details,
                },
            );
            None
        }
        ProviderEvent::FileChange {
            item_id,
            summary,
            files,
            status,
            details,
        } => {
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Tool,
                TranscriptItemKind::FileChange,
                transcript_status(&status),
                summary.clone(),
                ProviderEvent::FileChange {
                    item_id,
                    summary,
                    files,
                    status,
                    details,
                },
            );
            None
        }
        ProviderEvent::UserInputRequest { item_id, questions } => {
            let request_id = item_id.unwrap_or_else(|| Uuid::new_v4().to_string());
            let display = UserInputDisplay {
                request_id,
                session_id: context.session_id.to_string(),
                phase: Some(context.phase),
                agent_name: Some(context.agent_name.to_string()),
                questions,
            };
            emit_user_input_request(
                context.bus,
                context.session_id,
                context.phase,
                context.agent_name,
                &display,
                interaction_mode_label(context.interaction_mode),
            );
            Some(RuntimeInterruption::UserInput(display))
        }
        ProviderEvent::ApprovalRequest {
            item_id,
            request_id,
            kind,
            description,
            details,
        } => {
            let request = RuntimeApprovalRequest {
                request_id,
                item_id,
                kind,
                description,
                details,
            };
            emit_approval_request(
                context,
                &request,
                interaction_mode_label(context.interaction_mode),
            );
            Some(RuntimeInterruption::Approval(request))
        }
        ProviderEvent::Metadata {
            item_id,
            kind,
            value,
        } => {
            emit_provider_transcript(
                context,
                item_id.clone(),
                TranscriptSource::Provider,
                TranscriptItemKind::Message,
                TranscriptItemStatus::Info,
                format!("provider metadata: {}", kind),
                ProviderEvent::Metadata {
                    item_id,
                    kind,
                    value,
                },
            );
            None
        }
    }
}

fn emit_approval_request(
    context: &AgentTurnContext<'_>,
    request: &RuntimeApprovalRequest,
    interaction_mode: &str,
) {
    use super::contracts::runtime_contract_payload;
    use koklo_events::{
        PipelineEvent, TranscriptItem, TranscriptItemKind, TranscriptItemStatus, TranscriptSource,
    };
    use koklo_providers::canonical_approval_kind;
    use serde_json::json;

    let item = TranscriptItem::new(
        context.session_id.to_string(),
        Some(context.phase),
        Some(context.agent_name.to_string()),
        TranscriptSource::System,
        TranscriptItemKind::ApprovalRequest,
        TranscriptItemStatus::Pending,
        request.description.clone(),
    )
    .with_item_key(request.request_id.clone())
    .with_payload(runtime_contract_payload(
        "approval_request",
        "pending",
        Some(request.request_id.as_str()),
        json!({
            "item_id": request.item_id,
            "approval_kind": canonical_approval_kind(request.kind),
            "description": request.description,
            "details": request.details,
            "interaction_mode": interaction_mode,
        }),
    ));
    context.bus.send(PipelineEvent::Transcript { item });
}
