//! Pipeline event bus — tokio broadcast channel.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, oneshot};
use uuid::Uuid;

/// Pipeline execution phases.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Phase {
    // ── SDD (default) ────────────────────────────────────────────────────
    /// Product spec authored by the PM agent.
    Spec,
    /// Technical plan authored by the Architect agent.
    Plan,
    /// Code implementation authored by the Developer agent.
    Implement,
    /// Test suite authored/run by the QA agent.
    Test,
    /// Code review + PR authored by the Reviewer agent.
    Review,
    // ── BMAD additions ───────────────────────────────────────────────────
    /// Business analysis authored by the Analyst agent (BMAD phase 1).
    Analysis,
    /// OWASP security review authored by the Security agent.
    Security,
    /// Documentation update authored by the Doc-writer agent.
    Docs,
    // ── Spec Kit additions ───────────────────────────────────────────────
    /// Project constitution authored by the Constitution-writer agent.
    Constitution,
    /// Atomic task decomposition authored by the Task-planner agent.
    Tasks,
}

impl std::fmt::Display for Phase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Phase::Spec => write!(f, "spec"),
            Phase::Plan => write!(f, "plan"),
            Phase::Implement => write!(f, "implement"),
            Phase::Test => write!(f, "test"),
            Phase::Review => write!(f, "review"),
            Phase::Analysis => write!(f, "analysis"),
            Phase::Security => write!(f, "security"),
            Phase::Docs => write!(f, "docs"),
            Phase::Constitution => write!(f, "constitution"),
            Phase::Tasks => write!(f, "tasks"),
        }
    }
}

impl Phase {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "spec" => Some(Self::Spec),
            "plan" => Some(Self::Plan),
            "implement" => Some(Self::Implement),
            "test" => Some(Self::Test),
            "review" => Some(Self::Review),
            "analysis" => Some(Self::Analysis),
            "security" => Some(Self::Security),
            "docs" => Some(Self::Docs),
            "constitution" => Some(Self::Constitution),
            "tasks" => Some(Self::Tasks),
            _ => None,
        }
    }
}

/// Human gate decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GateAction {
    Approve,
    Reject,
    Edit(PathBuf),
}

/// Token usage returned by each provider call.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompletionUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

impl CompletionUsage {
    pub fn total_tokens(&self) -> u32 {
        self.prompt_tokens + self.completion_tokens
    }
}

/// Pricing for cost computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    /// USD per million input tokens.
    pub input_per_mtok: f64,
    /// USD per million output tokens.
    pub output_per_mtok: f64,
}

impl ModelPricing {
    pub fn compute_cost(&self, usage: &CompletionUsage) -> f64 {
        (usage.prompt_tokens as f64 * self.input_per_mtok
            + usage.completion_tokens as f64 * self.output_per_mtok)
            / 1_000_000.0
    }
}

/// How to display cost based on provider mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CostDisplay {
    Usd(f64),
    Subscription,
    Free,
}

/// Gate response from the user.
#[derive(Debug)]
pub enum GateResponse {
    Approve,
    Reject,
    Edit(std::path::PathBuf),
}

/// Display information for a gate (no sender — cloneable).
#[derive(Debug, Clone)]
pub struct GateDisplay {
    pub phase: Phase,
    pub session_id: String,
    pub description: String,
    pub usage: Option<CompletionUsage>,
    pub cost: Option<CostDisplay>,
    pub allow_edit: bool,
}

/// Structured question presented to the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInputQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub options: Option<Vec<String>>,
    pub is_secret: bool,
}

/// Display information for a user input request (no sender — cloneable).
#[derive(Debug, Clone)]
pub struct UserInputDisplay {
    pub request_id: String,
    pub session_id: String,
    pub phase: Option<Phase>,
    pub agent_name: Option<String>,
    pub questions: Vec<UserInputQuestion>,
}

/// Gate request placed in the channel by the TuiGateHandler.
/// Contains display info + the oneshot sender to respond.
pub struct GateRequest {
    pub display: GateDisplay,
    pub responder: oneshot::Sender<GateResponse>,
}

