use super::contracts::{provider_contract_payload, runtime_contract_payload};
use super::types::{AgentTurnContext, RuntimeApprovalRequest, TextBuffers};
use crate::runtime::stream_stdout_enabled;
use crate::synthetic_user_input::{SyntheticUserInputParser, TextSegment};
use koklo_events::{
    EventBus, GateResponse, Phase, PipelineEvent, TranscriptItem, TranscriptItemKind,
    TranscriptItemStatus, TranscriptSource, UserInputDisplay,
};
use koklo_providers::canonical_approval_kind;
use serde_json::json;

pub(crate) fn emit_text_delta(
    context: &AgentTurnContext<'_>,
    buffers: &mut TextBuffers<'_>,
    parser: Option<&mut SyntheticUserInputParser>,
    text: &str,
) {
    let segments = if let Some(parser) = parser {
        parser.push(text)
    } else {
        vec![TextSegment::Visible(text.to_string())]
    };
    for segment in segments {
        let TextSegment::Visible(visible) = segment;
        if visible.is_empty() {
            continue;
        }
        context.bus.send(PipelineEvent::AgentLog {
            phase: context.phase,
            session_id: context.session_id.to_string(),
            message: visible.clone(),
        });
        context.bus.send(PipelineEvent::Transcript {
            item: TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Agent,
                TranscriptItemKind::MessageDelta,
                TranscriptItemStatus::Streaming,
                visible.clone(),
            ),
        });
        buffers.result.push_str(&visible);
        buffers.turn_text.push_str(&visible);
        if stream_stdout_enabled() {
            print!("{}", visible);
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }
    }
}

pub(crate) fn emit_user_input_request(
    bus: &EventBus,
    session_id: &str,
    phase: Phase,
    agent_name: &str,
    display: &UserInputDisplay,
    interaction_mode: &str,
) {
    let item = TranscriptItem::new(
        session_id.to_string(),
        Some(phase),
        Some(agent_name.to_string()),
        TranscriptSource::System,
        TranscriptItemKind::UserInputRequest,
        TranscriptItemStatus::Pending,
        format!("{} question(s) for the user", display.questions.len()),
    )
    .with_item_key(display.request_id.clone())
    .with_payload(runtime_contract_payload(
        "user_input_request",
        "pending",
        Some(display.request_id.as_str()),
        json!({
            "question_count": display.questions.len(),
            "questions": display.questions,
            "interaction_mode": interaction_mode,
        }),
    ));
    bus.send(PipelineEvent::Transcript { item });
}

pub(crate) fn emit_user_input_response(
    bus: &EventBus,
    session_id: &str,
    phase: Phase,
    agent_name: &str,
    display: &UserInputDisplay,
    answers: &[String],
) {
    let answers_payload = display
        .questions
        .iter()
        .zip(answers.iter())
        .map(|(question, answer)| {
            json!({
                "id": question.id,
                "header": question.header,
                "question": question.question,
                "answer": answer,
            })
        })
        .collect::<Vec<_>>();

    let item = TranscriptItem::new(
        session_id.to_string(),
        Some(phase),
        Some(agent_name.to_string()),
        TranscriptSource::User,
        TranscriptItemKind::UserInputResponse,
        TranscriptItemStatus::Resolved,
        format!("answered {} question(s)", answers_payload.len()),
    )
    .with_item_key(display.request_id.clone())
    .with_payload(runtime_contract_payload(
        "user_input_response",
        "resolved",
        Some(display.request_id.as_str()),
        json!({ "answers": answers_payload }),
    ));
    bus.send(PipelineEvent::Transcript { item });
}

pub(crate) fn emit_approval_response(
    bus: &EventBus,
    session_id: &str,
    phase: Phase,
    agent_name: &str,
    request: &RuntimeApprovalRequest,
    response: &GateResponse,
) {
    let (action, path) = match response {
        GateResponse::Approve => ("approve", None),
        GateResponse::Reject => ("reject", None),
        GateResponse::Edit(path) => ("edit", Some(path.display().to_string())),
    };
    let item = TranscriptItem::new(
        session_id.to_string(),
        Some(phase),
        Some(agent_name.to_string()),
        TranscriptSource::User,
        TranscriptItemKind::ApprovalDecision,
        TranscriptItemStatus::Resolved,
        format!("{} approval for {}", action, request.description),
    )
    .with_item_key(request.request_id.clone())
    .with_payload(runtime_contract_payload(
        "approval_decision",
        "resolved",
        Some(request.request_id.as_str()),
        json!({
            "action": action,
            "path": path,
            "item_id": request.item_id,
            "approval_kind": canonical_approval_kind(request.kind),
        }),
    ));
    bus.send(PipelineEvent::Transcript { item });
}

pub(crate) fn emit_provider_transcript(
    context: &AgentTurnContext<'_>,
    item_id: Option<String>,
    source: TranscriptSource,
    kind: TranscriptItemKind,
    status: TranscriptItemStatus,
    summary: String,
    payload: koklo_providers::ProviderEvent,
) {
    let item = TranscriptItem::new(
        context.session_id.to_string(),
        Some(context.phase),
        Some(context.agent_name.to_string()),
        source,
        kind,
        status,
        summary,
    )
    .with_payload(provider_contract_payload(payload, context.interaction_mode));
    context.bus.send(PipelineEvent::Transcript {
        item: with_item_key(item, item_id),
    });
}

pub(crate) fn transcript_status(status: &str) -> TranscriptItemStatus {
    match status {
        "failed" => TranscriptItemStatus::Failed,
        "completed" => TranscriptItemStatus::Completed,
        _ => TranscriptItemStatus::Streaming,
    }
}

fn with_item_key(item: TranscriptItem, item_id: Option<String>) -> TranscriptItem {
    match item_id {
        Some(id) => item.with_item_key(id),
        None => item,
    }
}
