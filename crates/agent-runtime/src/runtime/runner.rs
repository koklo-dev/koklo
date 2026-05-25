use super::events::{
    emit_approval_response, emit_text_delta, emit_user_input_request, emit_user_input_response,
    handle_provider_event, map_gate_response, AgentTurnContext, RuntimeInterruption, TextBuffers,
};
use super::{AgentConfig, ApprovalHandler, UserInputHandler};
use crate::synthetic_user_input::{
    format_user_input_answers_for_history, format_user_input_request_for_history,
    with_user_input_protocol, SyntheticUserInputParser,
};
use crate::system_prompt::build_system_prompt_with_metrics;
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
use std::time::Instant;
use tokio::time::{timeout, Duration};

static STREAM_STDOUT: AtomicBool = AtomicBool::new(true);
static REASONING_VISIBLE: AtomicBool = AtomicBool::new(true);

pub fn set_stdout_streaming_enabled(enabled: bool) {
    STREAM_STDOUT.store(enabled, Ordering::Relaxed);
}

pub(crate) fn stream_stdout_enabled() -> bool {
    STREAM_STDOUT.load(Ordering::Relaxed)
}

pub fn set_reasoning_visibility(enabled: bool) {
    REASONING_VISIBLE.store(enabled, Ordering::Relaxed);
}

pub(crate) fn reasoning_visible() -> bool {
    REASONING_VISIBLE.load(Ordering::Relaxed)
}

pub struct AgentRunResult {
    pub output: String,
    pub usage: CompletionUsage,
    pub metrics: AgentRunMetrics,
}

#[derive(Debug, Clone, Default)]
pub struct AgentRunMetrics {
    pub system_prompt_chars: usize,
    pub system_prompt_tokens_estimate: u32,
    pub system_prompt_cache_hit: bool,
    pub system_prompt_build_ms: u128,
    pub user_prompt_chars: usize,
    pub user_prompt_tokens_estimate: u32,
    pub total_turns: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ProviderTimeoutConfig {
    start_timeout_ms: u64,
    first_event_timeout_ms: u64,
    idle_event_timeout_ms: u64,
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
        let provider_name = self.provider.provider_name().to_string();
        let provider_timeout_config = provider_timeout_config_from_env();
        let native_user_input = provider_capabilities.user_input_native;
        let prompt_build_started = Instant::now();
        let system_prompt_build = build_system_prompt_with_metrics(&self.config)?;
        let system_prompt_build_ms = prompt_build_started.elapsed().as_millis();
        let system_prompt = if native_user_input {
            system_prompt_build.prompt
        } else {
            with_user_input_protocol(system_prompt_build.prompt)
        };
        let system_prompt_chars = system_prompt.chars().count();
        let user_prompt_chars = user_prompt.chars().count();

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
            let session_start = Instant::now();
            let mut session = timeout(
                Duration::from_millis(provider_timeout_config.start_timeout_ms),
                Arc::clone(&self.provider).start_session(messages.clone()),
            )
            .await
            .map_err(|_| {
                anyhow::anyhow!(
                    "Provider '{}' start_session timed out after {} ms",
                    provider_name,
                    provider_timeout_config.start_timeout_ms
                )
            })??;
            let session_start_ms = session_start.elapsed().as_millis();
            emit_provider_runtime_probe(
                &bus,
                &session_id_str,
                phase,
                &agent_name,
                TranscriptItemStatus::Info,
                format!(
                    "provider session started in {} ms ({})",
                    session_start_ms, provider_name
                ),
                serde_json::json!({
                    "provider": provider_name,
                    "probe": "session_started",
                    "duration_ms": session_start_ms,
                    "turn_count": turn_count,
                }),
            );

            let mut saw_provider_event = false;
            let usage = loop {
                let wait_timeout_ms = if saw_provider_event {
                    provider_timeout_config.idle_event_timeout_ms
                } else {
                    provider_timeout_config.first_event_timeout_ms
                };
                let next_event =
                    timeout(Duration::from_millis(wait_timeout_ms), session.next_event())
                        .await
                        .map_err(|_| {
                            let probe = if saw_provider_event {
                                "provider_idle_timeout"
                            } else {
                                "provider_first_event_timeout"
                            };
                            let summary = if saw_provider_event {
                                format!(
                                    "provider idle timeout after {} ms ({})",
                                    wait_timeout_ms, provider_name
                                )
                            } else {
                                format!(
                                    "provider first-event timeout after {} ms ({})",
                                    wait_timeout_ms, provider_name
                                )
                            };
                            emit_provider_runtime_probe(
                                &bus,
                                &session_id_str,
                                phase,
                                &agent_name,
                                TranscriptItemStatus::Failed,
                                summary.clone(),
                                serde_json::json!({
                                    "provider": provider_name,
                                    "probe": probe,
                                    "timeout_ms": wait_timeout_ms,
                                    "turn_count": turn_count,
                                }),
                            );
                            anyhow::anyhow!("{summary}")
                        })??;

                if !saw_provider_event {
                    saw_provider_event = true;
                    emit_provider_runtime_probe(
                        &bus,
                        &session_id_str,
                        phase,
                        &agent_name,
                        TranscriptItemStatus::Info,
                        format!("provider first event received ({})", provider_name),
                        serde_json::json!({
                            "provider": provider_name,
                            "probe": "first_event_received",
                            "turn_count": turn_count,
                        }),
                    );
                }

                match next_event {
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
            metrics: AgentRunMetrics {
                system_prompt_chars,
                system_prompt_tokens_estimate: estimate_tokens_from_chars(system_prompt_chars),
                system_prompt_cache_hit: system_prompt_build.cache_hit,
                system_prompt_build_ms,
                user_prompt_chars,
                user_prompt_tokens_estimate: estimate_tokens_from_chars(user_prompt_chars),
                total_turns: turn_count,
            },
        })
    }
}

fn estimate_tokens_from_chars(chars: usize) -> u32 {
    (chars / 4) as u32
}

fn provider_timeout_config_from_env() -> ProviderTimeoutConfig {
    ProviderTimeoutConfig {
        start_timeout_ms: parse_timeout_ms_env("KOKLO_PROVIDER_START_TIMEOUT_MS", 20_000),
        first_event_timeout_ms: parse_timeout_ms_env(
            "KOKLO_PROVIDER_FIRST_EVENT_TIMEOUT_MS",
            30_000,
        ),
        idle_event_timeout_ms: parse_timeout_ms_env("KOKLO_PROVIDER_IDLE_TIMEOUT_MS", 120_000),
    }
}

fn parse_timeout_ms_env(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn emit_provider_runtime_probe(
    bus: &EventBus,
    session_id: &str,
    phase: koklo_events::Phase,
    agent_name: &str,
    status: TranscriptItemStatus,
    summary: String,
    payload: serde_json::Value,
) {
    bus.send(PipelineEvent::Transcript {
        item: TranscriptItem::new(
            session_id.to_string(),
            Some(phase),
            Some(agent_name.to_string()),
            TranscriptSource::Provider,
            TranscriptItemKind::Message,
            status,
            summary,
        )
        .with_payload(payload),
    });
}
