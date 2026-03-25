use super::*;
use crate::runtime::events::contracts::{provider_contract_payload, runtime_contract_payload};
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{EventBus, GateDisplay, GateResponse, Phase, UserInputDisplay};
use koklo_providers::{
    LlmProvider, Message, ProviderApprovalDecision, ProviderApprovalKind, ProviderApprovalPayload,
    ProviderEvent, ProviderSession, ProviderSessionEvent, StreamChunk,
};
use serde_json::json;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

fn test_config(slug: &str) -> AgentConfig {
    AgentConfig {
        name: slug.to_string(),
        phase: Phase::Spec,
        agent_slug: slug.to_string(),
        timeout_secs: 120,
        global_home: PathBuf::from("/nonexistent/koklo_home"),
        project_context: None,
    }
}

#[test]
fn test_agent_config() {
    let config = test_config("pm");

    assert_eq!(config.name, "pm");
    assert_eq!(config.phase, Phase::Spec);
    assert_eq!(config.agent_slug, "pm");
}

struct ScriptedProvider {
    outputs: Mutex<Vec<String>>,
}

#[async_trait]
impl LlmProvider for ScriptedProvider {
    async fn complete_stream(
        &self,
        _messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, koklo_events::CompletionUsage)> {
        let next = self.outputs.lock().unwrap().remove(0);
        on_chunk(StreamChunk::text(next.clone()));
        on_chunk(StreamChunk::finished());
        Ok((
            next,
            koklo_events::CompletionUsage {
                prompt_tokens: 10,
                completion_tokens: 5,
            },
        ))
    }

    fn provider_name(&self) -> &str {
        "scripted"
    }
}

struct RecordingInputHandler {
    answers: Vec<String>,
    seen_questions: Mutex<Vec<String>>,
}

#[async_trait]
impl UserInputHandler for RecordingInputHandler {
    async fn request_input(&self, display: UserInputDisplay) -> Result<Vec<String>> {
        self.seen_questions.lock().unwrap().extend(
            display
                .questions
                .iter()
                .map(|question| question.question.clone()),
        );
        Ok(self.answers.clone())
    }
}

struct RecordingApprovalHandler;

#[async_trait]
impl ApprovalHandler for RecordingApprovalHandler {
    async fn request_approval(&self, _display: GateDisplay) -> Result<GateResponse> {
        Ok(GateResponse::Approve)
    }
}

struct NativeApprovalProvider {
    approvals: Arc<Mutex<Vec<ProviderApprovalPayload>>>,
}

struct NativeApprovalSession {
    approvals: Arc<Mutex<Vec<ProviderApprovalPayload>>>,
    events: Vec<ProviderSessionEvent>,
}

#[async_trait]
impl ProviderSession for NativeApprovalSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        if self.events.is_empty() {
            anyhow::bail!("no more events in test session")
        }
        Ok(self.events.remove(0))
    }

    async fn resolve_approval(&mut self, approval: ProviderApprovalPayload) -> Result<()> {
        self.approvals.lock().unwrap().push(approval);
        Ok(())
    }
}

#[async_trait]
impl LlmProvider for NativeApprovalProvider {
    async fn start_session(
        self: Arc<Self>,
        _messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        Ok(Box::new(NativeApprovalSession {
            approvals: Arc::clone(&self.approvals),
            events: vec![
                ProviderSessionEvent::Event(ProviderEvent::ApprovalRequest {
                    item_id: Some("cmd-1".to_string()),
                    request_id: "approval-1".to_string(),
                    kind: ProviderApprovalKind::CommandExecution,
                    description: "Approve cargo test".to_string(),
                    details: json!({ "command": "cargo test" }),
                }),
                ProviderSessionEvent::Finished {
                    output: "done".to_string(),
                    usage: koklo_events::CompletionUsage {
                        prompt_tokens: 1,
                        completion_tokens: 2,
                    },
                },
            ],
        }))
    }

    async fn complete_stream(
        &self,
        _messages: Vec<Message>,
        _on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, koklo_events::CompletionUsage)> {
        anyhow::bail!("complete_stream should not be used in this test")
    }

