//! LLM provider gateway — registry, per-agent selection, CLI subprocess providers.
//!
//! Provider resolution order (per agent):
//! 1. `KOKLO_PROVIDER_<AGENT_UPPER>` env var → registry lookup
//! 2. `agent_providers` map (from TOML)
//! 3. `default_provider`

pub mod cli;
pub mod config;
pub mod error;
pub mod fallback;
pub mod ollama;
pub(crate) mod openai_compat;
pub mod openrouter;
pub mod registry;
pub mod secrets;

pub use cli::claude_code::ClaudeCodeCliProvider;
pub use cli::codex::CodexCliProvider;
pub use config::{AgentTomlConfig, PipelineTomlConfig, ProviderRouting, ProviderTomlEntry};
pub use error::ProviderError;
pub use fallback::FallbackProvider;
pub use ollama::OllamaProvider;
pub use openrouter::OpenRouterProvider;
pub use registry::ProviderRegistry;
pub use secrets::{has_secret, load_secrets_into_env, resolve_secret, secrets_path};

use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{CompletionUsage, CostDisplay, UserInputQuestion};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// Tool event carried inside a `StreamChunk`.
#[derive(Debug, Clone)]
pub enum ToolEvent {
    /// The agent invoked a tool.
    Call {
        tool_name: String,
        input_summary: String,
    },
    /// The agent received a tool result.
    Result {
        tool_name: String,
        output_summary: String,
    },
}

/// Provider capabilities exposed to the Koklo runtime.
#[derive(Debug, Clone, Default)]
pub struct ProviderCapabilities {
    pub streaming_text: bool,
    pub usage_native: bool,
    pub tool_calls_native: bool,
    pub approvals_native: bool,
    pub user_input_native: bool,
    pub reasoning_visible: bool,
    pub interaction_mode: ProviderInteractionMode,
}

/// How much of the interactive contract is implemented natively by the provider.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderInteractionMode {
    /// Provider exposes the Koklo contract with native structured interactions.
    Native,
    /// Provider is adapted into the Koklo contract with normalized events.
    Normalized,
    /// Provider requires Koklo to synthesize parts of the interaction loop.
    #[default]
    Synthetic,
}

/// Response payload sent back into an interactive provider session.
#[derive(Debug, Clone)]
pub struct UserInputPayload {
    pub request_id: Option<String>,
    pub answers: Vec<String>,
}

/// Approval decision sent back into an interactive provider session.
#[derive(Debug, Clone)]
pub enum ProviderApprovalDecision {
    Approve,
    Reject,
    Edit { path: Option<String> },
}

/// Approval payload sent back into an interactive provider session.
#[derive(Debug, Clone)]
pub struct ProviderApprovalPayload {
    pub request_id: Option<String>,
    pub decision: ProviderApprovalDecision,
}

/// Kind of approval requested by an interactive provider session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderApprovalKind {
    CommandExecution,
    FileChange,
    Permissions,
    PatchApply,
}

/// Normalized event stream emitted by providers.
#[derive(Debug, Clone)]
pub enum ProviderEvent {
    MessageDelta {
        text: String,
    },
    MessageCompleted,
    ToolCall {
        item_id: Option<String>,
        tool_name: String,
        input_summary: String,
    },
    ToolResult {
        item_id: Option<String>,
        tool_name: String,
        output_summary: String,
        success: Option<bool>,
    },
    Reasoning {
        item_id: Option<String>,
        text: String,
    },
    Plan {
        item_id: Option<String>,
        text: String,
    },
    Command {
        item_id: Option<String>,
        command: String,
        status: String,
        exit_code: Option<i64>,
        output: Option<String>,
    },
    FileChange {
        item_id: Option<String>,
        summary: String,
        files: Vec<String>,
        status: String,
    },
    UserInputRequest {
        item_id: Option<String>,
        questions: Vec<UserInputQuestion>,
    },
    ApprovalRequest {
        item_id: Option<String>,
        request_id: String,
        kind: ProviderApprovalKind,
        description: String,
        details: Value,
    },
    Metadata {
        item_id: Option<String>,
        kind: String,
        value: Value,
    },
}

/// Stream item emitted by a provider session.
#[derive(Debug, Clone)]
pub enum ProviderSessionEvent {
    Event(ProviderEvent),
    Finished {
        output: String,
        usage: CompletionUsage,
    },
}

/// Interactive provider session used by the Koklo runtime.
#[async_trait]
pub trait ProviderSession: Send {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent>;

    async fn send_user_input(&mut self, _input: UserInputPayload) -> Result<()> {
        anyhow::bail!("provider session does not accept user input")
    }

    async fn resolve_approval(&mut self, _approval: ProviderApprovalPayload) -> Result<()> {
        anyhow::bail!("provider session does not accept approval decisions")
    }

    async fn cancel(&mut self) -> Result<()> {
        Ok(())
    }
}

