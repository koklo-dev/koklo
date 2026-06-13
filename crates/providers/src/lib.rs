//! LLM provider gateway — registry, per-agent selection, CLI subprocess providers.
//!
//! Provider resolution order (per agent):
//! 1. `KOKLO_PROVIDER_<AGENT_UPPER>` env var → registry lookup
//! 2. `agent_providers` map (from TOML)
//! 3. `default_provider`

pub mod cli;
pub mod config;
pub mod detect;
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
pub use detect::{
    detect_provider, list_ollama_models, ollama_base_url, DetectionSource, ProviderDetection,
};
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
use serde_json::{json, Value};
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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandDetails {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub argv: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aggregated_output: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileChangeEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lines: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub added: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub removed: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileChangeDetails {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub changes: Vec<FileChangeEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
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
        details: Option<CommandDetails>,
    },
    FileChange {
        item_id: Option<String>,
        summary: String,
        files: Vec<String>,
        status: String,
        details: Option<FileChangeDetails>,
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

impl ProviderEvent {
    pub const CONTRACT_VERSION: &'static str = "koklo.provider_event.v2";

    pub fn item_id(&self) -> Option<&str> {
        match self {
            ProviderEvent::MessageDelta { .. } | ProviderEvent::MessageCompleted => None,
            ProviderEvent::ToolCall { item_id, .. }
            | ProviderEvent::ToolResult { item_id, .. }
            | ProviderEvent::Reasoning { item_id, .. }
            | ProviderEvent::Plan { item_id, .. }
            | ProviderEvent::Command { item_id, .. }
            | ProviderEvent::FileChange { item_id, .. }
            | ProviderEvent::UserInputRequest { item_id, .. }
            | ProviderEvent::ApprovalRequest { item_id, .. }
            | ProviderEvent::Metadata { item_id, .. } => item_id.as_deref(),
        }
    }

    pub fn canonical_event_name(&self) -> &'static str {
        match self {
            ProviderEvent::MessageDelta { .. } => "assistant_text_delta",
            ProviderEvent::MessageCompleted => "assistant_text_completed",
            ProviderEvent::ToolCall { .. } => "tool_call",
            ProviderEvent::ToolResult { .. } => "tool_result",
            ProviderEvent::Reasoning { .. } => "reasoning_delta",
            ProviderEvent::Plan { .. } => "plan_update",
            ProviderEvent::Command { .. } => "command_update",
            ProviderEvent::FileChange { .. } => "file_change",
            ProviderEvent::UserInputRequest { .. } => "user_input_request",
            ProviderEvent::ApprovalRequest { .. } => "approval_request",
            ProviderEvent::Metadata { .. } => "provider_metadata",
        }
    }

    pub fn canonical_status(&self) -> &'static str {
        match self {
            ProviderEvent::MessageDelta { .. } => "streaming",
            ProviderEvent::MessageCompleted => "completed",
            ProviderEvent::ToolCall { .. } => "pending",
            ProviderEvent::ToolResult {
                success: Some(false),
                ..
            } => "failed",
            ProviderEvent::ToolResult { .. } => "completed",
            ProviderEvent::Reasoning { .. } => "streaming",
            ProviderEvent::Plan { .. } => "info",
            ProviderEvent::Command { status, .. } => match status.as_str() {
                "completed" => "completed",
                "failed" => "failed",
                "in_progress" | "updated" => "streaming",
                _ => "streaming",
            },
            ProviderEvent::FileChange { status, .. } => match status.as_str() {
                "failed" => "failed",
                "completed" => "completed",
                _ => "streaming",
            },
            ProviderEvent::UserInputRequest { .. } | ProviderEvent::ApprovalRequest { .. } => {
                "pending"
            }
            ProviderEvent::Metadata { .. } => "info",
        }
    }

    pub fn canonical_payload(&self) -> Value {
        let mut payload = match self {
            ProviderEvent::MessageDelta { text } => json!({
                "text": text,
            }),
            ProviderEvent::MessageCompleted => json!({}),
            ProviderEvent::ToolCall {
                tool_name,
                input_summary,
                ..
            } => json!({
                "tool_name": tool_name,
                "tool_kind": canonical_tool_kind(tool_name),
                "input_summary": input_summary,
            }),
            ProviderEvent::ToolResult {
                tool_name,
                output_summary,
                success,
                ..
            } => json!({
                "tool_name": tool_name,
                "tool_kind": canonical_tool_kind(tool_name),
                "output_summary": output_summary,
                "success": success,
            }),
            ProviderEvent::Reasoning { text, .. } => json!({
                "text": text,
            }),
            ProviderEvent::Plan { text, .. } => json!({
                "text": text,
            }),
            ProviderEvent::Command {
                command,
                status,
                exit_code,
                output,
                details,
                ..
            } => json!({
                "command": command,
                "status": status,
                "exit_code": exit_code,
                "output": output,
                "details": details,
                "argv": details.as_ref().map(|details| details.argv.clone()).filter(|argv| !argv.is_empty()),
                "cwd": details.as_ref().and_then(|details| details.cwd.clone()),
                "aggregated_output": details
                    .as_ref()
                    .and_then(|details| details.aggregated_output.clone())
                    .or_else(|| output.clone()),
            }),
            ProviderEvent::FileChange {
                summary,
                files,
                status,
                details,
                ..
            } => json!({
                "summary": summary,
                "files": files,
                "file_count": files.len(),
                "status": status,
                "details": details,
                "delta": details.as_ref().and_then(|details| details.delta.clone()),
                "changes": details
                    .as_ref()
                    .map(|details| details.changes.clone())
                    .filter(|changes| !changes.is_empty()),
            }),
            ProviderEvent::UserInputRequest { questions, .. } => json!({
                "question_count": questions.len(),
                "questions": questions,
            }),
            ProviderEvent::ApprovalRequest {
                request_id,
                kind,
                description,
                details,
                ..
            } => json!({
                "request_id": request_id,
                "approval_kind": canonical_approval_kind(*kind),
                "description": description,
                "details": details,
            }),
            ProviderEvent::Metadata { kind, value, .. } => json!({
                "kind": kind,
                "value": value,
            }),
        };

        if let Some(map) = payload.as_object_mut() {
            map.insert(
                "contract_version".to_string(),
                json!(Self::CONTRACT_VERSION),
            );
            map.insert("event_name".to_string(), json!(self.canonical_event_name()));
            map.insert("event_status".to_string(), json!(self.canonical_status()));
            map.insert("item_id".to_string(), json!(self.item_id()));
        }

        payload
    }
}

