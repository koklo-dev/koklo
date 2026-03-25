use super::*;

#[derive(PartialEq, Eq, Clone, Debug)]
pub(crate) enum Panel {
    Sessions,
    Phases,
    Log,
}

#[derive(PartialEq, Clone, Debug)]
pub(crate) enum TuiMode {
    Live,
    GateOverlay,
}

#[derive(PartialEq, Eq, Clone, Debug)]
pub(crate) enum Route {
    Dashboard,
    Workspace,
    SessionDetail,
    Summary,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FeedbackLevel {
    Info,
    Success,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LiveOverviewCardKind {
    Waiting,
    Assistant,
    Thinking,
    Activity,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TerminalLayout {
    Wide,
    Stacked,
    Compact,
}

#[derive(Clone, Debug)]
pub(crate) struct CommandFeedback {
    pub(crate) text: String,
    pub(crate) level: FeedbackLevel,
    pub(crate) expires_at: Instant,
}

#[derive(Clone, Debug)]
pub(crate) struct PendingUserInput {
    pub(crate) request_id: String,
    pub(crate) questions: Vec<UserInputQuestion>,
    pub(crate) answers: Vec<String>,
}

impl PendingUserInput {
    pub(crate) fn current_question(&self) -> Option<&UserInputQuestion> {
        self.questions.get(self.answers.len())
    }

    pub(crate) fn is_complete(&self) -> bool {
        self.answers.len() >= self.questions.len()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CommandAction {
    Help,
    Approve,
    Reject,
    Edit(PathBuf),
    Reply(String),
    Dashboard,
    Workspace,
    Focus(Panel),
    Live,
    Refresh,
    Summary,
    Quit,
}

pub(crate) const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// Live-updating TUI monitor application.
pub(crate) struct MonitorState {
    pub(crate) sessions: Vec<Session>,
    pub(crate) phases: Vec<PhaseRecord>,
    pub(crate) transcript: Vec<TranscriptItemRecord>,
    pub(crate) selected_session_id: Option<String>,
    pub(crate) last_seq: i64,
    /// When `Some`, only sessions from this project path are shown.
    pub(crate) project_filter: Option<String>,
    /// Index of the phase selected in the Phases panel. `None` = follow live phase.
    pub(crate) selected_phase: Option<usize>,
    pub(crate) session_usage: Option<SessionUsageSummary>,
    pub(crate) live_session_id: Option<String>,
    /// Preset phase names in order — used to pre-populate the phase panel as "pending".
    pub(crate) preset_phase_names: Vec<String>,
    /// Bus event overrides for phase status — survives DB rebuilds.
    pub(crate) bus_phase_status: HashMap<String, (String, Option<String>)>,
    /// Number of log lines kept above the live tail. `0` means follow live output.
    pub(crate) log_scroll: usize,
    pub(crate) current_dir: String,
    pub(crate) current_project_root: Option<String>,
}

pub(crate) struct MonitorUiState {
    pub(crate) focus: Panel,
    /// Incremented on every tick to drive spinner animation.
    pub(crate) tick_count: usize,
    pub(crate) running_tokens: u64,
    pub(crate) running_cost: Option<f64>,
    pub(crate) has_subscription_cost: bool,
    pub(crate) mode: TuiMode,
    pub(crate) route: Route,
    pub(crate) command_input: String,
    pub(crate) command_feedback: Option<CommandFeedback>,
    pub(crate) pending_user_input: Option<PendingUserInput>,
}

pub(crate) struct MonitorRuntimeState {
    pub(crate) event_rx: Option<broadcast::Receiver<PipelineEvent>>,
    pub(crate) gate_channel: Option<GateChannel>,
    pub(crate) pending_gate_display: Option<GateDisplay>,
    pub(crate) pending_gate_responder: Option<oneshot::Sender<GateResponse>>,
    pub(crate) user_input_channel: Option<UserInputChannel>,
    pub(crate) pending_user_input_responder: Option<oneshot::Sender<Vec<String>>>,
}

pub(crate) struct MonitorApp {
    pub(crate) state: MonitorState,
    pub(crate) ui: MonitorUiState,
    pub(crate) runtime: MonitorRuntimeState,
    pub(crate) storage: Arc<SessionManager>,
}
