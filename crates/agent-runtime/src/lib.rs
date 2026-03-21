//! Agent execution runtime — loads system prompts and dispatches LLM calls.
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{
    CompletionUsage, EventBus, GateDisplay, GateResponse, Phase, PipelineEvent, TranscriptItem,
    TranscriptItemKind, TranscriptItemStatus, TranscriptSource, UserInputDisplay,
    UserInputQuestion,
};
use koklo_providers::{
    canonical_approval_kind, LlmProvider, Message, ProviderApprovalDecision, ProviderApprovalKind,
    ProviderApprovalPayload, ProviderEvent, ProviderInteractionMode, ProviderSessionEvent,
    UserInputPayload,
};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use uuid::Uuid;

static STREAM_STDOUT: AtomicBool = AtomicBool::new(true);

pub fn set_stdout_streaming_enabled(enabled: bool) {
    STREAM_STDOUT.store(enabled, Ordering::Relaxed);
}

/// Configuration for a single agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub name: String,
    pub phase: Phase,
    /// Agent slug used for file lookups (e.g. `"pm"`, `"architect"`).
    pub agent_slug: String,
    pub timeout_secs: u64,
    /// Global koklo home directory (`~/.koklo/`).
    pub global_home: PathBuf,
    /// Project-level `.koklo/` directory. `None` when outside any project.
    pub project_context: Option<PathBuf>,
}

/// Runs a single agent: loads prompt, calls LLM, streams events.
pub struct AgentRunner {
    config: AgentConfig,
    provider: Arc<dyn LlmProvider>,
    bus: EventBus,
    approval_handler: Arc<dyn ApprovalHandler>,
    user_input_handler: Arc<dyn UserInputHandler>,
}

pub struct AgentRunResult {
    pub output: String,
    pub usage: CompletionUsage,
}

struct AgentTurnContext<'a> {
    bus: &'a EventBus,
    phase: Phase,
    session_id: &'a str,
    agent_name: &'a str,
    interaction_mode: ProviderInteractionMode,
}

struct TextBuffers<'a> {
    result: &'a mut String,
    turn_text: &'a mut String,
}

#[async_trait]
pub trait UserInputHandler: Send + Sync {
    async fn request_input(&self, display: UserInputDisplay) -> Result<Vec<String>>;
}

#[async_trait]
pub trait ApprovalHandler: Send + Sync {
    async fn request_approval(&self, display: GateDisplay) -> Result<GateResponse>;
}

impl AgentRunner {
    pub fn new(
        config: AgentConfig,
        provider: Arc<dyn LlmProvider>,
        bus: EventBus,
        approval_handler: Arc<dyn ApprovalHandler>,
        user_input_handler: Arc<dyn UserInputHandler>,
    ) -> Self {
        Self {
            config,
            provider,
            bus,
            approval_handler,
            user_input_handler,
        }
    }