/// A chunk of streamed text from an LLM.
#[derive(Debug, Clone)]
pub struct StreamChunk {
    pub text: String,
    pub finished: bool,
    /// Optional tool event (CLI providers in stream-json mode).
    pub tool_event: Option<ToolEvent>,
    /// Normalized provider events consumed by the runtime.
    pub events: Vec<ProviderEvent>,
}

struct CompatProviderSession {
    receiver: mpsc::UnboundedReceiver<Result<ProviderSessionEvent>>,
    task: Option<JoinHandle<()>>,
}

struct NormalizedProviderSession {
    receiver: mpsc::UnboundedReceiver<Result<ProviderSessionEvent>>,
    task: Option<JoinHandle<()>>,
}

pub(crate) fn compat_session<P>(
    provider: Arc<P>,
    messages: Vec<Message>,
) -> Box<dyn ProviderSession>
where
    P: LlmProvider + ?Sized + 'static,
{
    Box::new(CompatProviderSession::spawn(provider, messages))
}

pub(crate) fn normalized_session<P>(
    provider: Arc<P>,
    messages: Vec<Message>,
) -> Box<dyn ProviderSession>
where
    P: LlmProvider + ?Sized + 'static,
{
    Box::new(NormalizedProviderSession::spawn(provider, messages))
}

impl CompatProviderSession {
    fn spawn<P>(provider: Arc<P>, messages: Vec<Message>) -> Self
    where
        P: LlmProvider + ?Sized + 'static,
    {
        let (sender, receiver) = mpsc::unbounded_channel::<Result<ProviderSessionEvent>>();
        let task = tokio::spawn(async move {
            let mut sender = Some(sender);
            let result = provider
                .complete_stream(messages, &mut |chunk| {
                    if let Some(tx) = sender.as_ref() {
                        for event in chunk_into_session_events(chunk) {
                            let _ = tx.send(Ok(event));
                        }
                    }
                })
                .await;

            match result {
                Ok((output, usage)) => {
                    if let Some(tx) = sender.take() {
                        let _ = tx.send(Ok(ProviderSessionEvent::Finished { output, usage }));
                    }
                }
                Err(error) => {
                    if let Some(tx) = sender.take() {
                        let _ = tx.send(Err(error));
                    }
                }
            }
        });

        Self {
            receiver,
            task: Some(task),
        }
    }
}

impl NormalizedProviderSession {
    fn spawn<P>(provider: Arc<P>, messages: Vec<Message>) -> Self
    where
        P: LlmProvider + ?Sized + 'static,
    {
        let (sender, receiver) = mpsc::unbounded_channel::<Result<ProviderSessionEvent>>();
        let task = tokio::spawn(async move {
            let mut sender = Some(sender);
            let result = provider
                .complete_stream(messages, &mut |chunk| {
                    if let Some(tx) = sender.as_ref() {
                        for event in chunk_into_session_events(chunk) {
                            let _ = tx.send(Ok(event));
                        }
                    }
                })
                .await;

            match result {
                Ok((output, usage)) => {
                    if let Some(tx) = sender.take() {
                        let _ = tx.send(Ok(ProviderSessionEvent::Finished { output, usage }));
                    }
                }
                Err(error) => {
                    if let Some(tx) = sender.take() {
                        let _ = tx.send(Err(error));
                    }
                }
            }
        });

        Self {
            receiver,
            task: Some(task),
        }
    }
}

#[async_trait]
impl ProviderSession for CompatProviderSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        match self.receiver.recv().await {
            Some(result) => result,
            None => anyhow::bail!("provider session ended unexpectedly"),
        }
    }

    async fn cancel(&mut self) -> Result<()> {
        if let Some(task) = self.task.take() {
            task.abort();
        }
        Ok(())
    }
}

#[async_trait]
impl ProviderSession for NormalizedProviderSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        match self.receiver.recv().await {
            Some(result) => result,
            None => anyhow::bail!("normalized provider session ended unexpectedly"),
        }
    }

    async fn cancel(&mut self) -> Result<()> {
        if let Some(task) = self.task.take() {
            task.abort();
        }
        Ok(())
    }
}

