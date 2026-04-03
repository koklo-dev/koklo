use super::*;

// ── Focus zones (3-column layout) ──────────────────────────────────

#[allow(dead_code)]
#[derive(PartialEq, Eq, Clone, Copy, Debug)]
pub(crate) enum FocusZone {
    Sidebar,
    Main,
    RightPanel,
}

// ── Legacy Panel (kept for backward compat within screens) ─────────

#[derive(PartialEq, Eq, Clone, Debug)]
pub(crate) enum Panel {
    Sessions,
    Phases,
    Log,
}

// ── TUI modes ──────────────────────────────────────────────────────

#[derive(PartialEq, Clone, Debug)]
pub(crate) enum TuiMode {
    Live,
    GateOverlay,
    CommandPalette,
}

// ── Route (14 screens) ─────────────────────────────────────────────

#[allow(dead_code)]
#[derive(PartialEq, Eq, Clone, Debug)]
pub(crate) enum Route {
    // Core (Phase 1 — existing refactored)
    ProjectHome,
    Dashboard,
    Workspace,
    SessionDetail,
    Summary,

    // Phase 2 — new screens
    Conversation,
    ConversationHistory,
    AssistantSelector,
    ExecutionProgress,
    StructuredResults,

    // Phase 3 — data screens
    Tasks,
    Workflows,
    Settings,
    CodeGit,
    BmadMode,
    FileExplorer,
}

impl Route {
    /// Index of this route in the sidebar, or `None` if it's a sub-screen.
    pub(crate) fn sidebar_index(&self) -> Option<usize> {
        match self {
            Route::ProjectHome | Route::Dashboard => Some(0),
            Route::SessionDetail | Route::Conversation | Route::ExecutionProgress => Some(1),
            Route::ConversationHistory => Some(2),
            Route::Tasks => Some(3),
            Route::CodeGit => Some(4),
            Route::Workflows | Route::BmadMode => Some(5),
            Route::AssistantSelector => Some(6),
            Route::Settings => Some(7),
            _ => None,
        }
    }

    /// Human-readable label for breadcrumb.
    pub(crate) fn label(&self) -> &'static str {
        match self {
            Route::ProjectHome => "Accueil",
            Route::Dashboard => "Dashboard",
            Route::Workspace => "Workspace",
            Route::SessionDetail => "Session",
            Route::Summary => "Résumé",
            Route::Conversation => "Conversation",
            Route::ConversationHistory => "Historique",
            Route::AssistantSelector => "Agents",
            Route::ExecutionProgress => "Exécution",
            Route::StructuredResults => "Résultats",
            Route::Tasks => "Tickets",
            Route::Workflows => "Workflows",
            Route::Settings => "Paramètres",
            Route::CodeGit => "Code & Git",
            Route::BmadMode => "Mode BMAD",
            Route::FileExplorer => "Fichiers",
        }
    }

    /// Badge text for the status bar.
    pub(crate) fn badge(&self) -> &'static str {
        match self {
            Route::ProjectHome => "ACCUEIL",
            Route::Dashboard => "DASHBOARD",
            Route::Workspace => "WORKSPACE",
            Route::SessionDetail => "SESSION",
            Route::Summary => "RÉSUMÉ",
            Route::Conversation => "CONVERSATION",
            Route::ConversationHistory => "HISTORIQUE",
            Route::AssistantSelector => "AGENTS",
            Route::ExecutionProgress => "EXÉCUTION",
            Route::StructuredResults => "RÉSULTATS",
            Route::Tasks => "TICKETS",
            Route::Workflows => "WORKFLOWS",
            Route::Settings => "PARAMÈTRES",
            Route::CodeGit => "CODE & GIT",
            Route::BmadMode => "BMAD",
            Route::FileExplorer => "FICHIERS",
        }
    }
}

// ── Router (navigation stack) ──────────────────────────────────────

pub(crate) struct Router {
    pub(crate) stack: Vec<Route>,
}

impl Router {
    pub(crate) fn new(initial: Route) -> Self {
        Self {
            stack: vec![initial],
        }
    }

    pub(crate) fn current(&self) -> &Route {
        self.stack.last().unwrap_or(&Route::ProjectHome)
    }