    /// Run the agent with the given user prompt. Returns the full LLM response and token usage.
    pub async fn run(&self, session_id: &str, user_prompt: &str) -> Result<AgentRunResult> {
        let provider_capabilities = self.provider.capabilities();
        let native_user_input = provider_capabilities.user_input_native;
        let system_prompt = if native_user_input {
            build_system_prompt(&self.config)?
        } else {
            with_user_input_protocol(build_system_prompt(&self.config)?)
        };

        let mut messages = vec![Message::system(system_prompt), Message::user(user_prompt)];
        let bus = self.bus.clone();
        let phase = self.config.phase;
        let session_id_str = session_id.to_string();
        let agent_name = self.config.name.clone();
        let approval_handler = Arc::clone(&self.approval_handler);
        let user_input_handler = Arc::clone(&self.user_input_handler);

        let mut result = String::new();
        let mut final_usage = CompletionUsage::default();
        let mut turn_count = 0usize;

        loop {
            turn_count += 1;
            if turn_count > 8 {
                anyhow::bail!("Too many user-input turns for {}", agent_name);
            }

            let mut turn_text = String::new();
            let mut parser = (!native_user_input).then(SyntheticUserInputParser::default);
            let turn_context = AgentTurnContext {
                bus: &bus,
                phase,
                session_id: &session_id_str,
                agent_name: &agent_name,
                interaction_mode: provider_capabilities.interaction_mode,
            };
            let mut session = Arc::clone(&self.provider)
                .start_session(messages.clone())
                .await?;
            let usage = loop {
                match session.next_event().await? {
                    ProviderSessionEvent::Event(event) => {
                        let mut buffers = TextBuffers {
                            result: &mut result,
                            turn_text: &mut turn_text,
                        };
                        if let Some(interruption) = handle_provider_event(
                            &turn_context,
                            &mut buffers,
                            parser.as_mut(),
                            event,
                        ) {
                            match interruption {
                                RuntimeInterruption::UserInput(display) => {
                                    let answers =
                                        user_input_handler.request_input(display.clone()).await?;
                                    emit_user_input_response(
                                        &bus,
                                        &session_id_str,
                                        phase,
                                        &agent_name,
                                        &display,
                                        &answers,
                                    );
                                    session
                                        .send_user_input(UserInputPayload {
                                            request_id: Some(display.request_id),
                                            answers,
                                        })
                                        .await?;
                                }
                                RuntimeInterruption::Approval(request) => {
                                    let response = approval_handler
                                        .request_approval(GateDisplay {
                                            phase,
                                            session_id: session_id_str.clone(),
                                            description: request.description.clone(),
                                            usage: None,
                                            cost: None,
                                            allow_edit: false,
                                        })
                                        .await?;
                                    emit_approval_response(
                                        &bus,
                                        &session_id_str,
                                        phase,
                                        &agent_name,
                                        &request,
                                        &response,
                                    );
                                    session
                                        .resolve_approval(ProviderApprovalPayload {
                                            request_id: Some(request.request_id.clone()),
                                            decision: map_gate_response(response),
                                        })
                                        .await?;
                                }
                            }
                        }
                    }
                    ProviderSessionEvent::Finished { usage, .. } => break usage,
                }
            };

            final_usage.prompt_tokens += usage.prompt_tokens;
            final_usage.completion_tokens += usage.completion_tokens;

            if let Some(parser) = parser.as_mut() {
                let flushed = parser.finish();
                if !flushed.is_empty() {
                    let mut buffers = TextBuffers {
                        result: &mut result,
                        turn_text: &mut turn_text,
                    };
                    emit_text_delta(&turn_context, &mut buffers, None, &flushed);
                }
                if let Some(request) = parser.take_request() {
                    let display = UserInputDisplay {
                        request_id: request.request_id.clone(),
                        session_id: session_id_str.clone(),
                        phase: Some(phase),
                        agent_name: Some(agent_name.clone()),
                        questions: request.questions.clone(),
                    };
                    emit_user_input_request(
                        &bus,
                        &session_id_str,
                        phase,
                        &agent_name,
                        &display,
                        "synthetic",
                    );
                    let answers = user_input_handler.request_input(display.clone()).await?;
                    emit_user_input_response(
                        &bus,
                        &session_id_str,
                        phase,
                        &agent_name,
                        &display,
                        &answers,
                    );

                    messages.push(Message::assistant(format_user_input_request_for_history(
                        &display.questions,
                    )));
                    messages.push(Message::user(format_user_input_answers_for_history(
                        &display.questions,
                        &answers,
                    )));
                    continue;
                }
            }

            bus.send(PipelineEvent::Transcript {
                item: TranscriptItem::new(
                    session_id_str.clone(),
                    Some(phase),
                    Some(agent_name.clone()),
                    TranscriptSource::Agent,
                    TranscriptItemKind::Message,
                    TranscriptItemStatus::Completed,
                    "message completed",
                ),
            });

            break;
        }

        Ok(AgentRunResult {
            output: result,
            usage: final_usage,
        })
    }
}

fn emit_text_delta(
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
        if STREAM_STDOUT.load(Ordering::Relaxed) {
            print!("{}", visible);
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }
    }
}