impl Drop for CompatProviderSession {
    fn drop(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

impl Drop for NormalizedProviderSession {
    fn drop(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

fn chunk_into_session_events(chunk: StreamChunk) -> Vec<ProviderSessionEvent> {
    let StreamChunk {
        text,
        finished,
        tool_event,
        events,
    } = chunk;

    let mut session_events = Vec::new();
    if !events.is_empty() {
        session_events.extend(events.into_iter().map(ProviderSessionEvent::Event));
        return session_events;
    }

    if !text.is_empty() {
        session_events.push(ProviderSessionEvent::Event(ProviderEvent::MessageDelta {
            text,
        }));
    }

    if let Some(tool_event) = tool_event {
        let event = match tool_event {
            ToolEvent::Call {
                tool_name,
                input_summary,
            } => ProviderEvent::ToolCall {
                item_id: None,
                tool_name,
                input_summary,
            },
            ToolEvent::Result {
                tool_name,
                output_summary,
            } => ProviderEvent::ToolResult {
                item_id: None,
                tool_name,
                output_summary,
                success: None,
            },
        };
        session_events.push(ProviderSessionEvent::Event(event));
    }

    if finished {
        session_events.push(ProviderSessionEvent::Event(ProviderEvent::MessageCompleted));
    }

    session_events
}

impl StreamChunk {
    pub fn text(text: impl Into<String>) -> Self {
        let text = text.into();
        let events = if text.is_empty() {
            Vec::new()
        } else {
            vec![ProviderEvent::MessageDelta { text: text.clone() }]
        };
        Self {
            text,
            finished: false,
            tool_event: None,
            events,
        }
    }

    pub fn finished() -> Self {
        Self {
            text: String::new(),
            finished: true,
            tool_event: None,
            events: vec![ProviderEvent::MessageCompleted],
        }
    }

    pub fn event(event: ProviderEvent) -> Self {
        let tool_event = match &event {
            ProviderEvent::ToolCall {
                tool_name,
                input_summary,
                ..
            } => Some(ToolEvent::Call {
                tool_name: tool_name.clone(),
                input_summary: input_summary.clone(),
            }),
            ProviderEvent::ToolResult {
                tool_name,
                output_summary,
                ..
            } => Some(ToolEvent::Result {
                tool_name: tool_name.clone(),
                output_summary: output_summary.clone(),
            }),
            _ => None,
        };
        Self {
            text: String::new(),
            finished: false,
            tool_event,
            events: vec![event],
        }
    }
}

/// Trait every LLM provider must implement.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Start an interactive provider session.
    async fn start_session(
        self: Arc<Self>,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>>
    where
        Self: 'static,
    {
        Ok(compat_session(self, messages))
    }

    /// Stream a completion for the given messages. Calls `on_chunk` for each chunk.
    /// Returns the full response text and token usage.
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)>;

    /// Compute the cost for a given usage. Returns `None` if not applicable.
    fn compute_cost(&self, _usage: &CompletionUsage) -> Option<CostDisplay> {
        None
    }

    /// Provider capabilities used to synthesize a consistent Koklo UX.
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming_text: true,
            interaction_mode: ProviderInteractionMode::Synthetic,
            ..ProviderCapabilities::default()
        }
    }

    /// Provider/model key for display (e.g. `"openrouter/gpt-4o"`).
    fn provider_model_key(&self) -> String {
        format!(
            "{}/{}",
            self.provider_name(),
            self.model_name().unwrap_or("unknown")
        )
    }

    /// Stable identifier for this provider (e.g. `"anthropic"`, `"claude-code-cli"`).
    fn provider_name(&self) -> &str;

    /// Optional model name (e.g. `"claude-opus-4-6"`). Defaults to `None`.
    fn model_name(&self) -> Option<&str> {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

impl Message {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
        }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
        }
    }
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_message_constructors() {
        let m = Message::user("hello");
        assert_eq!(m.role, "user");
        assert_eq!(m.content, "hello");

        let s = Message::system("be helpful");
        assert_eq!(s.role, "system");

        let a = Message::assistant("sure");
        assert_eq!(a.role, "assistant");
    }

    struct SessionCompatProvider;

    #[async_trait]
    impl LlmProvider for SessionCompatProvider {
        async fn complete_stream(
            &self,
            _messages: Vec<Message>,
            on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
        ) -> Result<(String, CompletionUsage)> {
            on_chunk(StreamChunk::text("hello"));
            on_chunk(StreamChunk::finished());
            Ok((
                "hello".to_string(),
                CompletionUsage {
                    prompt_tokens: 3,
                    completion_tokens: 5,
                },
            ))
        }

        fn provider_name(&self) -> &str {
            "session-compat"
        }
    }

    #[tokio::test]
    async fn test_start_session_uses_compat_adapter() {
        let provider: Arc<dyn LlmProvider> = Arc::new(SessionCompatProvider);
        let mut session = provider
            .start_session(vec![Message::user("ping")])
            .await
            .unwrap();

        let first = session.next_event().await.unwrap();
        assert!(matches!(
            first,
            ProviderSessionEvent::Event(ProviderEvent::MessageDelta { ref text }) if text == "hello"
        ));

        let second = session.next_event().await.unwrap();
        assert!(matches!(
            second,
            ProviderSessionEvent::Event(ProviderEvent::MessageCompleted)
        ));

        let third = session.next_event().await.unwrap();
        assert!(matches!(
            third,
            ProviderSessionEvent::Finished {
                output,
                usage: CompletionUsage {
                    prompt_tokens: 3,
                    completion_tokens: 5,
                },
            } if output == "hello"
        ));
    }

    #[test]
    fn test_ollama_provider_from_env() {
        let p = OllamaProvider::from_env();
        assert!(!p.base_url.is_empty());
        assert!(!p.model.is_empty());
        assert_eq!(p.provider_name(), "ollama");
    }
}