    fn capabilities(&self) -> koklo_providers::ProviderCapabilities {
        koklo_providers::ProviderCapabilities {
            streaming_text: true,
            approvals_native: true,
            user_input_native: true,
            ..Default::default()
        }
    }

    fn provider_name(&self) -> &str {
        "native-approval"
    }
}

#[tokio::test]
async fn agent_runner_replays_after_user_input_request() {
    let provider = Arc::new(ScriptedProvider {
        outputs: Mutex::new(vec![
            "<koklo:user-input>{\"questions\":[{\"id\":\"clarify\",\"header\":\"Clarification\",\"question\":\"Which module?\",\"options\":null,\"is_secret\":false}]}</koklo:user-input>".to_string(),
            "Working in billing module.\n".to_string(),
        ]),
    });
    let handler = Arc::new(RecordingInputHandler {
        answers: vec!["billing".to_string()],
        seen_questions: Mutex::new(Vec::new()),
    });
    let runner = AgentRunner::new(
        test_config("pm"),
        provider,
        EventBus::new(32),
        Arc::new(RecordingApprovalHandler),
        handler,
    );

    let result = runner
        .run("session-1", "Need implementation")
        .await
        .unwrap();

    assert_eq!(result.output, "Working in billing module.\n");
    assert_eq!(result.usage.prompt_tokens, 20);
    assert_eq!(result.usage.completion_tokens, 10);
}

#[tokio::test]
async fn agent_runner_resolves_native_provider_approval() {
    let approvals = Arc::new(Mutex::new(Vec::new()));
    let provider = Arc::new(NativeApprovalProvider {
        approvals: Arc::clone(&approvals),
    });
    let runner = AgentRunner::new(
        test_config("pm"),
        provider,
        EventBus::new(32),
        Arc::new(RecordingApprovalHandler),
        Arc::new(RecordingInputHandler {
            answers: vec![],
            seen_questions: Mutex::new(Vec::new()),
        }),
    );

    let result = runner
        .run("session-approval", "Need approval")
        .await
        .unwrap();

    assert_eq!(result.output, "");
    let approvals = approvals.lock().unwrap();
    assert_eq!(approvals.len(), 1);
    assert_eq!(approvals[0].request_id.as_deref(), Some("approval-1"));
    assert!(matches!(
        approvals[0].decision,
        ProviderApprovalDecision::Approve
    ));
}

#[test]
fn provider_contract_payload_adds_interaction_mode() {
    let payload = provider_contract_payload(
        ProviderEvent::ToolCall {
            item_id: Some("tool-1".to_string()),
            tool_name: "Read".to_string(),
            input_summary: "Cargo.toml".to_string(),
        },
        koklo_providers::ProviderInteractionMode::Native,
    );

    assert_eq!(
        payload
            .get("contract_version")
            .and_then(serde_json::Value::as_str),
        Some(ProviderEvent::CONTRACT_VERSION)
    );
    assert_eq!(
        payload
            .get("event_name")
            .and_then(serde_json::Value::as_str),
        Some("tool_call")
    );
    assert_eq!(
        payload
            .get("interaction_mode")
            .and_then(serde_json::Value::as_str),
        Some("native")
    );
    assert_eq!(
        payload.get("tool_kind").and_then(serde_json::Value::as_str),
        Some("read")
    );
}

#[test]
fn runtime_contract_payload_adds_contract_fields() {
    let payload = runtime_contract_payload(
        "approval_decision",
        "resolved",
        Some("approval-1"),
        json!({ "action": "approve" }),
    );

    assert_eq!(
        payload
            .get("contract_version")
            .and_then(serde_json::Value::as_str),
        Some(ProviderEvent::CONTRACT_VERSION)
    );
    assert_eq!(
        payload
            .get("event_name")
            .and_then(serde_json::Value::as_str),
        Some("approval_decision")
    );
    assert_eq!(
        payload
            .get("event_status")
            .and_then(serde_json::Value::as_str),
        Some("resolved")
    );
    assert_eq!(
        payload.get("item_id").and_then(serde_json::Value::as_str),
        Some("approval-1")
    );
}