fn handle_provider_event(
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
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Tool,
                TranscriptItemKind::ToolCall,
                TranscriptItemStatus::Pending,
                format!("{} {}", tool_name, input_summary),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::ToolCall {
                    item_id: item_id.clone(),
                    tool_name: tool_name.clone(),
                    input_summary: input_summary.clone(),
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
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
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Tool,
                TranscriptItemKind::ToolResult,
                if success == Some(false) {
                    TranscriptItemStatus::Failed
                } else {
                    TranscriptItemStatus::Completed
                },
                format!("{} {}", tool_name, output_summary),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::ToolResult {
                    item_id: item_id.clone(),
                    tool_name: tool_name.clone(),
                    output_summary: output_summary.clone(),
                    success,
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
            None
        }
        ProviderEvent::Reasoning { item_id, text } => {
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Agent,
                TranscriptItemKind::Reasoning,
                TranscriptItemStatus::Info,
                text.clone(),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::Reasoning {
                    item_id: item_id.clone(),
                    text: text.clone(),
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
            None
        }
        ProviderEvent::Plan { item_id, text } => {
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Agent,
                TranscriptItemKind::Plan,
                TranscriptItemStatus::Info,
                text.clone(),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::Plan {
                    item_id: item_id.clone(),
                    text: text.clone(),
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
            None
        }
        ProviderEvent::Command {
            item_id,
            command,
            status,
            exit_code,
            output,
        } => {
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Tool,
                TranscriptItemKind::Command,
                if status == "failed" {
                    TranscriptItemStatus::Failed
                } else if status == "completed" {
                    TranscriptItemStatus::Completed
                } else {
                    TranscriptItemStatus::Streaming
                },
                command.clone(),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::Command {
                    item_id: item_id.clone(),
                    command: command.clone(),
                    status: status.clone(),
                    exit_code,
                    output: output.clone(),
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
            None
        }
        ProviderEvent::FileChange {
            item_id,
            summary,
            files,
            status,
        } => {
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Tool,
                TranscriptItemKind::FileChange,
                if status == "failed" {
                    TranscriptItemStatus::Failed
                } else {
                    TranscriptItemStatus::Completed
                },
                summary.clone(),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::FileChange {
                    item_id: item_id.clone(),
                    summary: summary.clone(),
                    files: files.clone(),
                    status: status.clone(),
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
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
                context.bus,
                context.session_id,
                context.phase,
                context.agent_name,
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
            let item = TranscriptItem::new(
                context.session_id.to_string(),
                Some(context.phase),
                Some(context.agent_name.to_string()),
                TranscriptSource::Provider,
                TranscriptItemKind::Message,
                TranscriptItemStatus::Info,
                format!("provider metadata: {}", kind),
            )
            .with_payload(provider_contract_payload(
                ProviderEvent::Metadata {
                    item_id: item_id.clone(),
                    kind: kind.clone(),
                    value: value.clone(),
                },
                context.interaction_mode,
            ));
            context.bus.send(PipelineEvent::Transcript {
                item: match item_id {
                    Some(id) => item.with_item_key(id),
                    None => item,
                },
            });
            None
        }
    }
}

enum RuntimeInterruption {
    UserInput(UserInputDisplay),
    Approval(RuntimeApprovalRequest),
}

struct RuntimeApprovalRequest {
    request_id: String,
    item_id: Option<String>,
    kind: ProviderApprovalKind,
    description: String,
    details: serde_json::Value,
}

fn emit_user_input_request(
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

fn emit_approval_request(
    bus: &EventBus,
    session_id: &str,
    phase: Phase,
    agent_name: &str,
    request: &RuntimeApprovalRequest,
    interaction_mode: &str,
) {
    let item = TranscriptItem::new(
        session_id.to_string(),
        Some(phase),
        Some(agent_name.to_string()),
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
    bus.send(PipelineEvent::Transcript { item });
}

fn emit_user_input_response(
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

fn emit_approval_response(
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

fn map_gate_response(response: GateResponse) -> ProviderApprovalDecision {
    match response {
        GateResponse::Approve => ProviderApprovalDecision::Approve,
        GateResponse::Reject => ProviderApprovalDecision::Reject,
        GateResponse::Edit(path) => ProviderApprovalDecision::Edit {
            path: Some(path.display().to_string()),
        },
    }
}

fn interaction_mode_label(mode: ProviderInteractionMode) -> &'static str {
    match mode {
        ProviderInteractionMode::Native => "native",
        ProviderInteractionMode::Normalized => "normalized",
        ProviderInteractionMode::Synthetic => "synthetic",
    }
}

fn provider_contract_payload(
    event: ProviderEvent,
    interaction_mode: ProviderInteractionMode,
) -> serde_json::Value {
    let mut payload = event.canonical_payload();
    if let Some(map) = payload.as_object_mut() {
        map.insert(
            "interaction_mode".to_string(),
            json!(interaction_mode_label(interaction_mode)),
        );
    }
    payload
}

fn runtime_contract_payload(
    event_name: &str,
    event_status: &str,
    item_id: Option<&str>,
    mut payload: serde_json::Value,
) -> serde_json::Value {
    if let Some(map) = payload.as_object_mut() {
        map.insert(
            "contract_version".to_string(),
            json!(ProviderEvent::CONTRACT_VERSION),
        );
        map.insert("event_name".to_string(), json!(event_name));
        map.insert("event_status".to_string(), json!(event_status));
        map.insert("item_id".to_string(), json!(item_id));
    }
    payload
}

fn with_user_input_protocol(system_prompt: String) -> String {
    format!(
        "{system_prompt}\n\n---\n\n\
If you need clarification or a decision from the user before you can continue, \
respond with ONLY one XML block in this exact form and no surrounding prose:\n\
<koklo:user-input>{{\"questions\":[{{\"id\":\"clarify\",\"header\":\"Clarification\",\"question\":\"Your question here\",\"options\":null,\"is_secret\":false}}]}}</koklo:user-input>\n\
You may include 1 to 3 questions. Once Koklo provides the answers, continue the task normally."
    )
}

fn format_user_input_request_for_history(questions: &[UserInputQuestion]) -> String {
    let formatted = questions
        .iter()
        .map(|question| format!("- {}: {}", question.header, question.question))
        .collect::<Vec<_>>()
        .join("\n");
    format!("Requesting user input:\n{}", formatted)
}

fn format_user_input_answers_for_history(
    questions: &[UserInputQuestion],
    answers: &[String],
) -> String {
    questions
        .iter()
        .zip(answers.iter())
        .map(|(question, answer)| format!("{}: {}", question.header, answer))
        .collect::<Vec<_>>()
        .join("\n")
}

const USER_INPUT_OPEN_TAG: &str = "<koklo:user-input>";
const USER_INPUT_CLOSE_TAG: &str = "</koklo:user-input>";

#[derive(Debug)]
enum TextSegment {
    Visible(String),
}

#[derive(Debug, Default)]
struct SyntheticUserInputParser {
    buffer: String,
    request: Option<SyntheticUserInputRequest>,
}

#[derive(Debug, Clone)]
struct SyntheticUserInputRequest {
    request_id: String,
    questions: Vec<UserInputQuestion>,
}

impl SyntheticUserInputParser {
    fn push(&mut self, chunk: &str) -> Vec<TextSegment> {
        self.buffer.push_str(chunk);
        let mut visible = Vec::new();

        loop {
            if let Some(start) = self.buffer.find(USER_INPUT_OPEN_TAG) {
                if start > 0 {
                    visible.push(TextSegment::Visible(self.buffer[..start].to_string()));
                    self.buffer.drain(..start);
                }

                if let Some(end) = self.buffer.find(USER_INPUT_CLOSE_TAG) {
                    let json_start = USER_INPUT_OPEN_TAG.len();
                    let json_text = self.buffer[json_start..end].trim().to_string();
                    self.buffer.drain(..end + USER_INPUT_CLOSE_TAG.len());
                    if let Ok(request) = parse_synthetic_user_input_request(&json_text) {
                        self.request = Some(request);
                    } else {
                        visible.push(TextSegment::Visible(format!(
                            "{}{}{}",
                            USER_INPUT_OPEN_TAG, json_text, USER_INPUT_CLOSE_TAG
                        )));
                    }
                    continue;
                }
                break;
            }

            let keep = USER_INPUT_OPEN_TAG.len().saturating_sub(1);
            let flush_len = self.buffer.len().saturating_sub(keep);
            if flush_len > 0 {
                visible.push(TextSegment::Visible(self.buffer[..flush_len].to_string()));
                self.buffer.drain(..flush_len);
            }
            break;
        }

        visible
    }

    fn finish(&mut self) -> String {
        std::mem::take(&mut self.buffer)
    }

    fn take_request(&mut self) -> Option<SyntheticUserInputRequest> {
        self.request.take()
    }
}

fn parse_synthetic_user_input_request(json_text: &str) -> Result<SyntheticUserInputRequest> {
    #[derive(serde::Deserialize)]
    struct Payload {
        questions: Vec<UserInputQuestion>,
    }

    let payload: Payload = serde_json::from_str(json_text)?;
    if payload.questions.is_empty() {
        anyhow::bail!("empty questions");
    }
    Ok(SyntheticUserInputRequest {
        request_id: Uuid::new_v4().to_string(),
        questions: payload.questions,
    })
}

/// Build the layered system prompt for an agent.
///
/// Injection order (all layers optional except [14]):
///
///  [1]  `~/.koklo/agents/shared/PROJECT.md`     global fallback constitution
///  [2]  `.koklo/PROJECT.md`                     project constitution
///  [3]  `~/.koklo/USER.md`                      who the user is (global)
///  [4]  `~/.koklo/MEMORY.md`                    global long-term memory
///  [5]  `~/.koklo/memories/YYYY-MM-DD.md`       global daily log
///  [6]  `.koklo/MEMORY.md`                      project memory
///  [7]  `.koklo/memories/YYYY-MM-DD.md`         project daily log
///  [8]  `~/.koklo/agents/<slug>/IDENTITY.md`    agent identity (global)
///  [9]  `~/.koklo/agents/<slug>/SOUL.md`        agent personality (global)
/// [10]  `~/.koklo/agents/<slug>/AGENTS.md`      agent rules (global)
/// [11]  `.koklo/agents/<slug>/IDENTITY.md`      project identity override
/// [12]  `.koklo/agents/<slug>/SOUL.md`          project soul override
/// [13]  `.koklo/agents/<slug>/AGENTS.md`        project agents override
/// [14]  role prompt: `.koklo/agents/<slug>.md` → `~/.koklo/agents/<slug>.md` → embedded fallback
///
/// Missing files are silently skipped. Layers joined with `\n\n---\n\n`.
pub fn build_system_prompt(config: &AgentConfig) -> Result<String> {
    let mut parts: Vec<String> = Vec::new();
    let slug = &config.agent_slug;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // [1] global fallback constitution
    maybe_read(
        config
            .global_home
            .join("agents")
            .join("shared")
            .join("PROJECT.md"),
        &mut parts,
    );

    // [2] project constitution
    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("PROJECT.md"), &mut parts);
    }

    // [3] global USER.md
    maybe_read(config.global_home.join("USER.md"), &mut parts);

    // [4] global MEMORY.md
    maybe_read(config.global_home.join("MEMORY.md"), &mut parts);

    // [5] global daily log
    maybe_read(
        config
            .global_home
            .join("memories")
            .join(format!("{today}.md")),
        &mut parts,
    );

    // [6] project MEMORY.md
    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("MEMORY.md"), &mut parts);
    }

    // [7] project daily log
    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("memories").join(format!("{today}.md")), &mut parts);
    }

    // [8-10] global per-agent identity files
    for file in ["IDENTITY.md", "SOUL.md", "AGENTS.md"] {
        maybe_read(
            config.global_home.join("agents").join(slug).join(file),
            &mut parts,
        );
    }

    // [11-13] project per-agent identity overrides
    if let Some(ctx) = &config.project_context {
        for file in ["IDENTITY.md", "SOUL.md", "AGENTS.md"] {
            maybe_read(ctx.join("agents").join(slug).join(file), &mut parts);
        }
    }

    // [14] role prompt: project override → global → embedded fallback
    let role_prompt = {
        let project_role = config
            .project_context
            .as_ref()
            .map(|ctx| ctx.join("agents").join(format!("{slug}.md")));
        let global_role = config.global_home.join("agents").join(format!("{slug}.md"));

        if let Some(path) = project_role.filter(|p| p.exists()) {
            std::fs::read_to_string(path)?
        } else if global_role.exists() {
            std::fs::read_to_string(global_role)?
        } else {
            tracing::warn!(
                "No role prompt found for agent '{}', using embedded fallback",
                config.name
            );
            format!(
                "You are the {} agent for the koklo AI development pipeline.",
                config.name
            )
        }
    };
    parts.push(role_prompt);

    Ok(parts.join("\n\n---\n\n"))
}

fn maybe_read(path: PathBuf, parts: &mut Vec<String>) {
    if let Ok(content) = std::fs::read_to_string(&path) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use koklo_providers::{
        ProviderApprovalKind, ProviderApprovalPayload, ProviderEvent, ProviderSession,
        ProviderSessionEvent, StreamChunk,
    };
    use std::sync::Mutex;

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

    #[test]
    fn test_build_system_prompt_fallback() {
        let config = test_config("pm");
        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("pm agent"));
    }

    #[test]
    fn test_build_system_prompt_no_optional_dirs() {
        // With nonexistent global_home and no project_context, only the fallback.
        let config = test_config("architect");
        let prompt = build_system_prompt(&config).unwrap();
        // Only the fallback message — no separator.
        assert!(!prompt.contains("---"));
        assert!(prompt.contains("architect agent"));
    }

    #[test]
    fn test_build_system_prompt_project_role_override() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        // Create global role prompt
        let agents_dir = global_home.join("agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        let mut f = std::fs::File::create(agents_dir.join("pm.md")).unwrap();
        writeln!(f, "global pm role").unwrap();

        // Create project override
        let proj_agents = project_ctx.join("agents");
        std::fs::create_dir_all(&proj_agents).unwrap();
        let mut f = std::fs::File::create(proj_agents.join("pm.md")).unwrap();
        writeln!(f, "project pm override").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("project pm override"));
        assert!(!prompt.contains("global pm role"));
    }

    #[test]
    fn test_build_system_prompt_global_role_when_no_project_override() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        let agents_dir = global_home.join("agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        let mut f = std::fs::File::create(agents_dir.join("pm.md")).unwrap();
        writeln!(f, "global pm role").unwrap();

        // Project context exists but has no agents override
        std::fs::create_dir_all(&project_ctx).unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("global pm role"));
    }

    #[test]
    fn synthetic_parser_extracts_request_block() {
        let mut parser = SyntheticUserInputParser::default();
        let out = parser.push("before <koklo:user-input>{\"questions\":[{\"id\":\"a\",\"header\":\"Need\",\"question\":\"Which path?\",\"options\":null,\"is_secret\":false}]}</koklo:user-input> after");
        let visible = out
            .into_iter()
            .map(|segment| match segment {
                TextSegment::Visible(text) => text,
            })
            .collect::<Vec<_>>()
            .join("");
        assert_eq!(visible, "before ");
        let request = parser.take_request().unwrap();
        assert_eq!(request.questions.len(), 1);
        assert_eq!(parser.finish(), " after");
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
        ) -> Result<(String, CompletionUsage)> {
            let next = self.outputs.lock().unwrap().remove(0);
            on_chunk(StreamChunk::text(next.clone()));
            on_chunk(StreamChunk::finished());
            Ok((
                next,
                CompletionUsage {
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
                        details: serde_json::json!({ "command": "cargo test" }),
                    }),
                    ProviderSessionEvent::Finished {
                        output: "done".to_string(),
                        usage: CompletionUsage {
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
        ) -> Result<(String, CompletionUsage)> {
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
            ProviderInteractionMode::Native,
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
}