/// User input request placed in the channel by the runtime.
pub struct UserInputRequest {
    pub display: UserInputDisplay,
    pub responder: oneshot::Sender<Vec<String>>,
}

/// High-level origin of a transcript item.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TranscriptSource {
    Agent,
    Tool,
    Provider,
    System,
    User,
}

/// Structured transcript item kind used by the runtime and TUI.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TranscriptItemKind {
    MessageDelta,
    Message,
    ToolCall,
    ToolResult,
    Reasoning,
    Plan,
    Command,
    FileChange,
    UserInputRequest,
    UserInputResponse,
    ApprovalRequest,
    ApprovalDecision,
    Usage,
    PhaseLifecycle,
    SessionLifecycle,
}

/// Item lifecycle / display status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TranscriptItemStatus {
    Pending,
    Streaming,
    Completed,
    Failed,
    Resolved,
    Info,
}

/// One typed record in a session transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptItem {
    pub id: String,
    pub session_id: String,
    pub phase: Option<Phase>,
    pub agent_name: Option<String>,
    pub source: TranscriptSource,
    pub kind: TranscriptItemKind,
    pub status: TranscriptItemStatus,
    pub item_key: Option<String>,
    pub summary: String,
    pub payload: Option<Value>,
}

impl TranscriptItem {
    pub fn new(
        session_id: impl Into<String>,
        phase: Option<Phase>,
        agent_name: Option<String>,
        source: TranscriptSource,
        kind: TranscriptItemKind,
        status: TranscriptItemStatus,
        summary: impl Into<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.into(),
            phase,
            agent_name,
            source,
            kind,
            status,
            item_key: None,
            summary: summary.into(),
            payload: None,
        }
    }

    pub fn with_item_key(mut self, item_key: impl Into<String>) -> Self {
        self.item_key = Some(item_key.into());
        self
    }

    pub fn with_payload(mut self, payload: Value) -> Self {
        self.payload = Some(payload);
        self
    }
}

/// In-memory coordination channel between the pipeline and the TUI.
/// Does NOT go through the broadcast event bus.
#[derive(Clone)]
pub struct GateChannel {
    inner: Arc<Mutex<Option<GateRequest>>>,
}

impl Default for GateChannel {
    fn default() -> Self {
        Self::new()
    }
}

impl GateChannel {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    pub fn clone_handle(&self) -> Self {
        self.clone()
    }

    /// Called by TuiGateHandler: deposit a request and await response.
    pub async fn deposit_and_await(&self, display: GateDisplay) -> anyhow::Result<GateResponse> {
        let (tx, rx) = oneshot::channel();
        let req = GateRequest {
            display,
            responder: tx,
        };
        {
            let mut guard = self.inner.lock().unwrap();
            *guard = Some(req);
        }
        rx.await
            .map_err(|_| anyhow::anyhow!("Gate channel closed — TUI quit?"))
    }

    /// Called by the TUI tick: take the pending request (display + sender).
    pub fn take_pending(&self) -> Option<GateRequest> {
        self.inner.lock().unwrap().take()
    }

    pub fn has_pending(&self) -> bool {
        self.inner.lock().unwrap().is_some()
    }
}

/// In-memory coordination channel for agent questions and user responses.
#[derive(Clone)]
pub struct UserInputChannel {
    inner: Arc<Mutex<Option<UserInputRequest>>>,
}

impl Default for UserInputChannel {
    fn default() -> Self {
        Self::new()
    }
}

impl UserInputChannel {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    pub fn clone_handle(&self) -> Self {
        self.clone()
    }

    pub async fn deposit_and_await(
        &self,
        display: UserInputDisplay,
    ) -> anyhow::Result<Vec<String>> {
        let (tx, rx) = oneshot::channel();
        let req = UserInputRequest {
            display,
            responder: tx,
        };
        {
            let mut guard = self.inner.lock().unwrap();
            *guard = Some(req);
        }
        rx.await
            .map_err(|_| anyhow::anyhow!("User input channel closed — TUI quit?"))
    }

