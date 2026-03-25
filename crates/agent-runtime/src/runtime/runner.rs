use super::events::{
    emit_approval_response, emit_text_delta, emit_user_input_request, emit_user_input_response,
    handle_provider_event, map_gate_response, AgentTurnContext, RuntimeInterruption, TextBuffers,
};
use super::{AgentConfig, ApprovalHandler, UserInputHandler};
use crate::synthetic_user_input::{
    format_user_input_answers_for_history, format_user_input_request_for_history,
    with_user_input_protocol, SyntheticUserInputParser,
};
use crate::system_prompt::build_system_prompt;
use anyhow::Result;
use koklo_events::{
    CompletionUsage, EventBus, GateDisplay, PipelineEvent, TranscriptItem, TranscriptItemKind,
    TranscriptItemStatus, TranscriptSource, UserInputDisplay,
};
use koklo_providers::{
    LlmProvider, Message, ProviderApprovalPayload, ProviderSessionEvent, UserInputPayload,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

static STREAM_STDOUT: AtomicBool = AtomicBool::new(true);

pub fn set_stdout_streaming_enabled(enabled: bool) {
    STREAM_STDOUT.store(enabled, Ordering::Relaxed);
}

pub(crate) fn stream_stdout_enabled() -> bool {
    STREAM_STDOUT.load(Ordering::Relaxed)
}

pub struct AgentRunResult {
    pub output: String,
    pub usage: CompletionUsage,
}

/// Runs a single agent: loads prompt, calls LLM, streams events.
pub struct AgentRunner {
    config: AgentConfig,
    provider: Arc<dyn LlmProvider>,
    bus: EventBus,
    approval_handler: Arc<dyn ApprovalHandler>,
    user_input_handler: Arc<dyn UserInputHandler>,
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