    pub(crate) fn push(&mut self, route: Route) {
        // Don't push duplicates on top
        if self.stack.last() != Some(&route) {
            self.stack.push(route);
        }
    }

    pub(crate) fn pop(&mut self) -> bool {
        if self.stack.len() > 1 {
            self.stack.pop();
            true
        } else {
            false
        }
    }

    pub(crate) fn navigate(&mut self, route: Route) {
        // Replace stack: keep root + push new
        self.stack.truncate(1);
        if self.stack.last() != Some(&route) {
            self.stack.push(route);
        }
    }

    pub(crate) fn breadcrumbs(&self) -> Vec<&'static str> {
        self.stack.iter().map(|r| r.label()).collect()
    }
}

// ── Feedback ───────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FeedbackLevel {
    Info,
    Success,
    Error,
}

// ── Live overview card kinds ───────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LiveOverviewCardKind {
    Waiting,
    Assistant,
    Thinking,
    Activity,
}

// ── Terminal layout breakpoints ────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TerminalLayout {
    Wide,
    Stacked,
    Compact,
}

// ── Command feedback ───────────────────────────────────────────────

#[derive(Clone, Debug)]
pub(crate) struct CommandFeedback {
    pub(crate) text: String,
    pub(crate) level: FeedbackLevel,
    pub(crate) expires_at: Instant,
}

// ── Pending user input ─────────────────────────────────────────────

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

// ── Command action ─────────────────────────────────────────────────

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
    // V2 navigation
    Navigate(Route),
}

// ── Spinner ────────────────────────────────────────────────────────

pub(crate) const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ── App state structs ──────────────────────────────────────────────

/// Core data state.
pub(crate) struct MonitorState {
    pub(crate) sessions: Vec<Session>,
    pub(crate) phases: Vec<PhaseRecord>,
    pub(crate) transcript: Vec<TranscriptItemRecord>,
    pub(crate) selected_session_id: Option<String>,
    pub(crate) last_seq: i64,
    pub(crate) project_filter: Option<String>,
    pub(crate) selected_phase: Option<usize>,
    pub(crate) session_usage: Option<SessionUsageSummary>,
    pub(crate) live_session_id: Option<String>,
    pub(crate) preset_phase_names: Vec<String>,
    pub(crate) bus_phase_status: HashMap<String, (String, Option<String>)>,
    pub(crate) log_scroll: usize,
    pub(crate) current_dir: String,
    pub(crate) current_project_root: Option<String>,
}

/// UI presentation state.
pub(crate) struct MonitorUiState {
    pub(crate) focus: Panel,
    pub(crate) focus_zone: FocusZone,
    pub(crate) tick_count: usize,
    pub(crate) running_tokens: u64,
    pub(crate) running_cost: Option<f64>,
    pub(crate) has_subscription_cost: bool,
    pub(crate) mode: TuiMode,
    pub(crate) route: Route,
    pub(crate) router: Router,
    pub(crate) sidebar_collapsed: bool,
    pub(crate) command_input: String,
    pub(crate) command_feedback: Option<CommandFeedback>,
    pub(crate) pending_user_input: Option<PendingUserInput>,
    pub(crate) palette_query: String,
    pub(crate) palette_selected: usize,
    // Per-screen state
    pub(crate) search_query: String,
    pub(crate) active_tab: usize,
    pub(crate) kanban_col: usize,
    pub(crate) kanban_row: usize,
}

/// Runtime channels state.
pub(crate) struct MonitorRuntimeState {
    pub(crate) event_rx: Option<broadcast::Receiver<PipelineEvent>>,
    pub(crate) gate_channel: Option<GateChannel>,
    pub(crate) pending_gate_display: Option<GateDisplay>,
    pub(crate) pending_gate_responder: Option<oneshot::Sender<GateResponse>>,
    pub(crate) user_input_channel: Option<UserInputChannel>,
    pub(crate) pending_user_input_responder: Option<oneshot::Sender<Vec<String>>>,
}

/// The main application struct.
pub(crate) struct MonitorApp {
    pub(crate) state: MonitorState,
    pub(crate) ui: MonitorUiState,
    pub(crate) runtime: MonitorRuntimeState,
    pub(crate) storage: Arc<SessionManager>,
}