    pub fn take_pending(&self) -> Option<UserInputRequest> {
        self.inner.lock().unwrap().take()
    }

    pub fn has_pending(&self) -> bool {
        self.inner.lock().unwrap().is_some()
    }
}

/// Events emitted by the pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineEvent {
    Transcript {
        item: TranscriptItem,
    },
    PhaseStarted {
        phase: Phase,
        session_id: String,
    },
    PhaseCompleted {
        phase: Phase,
        session_id: String,
    },
    PhaseFailed {
        phase: Phase,
        session_id: String,
        error: String,
    },
    AgentLog {
        phase: Phase,
        session_id: String,
        message: String,
    },
    GateRequired {
        phase: Phase,
        session_id: String,
        description: String,
    },
    GateResolved {
        phase: Phase,
        session_id: String,
        action: GateAction,
    },
    PrCreated {
        session_id: String,
        url: String,
        title: String,
    },
    UsageUpdate {
        session_id: String,
        phase: Phase,
        agent_name: String,
        provider: String,
        model: Option<String>,
        prompt_tokens: u32,
        completion_tokens: u32,
        cost: Option<CostDisplay>,
    },
    SessionCompleted {
        session_id: String,
    },
    /// A CLI agent invoked a tool (file edit, bash command, etc.).
    ToolCall {
        phase: Phase,
        session_id: String,
        /// Tool name, e.g. `"Write"`, `"Bash"`, `"Edit"`.
        tool_name: String,
        /// Short summary of the input (file path or command, ≤60 chars).
        input_summary: String,
    },
    /// A CLI agent received a tool result.
    ToolResult {
        phase: Phase,
        session_id: String,
        tool_name: String,
        /// First line of output, or `"ok"` / `"exit 0"`.
        output_summary: String,
    },
}

/// Wrapper around a tokio broadcast channel.
#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<PipelineEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PipelineEvent> {
        self.sender.subscribe()
    }

    /// Send an event; returns the number of active receivers.
    pub fn send(&self, event: PipelineEvent) -> usize {
        self.sender.send(event).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_send_receive() {
        let bus = EventBus::new(16);
        let mut rx = bus.subscribe();

        bus.send(PipelineEvent::PhaseStarted {
            phase: Phase::Spec,
            session_id: "test-session".to_string(),
        });

        let event = rx.recv().await.unwrap();
        match event {
            PipelineEvent::PhaseStarted { phase, session_id } => {
                assert_eq!(phase, Phase::Spec);
                assert_eq!(session_id, "test-session");
            }
            _ => panic!("unexpected event"),
        }
    }

    #[test]
    fn test_phase_display() {
        assert_eq!(Phase::Spec.to_string(), "spec");
        assert_eq!(Phase::Plan.to_string(), "plan");
        assert_eq!(Phase::Implement.to_string(), "implement");
        assert_eq!(Phase::Test.to_string(), "test");
        assert_eq!(Phase::Review.to_string(), "review");
        assert_eq!(Phase::Analysis.to_string(), "analysis");
        assert_eq!(Phase::Security.to_string(), "security");
        assert_eq!(Phase::Docs.to_string(), "docs");
        assert_eq!(Phase::Constitution.to_string(), "constitution");
        assert_eq!(Phase::Tasks.to_string(), "tasks");
    }

    #[test]
    fn test_phase_is_copy() {
        let p = Phase::Spec;
        let _q = p; // copy
        let _r = p; // still usable after copy
    }

    #[test]
    fn test_completion_usage_total() {
        let u = CompletionUsage {
            prompt_tokens: 100,
            completion_tokens: 50,
        };
        assert_eq!(u.total_tokens(), 150);
    }

    #[test]
    fn test_gate_channel_basic() {
        let ch = GateChannel::new();
        assert!(!ch.has_pending());
    }
}