pub fn canonical_tool_kind(tool_name: &str) -> &'static str {
    let lower = tool_name.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return "other";
    }
    if lower.contains("read") {
        return "read";
    }
    if lower.contains("grep") || lower.contains("glob") || lower.contains("search") {
        return "search";
    }
    if lower.contains("edit") || lower.contains("patch") {
        return "edit";
    }
    if lower == "write" || lower.contains("write") {
        return "write";
    }
    if lower.contains("bash") || lower.contains("command") || lower.contains("exec") {
        return "command";
    }
    if lower.contains("web_search") || lower.contains("web-search") {
        return "search";
    }
    if lower.contains("sendusermessage") || lower.contains("ask_user") {
        return "user_input";
    }
    if lower.contains('/') {
        return "mcp";
    }
    "other"
}

pub fn canonical_approval_kind(kind: ProviderApprovalKind) -> &'static str {
    match kind {
        ProviderApprovalKind::CommandExecution => "command_execution",
        ProviderApprovalKind::FileChange => "file_change",
        ProviderApprovalKind::Permissions => "permissions",
        ProviderApprovalKind::PatchApply => "patch_apply",
    }
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

    #[test]
    fn test_canonical_tool_kind_normalizes_common_cli_tools() {
        assert_eq!(canonical_tool_kind("Read"), "read");
        assert_eq!(canonical_tool_kind("Grep"), "search");
        assert_eq!(canonical_tool_kind("Edit"), "edit");
        assert_eq!(canonical_tool_kind("Write"), "write");
        assert_eq!(canonical_tool_kind("Bash"), "command");
        assert_eq!(canonical_tool_kind("web_search"), "search");
        assert_eq!(canonical_tool_kind("mcp/filesystem"), "mcp");
    }

    #[test]
    fn test_provider_event_canonical_payload_includes_contract_fields() {
        let payload = ProviderEvent::ToolCall {
            item_id: Some("tool-1".to_string()),
            tool_name: "Read".to_string(),
            input_summary: "Cargo.toml".to_string(),
        }
        .canonical_payload();

        assert_eq!(
            payload.get("contract_version").and_then(Value::as_str),
            Some(ProviderEvent::CONTRACT_VERSION)
        );
        assert_eq!(
            payload.get("event_name").and_then(Value::as_str),
            Some("tool_call")
        );
        assert_eq!(
            payload.get("event_status").and_then(Value::as_str),
            Some("pending")
        );
        assert_eq!(
            payload.get("item_id").and_then(Value::as_str),
            Some("tool-1")
        );
        assert_eq!(
            payload.get("tool_kind").and_then(Value::as_str),
            Some("read")
        );
        assert_eq!(
            payload.get("input_summary").and_then(Value::as_str),
            Some("Cargo.toml")
        );
    }
}
