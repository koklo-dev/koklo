//! `koklo monitor` — live TUI dashboard for pipeline activity.
//!
//! Polls the SQLite database every 500 ms.  Two display modes:
//! - Default: ratatui TUI with sessions + phases + log panels
//! - `--follow`: plain text stream (for CI / scripting)

use crate::plain_render::PlainRenderEngine;
use crate::render_model::{
    build_transcript_render_model, RenderBlock, RenderBlockBody, RenderBlockKind, RenderTone,
    TranscriptLiveModel, TranscriptRenderModel,
};
use anyhow::Result;
use koklo_events::{
    CostDisplay, GateChannel, GateDisplay, GateResponse, PipelineEvent, TranscriptItem,
    UserInputChannel, UserInputQuestion,
};
use koklo_storage::{
    PhaseRecord, Session, SessionManager, SessionUsageSummary, TranscriptItemRecord,
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Row, Table},
    Frame, Terminal,
};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, oneshot};

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};

#[derive(PartialEq, Eq, Clone, Debug)]
enum Panel {
    Sessions,
    Phases,
    Log,
}

#[derive(PartialEq, Clone, Debug)]
enum TuiMode {
    Live,
    GateOverlay,
}

#[derive(PartialEq, Eq, Clone, Debug)]
enum Route {
    Dashboard,
    Workspace,
    SessionDetail,
    Summary,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FeedbackLevel {
    Info,
    Success,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LiveOverviewCardKind {
    Waiting,
    Assistant,
    Thinking,
    Activity,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TerminalLayout {
    Wide,
    Stacked,
    Compact,
}

#[derive(Clone, Debug)]
struct CommandFeedback {
    text: String,
    level: FeedbackLevel,
    expires_at: Instant,
}

#[derive(Clone, Debug)]
struct PendingUserInput {
    request_id: String,
    questions: Vec<UserInputQuestion>,
    answers: Vec<String>,
}

impl PendingUserInput {
    fn current_question(&self) -> Option<&UserInputQuestion> {
        self.questions.get(self.answers.len())
    }

    fn is_complete(&self) -> bool {
        self.answers.len() >= self.questions.len()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CommandAction {
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

const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// Live-updating TUI monitor application.
pub struct MonitorApp {
    sessions: Vec<Session>,
    phases: Vec<PhaseRecord>,
    transcript: Vec<TranscriptItemRecord>,
    selected_session_id: Option<String>,
    last_seq: i64,
    focus: Panel,
    storage: Arc<SessionManager>,
    /// When `Some`, only sessions from this project path are shown.
    project_filter: Option<String>,
    /// Incremented on every tick to drive spinner animation.
    tick_count: usize,
    /// Index of the phase selected in the Phases panel. `None` = follow live phase.
    selected_phase: Option<usize>,
    // New fields for integrated TUI mode:
    event_rx: Option<broadcast::Receiver<PipelineEvent>>,
    gate_channel: Option<GateChannel>,
    pending_gate_display: Option<GateDisplay>,
    pending_gate_responder: Option<oneshot::Sender<GateResponse>>,
    user_input_channel: Option<UserInputChannel>,
    pending_user_input_responder: Option<oneshot::Sender<Vec<String>>>,
    running_tokens: u64,
    running_cost: Option<f64>,
    has_subscription_cost: bool,
    mode: TuiMode,
    route: Route,
    session_usage: Option<SessionUsageSummary>,
    live_session_id: Option<String>,
    /// Preset phase names in order — used to pre-populate the phase panel as "pending".
    preset_phase_names: Vec<String>,
    command_input: String,
    command_feedback: Option<CommandFeedback>,
    pending_user_input: Option<PendingUserInput>,
    /// Bus event overrides for phase status — survives DB rebuilds.
    bus_phase_status: HashMap<String, (String, Option<String>)>,
    /// Number of log lines kept above the live tail. `0` means follow live output.
    log_scroll: usize,
    current_dir: String,
    current_project_root: Option<String>,
}

impl MonitorApp {
    pub async fn new(
        session_filter: Option<&str>,
        project_filter: Option<String>,
        storage: Arc<SessionManager>,
    ) -> Result<Self> {
        let sessions = Self::load_sessions(&storage, project_filter.as_deref()).await?;
        let selected_session_id = Self::resolve_selected_session_id(&sessions, session_filter);
        let (phases, transcript) =
            Self::load_session_data(&storage, selected_session_id.as_deref()).await?;

        let last_seq = transcript.last().map(|l| l.seq).unwrap_or(0);
        let current_project_root = detect_project_root();

        Ok(Self {
            sessions,
            phases,
            transcript,
            selected_session_id,
            last_seq,
            focus: Panel::Sessions,
            storage,
            project_filter,
            tick_count: 0,
            selected_phase: None,
            event_rx: None,
            gate_channel: None,
            pending_gate_display: None,
            pending_gate_responder: None,
            user_input_channel: None,
            pending_user_input_responder: None,
            running_tokens: 0,
            running_cost: None,
            has_subscription_cost: false,
            mode: TuiMode::Live,
            route: if session_filter.is_some() {
                Route::SessionDetail
            } else {
                Route::Dashboard
            },
            session_usage: None,
            live_session_id: None,
            preset_phase_names: vec![],
            command_input: String::new(),
            command_feedback: None,
            pending_user_input: None,
            bus_phase_status: HashMap::new(),
            log_scroll: 0,
            current_dir: current_dir_string(),
            current_project_root,
        })
    }

    pub async fn new_integrated(
        storage: Arc<SessionManager>,
        event_rx: Option<broadcast::Receiver<PipelineEvent>>,
        gate_channel: Option<GateChannel>,
        user_input_channel: Option<UserInputChannel>,
        session_filter: Option<&str>,
        project_filter: Option<String>,
        preset_phases: Vec<String>,
    ) -> Result<Self> {
        let sessions = Self::load_sessions(&storage, project_filter.as_deref()).await?;
        let selected_session_id = Self::resolve_selected_session_id(&sessions, session_filter);
        let (phases, transcript) =
            Self::load_session_data(&storage, selected_session_id.as_deref()).await?;
        let last_seq = transcript.last().map(|l| l.seq).unwrap_or(0);
        let current_project_root = detect_project_root();
        Ok(Self {
            sessions,
            phases,
            transcript,
            selected_session_id,
            last_seq,
            focus: Panel::Log,
            storage,
            project_filter,
            tick_count: 0,
            selected_phase: None,
            event_rx,
            gate_channel,
            pending_gate_display: None,
            pending_gate_responder: None,
            user_input_channel,
            pending_user_input_responder: None,
            running_tokens: 0,
            running_cost: None,
            has_subscription_cost: false,
            mode: TuiMode::Live,
            route: Route::SessionDetail,
            session_usage: None,
            live_session_id: None,
            preset_phase_names: preset_phases,
            command_input: String::new(),
            command_feedback: None,
            pending_user_input: None,
            bus_phase_status: HashMap::new(),
            log_scroll: 0,
            current_dir: current_dir_string(),
            current_project_root,
        })
    }

    pub(crate) async fn load_sessions(
        storage: &SessionManager,
        project_filter: Option<&str>,
    ) -> Result<Vec<Session>> {
        if let Some(path) = project_filter {
            storage.list_sessions_for_project(path).await
        } else {
            storage.list_sessions().await
        }
    }

    async fn load_session_data(
        storage: &SessionManager,
        session_id: Option<&str>,
    ) -> Result<(Vec<PhaseRecord>, Vec<TranscriptItemRecord>)> {
        if let Some(session_id) = session_id {
            let phases = storage.get_phases_for_session(session_id).await?;
            let transcript = storage.get_transcript_items_for_session(session_id).await?;
            Ok((phases, transcript))
        } else {
            Ok((vec![], vec![]))
        }
    }

    fn resolve_selected_session_id(
        sessions: &[Session],
        session_filter: Option<&str>,
    ) -> Option<String> {
        if let Some(filter) = session_filter {
            sessions
                .iter()
                .find(|session| session.id.starts_with(filter))
                .map(|session| session.id.clone())
        } else {
            sessions.first().map(|session| session.id.clone())
        }
    }

    fn selected_session(&self) -> Option<&Session> {
        self.selected_session_id.as_ref().and_then(|selected_id| {
            self.sessions
                .iter()
                .find(|session| &session.id == selected_id)
        })
    }

    fn selected_session_index(&self) -> Option<usize> {
        self.selected_session_id.as_ref().and_then(|selected_id| {
            self.sessions
                .iter()
                .position(|session| &session.id == selected_id)
        })
    }

    fn set_selected_session_by_index(&mut self, index: usize) {
        if let Some(session) = self.sessions.get(index) {
            self.selected_session_id = Some(session.id.clone());
            self.reset_for_session();
        }
    }

    fn ensure_selected_session(&mut self) {
        if self
            .selected_session_id
            .as_ref()
            .map(|selected_id| {
                self.sessions
                    .iter()
                    .any(|session| &session.id == selected_id)
            })
            .unwrap_or(false)
        {
            return;
        }

        self.selected_session_id = self.sessions.first().map(|session| session.id.clone());
        self.reset_for_session();
    }

    /// Poll the DB and event bus for new data. Returns `true` if anything changed.
    pub async fn tick(&mut self) -> Result<bool> {
        self.tick_count = self.tick_count.wrapping_add(1);
        let mut changed = false;
        if self
            .command_feedback
            .as_ref()
            .map(|feedback| feedback.expires_at <= Instant::now())
            .unwrap_or(false)
        {
            self.command_feedback = None;
            changed = true;
        }

        // Drain event bus if in integrated mode (non-blocking)
        // Collect events first to avoid double-mutable-borrow issue.
        let events: Vec<PipelineEvent> = if let Some(ref mut rx) = self.event_rx {
            let mut collected = Vec::new();
            loop {
                match rx.try_recv() {
                    Ok(event) => collected.push(event),
                    Err(broadcast::error::TryRecvError::Empty) => break,
                    Err(broadcast::error::TryRecvError::Lagged(n)) => {
                        tracing::warn!("Event bus lagged, missed {} events", n);
                        continue; // cursor auto-reset, next try_recv gets oldest available
                    }
                    Err(broadcast::error::TryRecvError::Closed) => break,
                }
            }
            collected
        } else {
            Vec::new()
        };
        for event in events {
            self.handle_pipeline_event(event).await?;
            changed = true;
        }

        // Check for pending gate
        if self.mode == TuiMode::Live {
            if let Some(ref ch) = self.gate_channel {
                if ch.has_pending() {
                    if let Some(req) = ch.take_pending() {
                        let koklo_events::GateRequest { display, responder } = req;
                        self.pending_gate_display = Some(display);
                        self.pending_gate_responder = Some(responder);
                        self.mode = TuiMode::GateOverlay;
                        changed = true;
                    }
                }
            }
            if let Some(ref ch) = self.user_input_channel {
                if ch.has_pending() {
                    if let Some(req) = ch.take_pending() {
                        let koklo_events::UserInputRequest { display, responder } = req;
                        self.pending_user_input = Some(PendingUserInput {
                            request_id: display.request_id,
                            questions: display.questions,
                            answers: Vec::new(),
                        });
                        self.pending_user_input_responder = Some(responder);
                        self.set_feedback(
                            "Agent input requested. Answer directly or use /reply <text>.",
                            FeedbackLevel::Info,
                        );
                        changed = true;
                    }
                }
            }
        }

        // Poll DB every tick
        let new_sessions =
            Self::load_sessions(&self.storage, self.project_filter.as_deref()).await?;
        if new_sessions.len() != self.sessions.len() {
            changed = true;
        }
        self.sessions = new_sessions;
        self.ensure_selected_session();

        // In integrated mode, auto-select the live pipeline session so the DB
        // poll and phase display match the bus events.
        if let Some(live_id) = &self.live_session_id {
            if let Some(pos) = self.sessions.iter().position(|s| &s.id == live_id) {
                if self.selected_session_index() != Some(pos) {
                    self.selected_session_id = Some(live_id.clone());
                    // Reset seq so the DB poll doesn't skip items for the new session.
                    // Bus-sourced transcript items are already in self.transcript;
                    // the DB poll will add any DB-only items (e.g. from storage listener).
                    // Duplicates are benign (rendered identically, just extra entries).
                    self.last_seq = self.transcript.last().map(|l| l.seq).unwrap_or(0);
                    changed = true;
                }
            }
        }

        let Some(session) = self.selected_session() else {
            return Ok(changed);
        };

        let sid = session.id.clone();
        let new_phases = self.storage.get_phases_for_session(&sid).await?;
        if new_phases.len() != self.phases.len() {
            changed = true;
        }
        if self.preset_phase_names.is_empty() {
            self.phases = new_phases;
        } else {
            let db_map: HashMap<String, PhaseRecord> = new_phases
                .into_iter()
                .map(|p| (p.phase.clone(), p))
                .collect();
            self.phases = self
                .preset_phase_names
                .iter()
                .map(|name| {
                    db_map.get(name).cloned().unwrap_or_else(|| PhaseRecord {
                        id: format!("pending-{}", name),
                        session_id: self.live_session_id.clone().unwrap_or_default(),
                        phase: name.clone(),
                        status: "pending".to_string(),
                        started_at: None,
                        completed_at: None,
                        error: None,
                    })
                })
                .collect();
        }
        // Re-apply bus event overrides so that a PhaseStarted received before the
        // DB record exists is not regressed back to "pending" by the DB rebuild.
        for phase in &mut self.phases {
            if let Some((bus_status, bus_started_at)) = self.bus_phase_status.get(&phase.phase) {
                if phase_status_rank(bus_status) > phase_status_rank(&phase.status) {
                    phase.status = bus_status.clone();
                    if bus_status == "running" && phase.started_at.is_none() {
                        phase.started_at = bus_started_at.clone();
                    }
                }
            }
        }

        let new_logs = self
            .storage
            .get_transcript_items_since(&sid, self.last_seq)
            .await?;
        if !new_logs.is_empty() {
            self.last_seq = new_logs.last().map(|l| l.seq).unwrap_or(self.last_seq);
            for item in new_logs {
                self.push_transcript_record(item);
            }
            changed = true;
        }

        Ok(changed)
    }

    async fn handle_pipeline_event(&mut self, event: PipelineEvent) -> Result<()> {
        match event {
            PipelineEvent::Transcript { item } => {
                let session_id = item.session_id.clone();
                if self.live_session_id.is_none() {
                    self.live_session_id = Some(session_id.clone());
                }
                self.last_seq += 1;
                self.push_transcript_record(transcript_record_from_event(item, self.last_seq));
            }
            PipelineEvent::UsageUpdate {
                prompt_tokens,
                completion_tokens,
                cost,
                ..
            } => {
                self.running_tokens += (prompt_tokens + completion_tokens) as u64;
                match &cost {
                    Some(CostDisplay::Usd(v)) => {
                        *self.running_cost.get_or_insert(0.0) += v;
                    }
                    Some(CostDisplay::Subscription) => {
                        self.has_subscription_cost = true;
                    }
                    _ => {}
                }
            }
            PipelineEvent::SessionCompleted { session_id } => {
                if let Ok(usage) = self.storage.get_session_usage_summary(&session_id).await {
                    self.session_usage = Some(usage);
                }
                self.route = Route::Summary;
            }
            PipelineEvent::PhaseStarted { phase, session_id } => {
                if self.live_session_id.is_none() {
                    self.live_session_id = Some(session_id.clone());
                }
                let now = chrono::Utc::now().to_rfc3339();
                self.bus_phase_status.insert(
                    phase.to_string(),
                    ("running".to_string(), Some(now.clone())),
                );
                if let Some(p) = self
                    .phases
                    .iter_mut()
                    .find(|p| p.phase == phase.to_string())
                {
                    p.status = "running".to_string();
                    p.started_at = Some(now);
                    p.session_id = session_id;
                }
            }
            PipelineEvent::PhaseCompleted {
                phase,
                session_id: _,
            } => {
                self.bus_phase_status
                    .insert(phase.to_string(), ("completed".to_string(), None));
                if let Some(p) = self
                    .phases
                    .iter_mut()
                    .find(|p| p.phase == phase.to_string())
                {
                    p.status = "completed".to_string();
                    p.completed_at = Some(chrono::Utc::now().to_rfc3339());
                }
            }
            PipelineEvent::PhaseFailed { phase, .. } => {
                self.bus_phase_status
                    .insert(phase.to_string(), ("failed".to_string(), None));
                if let Some(p) = self
                    .phases
                    .iter_mut()
                    .find(|p| p.phase == phase.to_string())
                {
                    p.status = "failed".to_string();
                    p.completed_at = Some(chrono::Utc::now().to_rfc3339());
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn respond_gate(&mut self, response: GateResponse) {
        if let Some(responder) = self.pending_gate_responder.take() {
            let _ = responder.send(response);
        }
        self.pending_gate_display = None;
        self.mode = TuiMode::Live;
    }

    fn push_transcript_record(&mut self, item: TranscriptItemRecord) {
        self.track_interaction_from_transcript(&item);
        self.transcript.push(item);
    }

    fn track_interaction_from_transcript(&mut self, item: &TranscriptItemRecord) {
        if item.kind == "user_input_request" && item.status == "pending" {
            if self.pending_user_input_responder.is_none() {
                if let Some(pending) = PendingUserInput::from_record(item) {
                    self.pending_user_input = Some(pending);
                    self.set_feedback(
                        "Agent input requested. Answer directly or use /reply <text>.",
                        FeedbackLevel::Info,
                    );
                }
            }
            return;
        }

        if item.kind == "user_input_response" {
            let matches_pending = self
                .pending_user_input
                .as_ref()
                .map(|pending| {
                    item.item_key
                        .as_deref()
                        .map(|key| key == pending.request_id)
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            if matches_pending {
                self.pending_user_input = None;
                self.pending_user_input_responder = None;
            }
        }
    }

    fn set_feedback(&mut self, text: impl Into<String>, level: FeedbackLevel) {
        self.command_feedback = Some(CommandFeedback {
            text: text.into(),
            level,
            expires_at: Instant::now() + Duration::from_secs(8),
        });
    }

    pub fn render(&self, frame: &mut Frame) {
        let area = frame.size();
        let outer = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(1),
                Constraint::Length(3),
                Constraint::Length(1),
            ])
            .split(area);

        let main_area = outer[0];
        let command_area = outer[1];
        let status_area = outer[2];

        match self.route {
            Route::Dashboard => self.render_dashboard(frame, main_area),
            Route::Workspace => self.render_workspace(frame, main_area),
            Route::SessionDetail => self.render_session_detail(frame, main_area),
            Route::Summary => self.render_summary(frame, main_area),
        }

        self.render_command_bar(frame, command_area);
        self.render_statusbar(frame, status_area);

        if self.mode == TuiMode::GateOverlay {
            self.render_gate_overlay(frame);
        } else if self.pending_user_input.is_some() {
            self.render_user_input_overlay(frame);
        }
    }

    fn render_dashboard(&self, frame: &mut Frame, area: Rect) {
        let layout_mode = terminal_layout(area);
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(match layout_mode {
                    TerminalLayout::Wide => 9,
                    TerminalLayout::Stacked => 9,
                    TerminalLayout::Compact => 13,
                }),
                Constraint::Min(12),
            ])
            .split(area);

        self.render_dashboard_overview(frame, sections[0], layout_mode);

        let lower = match layout_mode {
            TerminalLayout::Wide => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(34), Constraint::Percentage(66)])
                .split(sections[1]),
            TerminalLayout::Stacked => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Length(32), Constraint::Min(40)])
                .split(sections[1]),
            TerminalLayout::Compact => Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(10), Constraint::Min(10)])
                .split(sections[1]),
        };

        self.render_sessions(frame, lower[0], "Sessions");
        self.render_dashboard_selected_session(frame, lower[1]);
    }

    fn render_workspace(&self, frame: &mut Frame, area: Rect) {
        let layout_mode = terminal_layout(area);
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(match layout_mode {
                    TerminalLayout::Wide => 9,
                    TerminalLayout::Stacked => 10,
                    TerminalLayout::Compact => 13,
                }),
                Constraint::Min(12),
            ])
            .split(area);

        self.render_workspace_overview(frame, sections[0], layout_mode);

        let lower = match layout_mode {
            TerminalLayout::Wide => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
                .split(sections[1]),
            TerminalLayout::Stacked => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(45), Constraint::Percentage(55)])
                .split(sections[1]),
            TerminalLayout::Compact => Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(10), Constraint::Min(10)])
                .split(sections[1]),
        };

        self.render_workspace_scope(frame, lower[0]);
        self.render_workspace_selected_session(frame, lower[1]);
    }

    fn render_session_detail(&self, frame: &mut Frame, area: Rect) {
        let layout_mode = terminal_layout(area);
        let content = match layout_mode {
            TerminalLayout::Wide => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(24), Constraint::Percentage(76)])
                .split(area),
            TerminalLayout::Stacked => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Length(28), Constraint::Min(40)])
                .split(area),
            TerminalLayout::Compact => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Length(22), Constraint::Min(24)])
                .split(area),
        };

        let sidebar = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(match layout_mode {
                    TerminalLayout::Wide => 6,
                    TerminalLayout::Stacked => 7,
                    TerminalLayout::Compact => 8,
                }),
                Constraint::Min(8),
            ])
            .split(content[0]);

        self.render_session_header(frame, sidebar[0]);
        self.render_phases(frame, sidebar[1]);
        self.render_logs(frame, content[1]);
    }

    fn render_sessions(&self, frame: &mut Frame, area: Rect, title: &str) {
        let border_style = sidebar_border_style(self.focus == Panel::Sessions);
        let selected_index = self.selected_session_index();

        let items: Vec<ListItem> = self
            .sessions
            .iter()
            .enumerate()
            .map(|(i, s)| {
                let icon = status_icon(&s.status);
                let short_id = short_id(&s.id);
                let short_title = truncate(&s.feature_title, 14);
                let style = if selected_index == Some(i) {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::DIM)
                };
                ListItem::new(format!(
                    " {} {}  {}  {}",
                    icon, short_id, short_title, s.status
                ))
                .style(style)
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(
                    title,
                    sidebar_title_style(self.focus == Panel::Sessions),
                ))
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }

    fn render_dashboard_overview(
        &self,
        frame: &mut Frame,
        area: Rect,
        layout_mode: TerminalLayout,
    ) {
        let cards = match layout_mode {
            TerminalLayout::Compact => Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(4),
                    Constraint::Length(4),
                    Constraint::Length(4),
                ])
                .split(area),
            TerminalLayout::Wide | TerminalLayout::Stacked => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(34),
                    Constraint::Percentage(33),
                    Constraint::Percentage(33),
                ])
                .split(area),
        };

        let (running, paused, completed) = self.session_counts();
        render_info_card(
            frame,
            cards[0],
            "Koklo",
            &[
                format!("Version {}", env!("CARGO_PKG_VERSION")),
                format!("{} sessions tracked", self.sessions.len()),
                format!("{running} running  {paused} paused  {completed} done"),
            ],
        );
        render_info_card(
            frame,
            cards[1],
            "Project",
            &[
                format!(
                    "Root {}",
                    truncate_path(
                        self.current_project_root
                            .as_deref()
                            .unwrap_or("not detected"),
                        34
                    )
                ),
                format!(
                    "Filter {}",
                    truncate_path(self.project_filter.as_deref().unwrap_or("all sessions"), 33)
                ),
                format!("Current dir {}", truncate_path(&self.current_dir, 30)),
            ],
        );
        render_info_card(
            frame,
            cards[2],
            "Navigation",
            &[
                "Enter opens the selected session".to_string(),
                "W opens the workspace screen".to_string(),
                "S opens the session summary".to_string(),
            ],
        );
    }

    fn render_dashboard_selected_session(&self, frame: &mut Frame, area: Rect) {
        let lines = if let Some(session) = self.selected_session() {
            vec![
                format!("Feature: {}", session.feature_title),
                format!("Session: {}", short_id(&session.id)),
                format!("Status: {}  Preset: {}", session.status, session.preset),
                format!(
                    "Workspace: {}",
                    truncate_path(
                        &session.workspace_path,
                        area.width.saturating_sub(4) as usize
                    )
                ),
                format!(
                    "Project: {}",
                    truncate_path(&session.project_path, area.width.saturating_sub(4) as usize)
                ),
                format!("Branch: {}", session_branch_label(session)),
                format!("Updated: {}", session.updated_at),
            ]
        } else {
            vec![
                "No session selected.".to_string(),
                String::new(),
                "Run `koklo run ...` to create a session.".to_string(),
            ]
        };

        let para = Paragraph::new(lines.join("\n"))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Selected Session"),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_workspace_overview(
        &self,
        frame: &mut Frame,
        area: Rect,
        layout_mode: TerminalLayout,
    ) {
        let cards = match layout_mode {
            TerminalLayout::Compact => Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(4),
                    Constraint::Length(4),
                    Constraint::Length(4),
                ])
                .split(area),
            TerminalLayout::Wide | TerminalLayout::Stacked => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(34),
                    Constraint::Percentage(33),
                    Constraint::Percentage(33),
                ])
                .split(area),
        };

        let project_sessions = self.sessions_for_current_project();
        let workspace_sessions = self.sessions_for_selected_workspace();
        let selected_label = self
            .selected_session()
            .map(|session| short_id(&session.id))
            .unwrap_or_else(|| "—".to_string());

        render_info_card(
            frame,
            cards[0],
            "Workspace",
            &[
                format!("Current dir {}", truncate_path(&self.current_dir, 30)),
                format!(
                    "Project root {}",
                    truncate_path(
                        self.current_project_root
                            .as_deref()
                            .unwrap_or("not detected"),
                        28
                    )
                ),
                format!("Selected session {selected_label}"),
            ],
        );
        render_info_card(
            frame,
            cards[1],
            "Scope",
            &[
                format!("{project_sessions} sessions match current project"),
                format!("{workspace_sessions} sessions share selected workspace"),
                format!(
                    "Filter {}",
                    truncate_path(self.project_filter.as_deref().unwrap_or("all sessions"), 30)
                ),
            ],
        );
        render_info_card(
            frame,
            cards[2],
            "Navigation",
            &[
                "Up/Down changes the selected session".to_string(),
                "Enter opens the session detail".to_string(),
                "Esc returns to the dashboard".to_string(),
            ],
        );
    }

    fn render_workspace_scope(&self, frame: &mut Frame, area: Rect) {
        let project_root = self
            .current_project_root
            .as_deref()
            .unwrap_or("not detected");
        let lines = [
            format!("Current dir: {}", self.current_dir),
            format!("Project root: {}", project_root),
            format!(
                "Monitor filter: {}",
                self.project_filter.as_deref().unwrap_or("all sessions")
            ),
            String::new(),
            format!(
                "Sessions in current project: {}",
                self.sessions_for_current_project()
            ),
            format!(
                "Sessions in selected workspace: {}",
                self.sessions_for_selected_workspace()
            ),
        ];

        let para = Paragraph::new(lines.join("\n"))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Current Scope"),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_workspace_selected_session(&self, frame: &mut Frame, area: Rect) {
        let lines = if let Some(session) = self.selected_session() {
            vec![
                format!("Feature: {}", session.feature_title),
                format!("Session: {}  ·  {}", short_id(&session.id), session.status),
                format!("Preset: {}", session.preset),
                format!("Project path: {}", session.project_path),
                format!("Workspace path: {}", session.workspace_path),
                format!("Workspace branch: {}", session_branch_label(session)),
                format!("Updated: {}", session.updated_at),
            ]
        } else {
            vec![
                "No session selected.".to_string(),
                String::new(),
                "Use Up/Down to pick a session from the dashboard first.".to_string(),
            ]
        };

        let para = Paragraph::new(lines.join("\n"))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Selected Session Workspace"),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_session_header(&self, frame: &mut Frame, area: Rect) {
        let lines = if let Some(session) = self.selected_session() {
            vec![
                format!(
                    "{}  ·  {}  ·  preset {}",
                    short_id(&session.id),
                    session.status,
                    session.preset
                ),
                session.feature_title.clone(),
                format!(
                    "workspace: {}",
                    truncate_path(
                        &session.workspace_path,
                        area.width.saturating_sub(4) as usize
                    )
                ),
                format!("branch: {}", session_branch_label(session)),
            ]
        } else {
            vec![
                "No session selected.".to_string(),
                "Press Esc to return to the dashboard.".to_string(),
            ]
        };

        let para = Paragraph::new(lines.join("\n"))
            .block(Block::default().borders(Borders::ALL).title("Session"))
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn session_counts(&self) -> (usize, usize, usize) {
        let running = self
            .sessions
            .iter()
            .filter(|session| session.status == "running")
            .count();
        let paused = self
            .sessions
            .iter()
            .filter(|session| session.status == "paused")
            .count();
        let completed = self
            .sessions
            .iter()
            .filter(|session| session.status == "completed")
            .count();
        (running, paused, completed)
    }

    fn sessions_for_current_project(&self) -> usize {
        let Some(project_root) = self.current_project_root.as_deref() else {
            return 0;
        };
        self.sessions
            .iter()
            .filter(|session| session.project_path == project_root)
            .count()
    }

    fn sessions_for_selected_workspace(&self) -> usize {
        let Some(selected) = self.selected_session() else {
            return 0;
        };
        self.sessions
            .iter()
            .filter(|session| session.workspace_path == selected.workspace_path)
            .count()
    }

    fn render_phases(&self, frame: &mut Frame, area: Rect) {
        let border_style = sidebar_border_style(self.focus == Panel::Phases);

        let session_label = self
            .selected_session()
            .map(|s| short_id(&s.id))
            .unwrap_or_else(|| "—".to_string());

        let spinner_frame = SPINNER[self.tick_count % SPINNER.len()];
        let items: Vec<ListItem> = self
            .phases
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let icon = if p.status == "running" {
                    spinner_frame
                } else {
                    status_icon(&p.status)
                };
                let dur = phase_dur_str(&p.started_at, &p.completed_at);
                let selected = self.selected_phase == Some(i);
                let style = if selected {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::DIM)
                };
                ListItem::new(format!(" {} {}{}", icon, p.phase, dur)).style(style)
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(
                    format!("Phases · {session_label}"),
                    sidebar_title_style(self.focus == Panel::Phases),
                ))
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }

    fn render_logs(&self, frame: &mut Frame, area: Rect) {
        let border_style = log_border_style(self.focus == Panel::Log);

        let session_label = self
            .selected_session()
            .map(|s| short_id(&s.id))
            .unwrap_or_else(|| "—".to_string());

        let (display_phase, is_live) = self.display_phase_info();
        let filtered_logs = self.filtered_logs_for_selected_phase();

        let agent_name = filtered_logs
            .last()
            .and_then(|l| l.agent_name.as_deref())
            .unwrap_or("—");

        let spinner_frame = SPINNER[self.tick_count % SPINNER.len()];
        let phase_label = if is_live {
            format!("{} {}", spinner_frame, display_phase)
        } else {
            display_phase.to_string()
        };

        let title = format!(
            "{}  ·  session {}  ·  {}",
            agent_name, session_label, phase_label
        );

        let render_model = build_transcript_render_model(filtered_logs.iter().copied());
        let live_model = render_model.live_model();
        let overview_cards = select_live_overview_cards(&live_model);
        let overview_height = live_overview_height(&overview_cards);

        if overview_height == 0 {
            self.render_transcript_timeline(
                frame,
                area,
                &render_model,
                &title,
                border_style,
                self.log_scroll,
            );
        } else {
            let sections = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(overview_height), Constraint::Min(8)])
                .split(area);

            self.render_live_overview(frame, sections[0], &live_model, &overview_cards);
            self.render_transcript_timeline(
                frame,
                sections[1],
                &render_model,
                &title,
                border_style,
                self.log_scroll,
            );
        }
    }

    fn render_live_overview(
        &self,
        frame: &mut Frame,
        area: Rect,
        live_model: &TranscriptLiveModel,
        cards: &[LiveOverviewCardKind],
    ) {
        let constraints = vec![Constraint::Ratio(1, cards.len() as u32); cards.len()];
        let columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints(constraints)
            .split(area);

        let pending_count = live_model.pending.len();
        for (card, card_area) in cards.iter().copied().zip(columns.iter()) {
            let (title, block, title_style) = match card {
                LiveOverviewCardKind::Waiting => (
                    "WAITING",
                    live_model.pending.last(),
                    Style::default().fg(Color::Magenta),
                ),
                LiveOverviewCardKind::Assistant => (
                    "ASSISTANT",
                    live_model.latest_assistant.as_ref(),
                    Style::default().fg(Color::White),
                ),
                LiveOverviewCardKind::Thinking => (
                    "THINKING",
                    live_model.latest_thinking.as_ref(),
                    Style::default().fg(Color::Cyan),
                ),
                LiveOverviewCardKind::Activity => (
                    "ACTIVITY",
                    live_model.latest_activity.as_ref(),
                    Style::default().fg(Color::Yellow),
                ),
            };

            if card == LiveOverviewCardKind::Activity {
                self.render_live_activity_card(
                    frame,
                    *card_area,
                    live_card_title(title, pending_count, block),
                    &live_model.recent_activity,
                    title_style,
                );
            } else {
                self.render_live_card(
                    frame,
                    *card_area,
                    live_card_title(title, pending_count, block),
                    block,
                    title_style,
                );
            }
        }
    }

    fn render_live_card(
        &self,
        frame: &mut Frame,
        area: Rect,
        title: String,
        block: Option<&RenderBlock>,
        title_style: Style,
    ) {
        let max_lines = area.height.saturating_sub(2) as usize;
        let lines = block
            .map(|block| card_lines(block, max_lines))
            .filter(|lines| !lines.is_empty())
            .unwrap_or_else(|| {
                vec![Line::from(Span::styled(
                    "No activity yet",
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::DIM),
                ))]
            });

        let border_style = block
            .map(|block| tone_style(block.tone))
            .unwrap_or_default();
        let para = Paragraph::new(Text::from(inset_lines(lines, 1)))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(border_style)
                    .title(Span::styled(
                        title,
                        title_style.add_modifier(Modifier::BOLD),
                    )),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_live_activity_card(
        &self,
        frame: &mut Frame,
        area: Rect,
        title: String,
        blocks: &[RenderBlock],
        title_style: Style,
    ) {
        let max_lines = area.height.saturating_sub(2) as usize;
        let lines = if blocks.is_empty() {
            vec![Line::from(Span::styled(
                "No activity yet",
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::DIM),
            ))]
        } else {
            activity_card_lines(blocks, max_lines)
        };

        let border_style = blocks
            .last()
            .map(|block| tone_style(block.tone))
            .unwrap_or_default();
        let para = Paragraph::new(Text::from(inset_lines(lines, 1)))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(border_style)
                    .title(Span::styled(
                        title,
                        title_style.add_modifier(Modifier::BOLD),
                    )),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_transcript_timeline(
        &self,
        frame: &mut Frame,
        area: Rect,
        render_model: &TranscriptRenderModel,
        title: &str,
        border_style: Style,
        scroll_lines: usize,
    ) {
        let visible_height = area.height.saturating_sub(2) as usize;
        let mut all_styled: Vec<Line> = Vec::new();
        let mut previous_kind = None;
        for block in &render_model.blocks {
            if previous_kind != Some(block.kind) {
                all_styled.push(timeline_section_header(block.kind));
                previous_kind = Some(block.kind);
            }
            all_styled.extend(block_lines(block));
        }

        let (start, end, clamped_scroll) =
            timeline_window(all_styled.len(), visible_height, scroll_lines);
        let display_lines: Vec<Line> = inset_lines(all_styled[start..end].to_vec(), 1);
        let log_title = if clamped_scroll == 0 {
            format!("{title}  ·  LOG · live")
        } else {
            format!("{title}  ·  LOG · -{clamped_scroll} lines")
        };

        let para = Paragraph::new(Text::from(display_lines))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(log_title)
                    .border_style(border_style),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_statusbar(&self, frame: &mut Frame, area: Rect) {
        let gate_allows_edit = self
            .pending_gate_display
            .as_ref()
            .map(|display| display.allow_edit)
            .unwrap_or(false);
        let cost_part = if self.has_subscription_cost {
            format!("Tokens: {} | via subscription", self.running_tokens)
        } else if let Some(cost) = self.running_cost {
            format!("Tokens: {} | Cost: ${:.4}", self.running_tokens, cost)
        } else if self.running_tokens > 0 {
            format!("Tokens: {}", self.running_tokens)
        } else {
            String::new()
        };

        let nav_text = match self.mode {
            TuiMode::GateOverlay if gate_allows_edit => {
                "[Enter] submit  [Y/N] quick approve-reject  [/edit <path>]"
            }
            TuiMode::GateOverlay => "[Enter] submit  [Y/N] quick approve-reject",
            TuiMode::Live if self.pending_user_input.is_some() => "[Enter] answer  [/reply <text>]",
            TuiMode::Live => match self.route {
                Route::Dashboard => {
                    "[q] quit  [↑↓] select session  [Enter] open  [w] workspace  [r] refresh"
                }
                Route::Workspace => "[q] quit  [↑↓] select session  [Enter] open  [Esc] dashboard",
                Route::SessionDetail => match self.focus {
                    Panel::Phases => "[q] quit  [↑↓] select phase  [Tab] log  [Esc] dashboard",
                    Panel::Log => "[q] quit  [↑↓/Pg] scroll log  [Tab] phases  [Esc] dashboard",
                    Panel::Sessions => "[q] quit  [Esc] dashboard",
                },
                Route::Summary => "[q] quit  [Esc] session  [/] commands",
            },
        };

        let live_badge = self.status_badge();
        let status_text = format_status_line(
            area.width.saturating_sub(1) as usize,
            &live_badge,
            self.command_feedback
                .as_ref()
                .map(|feedback| feedback.text.as_str()),
            nav_text,
            if cost_part.is_empty() {
                None
            } else {
                Some(cost_part.as_str())
            },
        );

        let style = match self
            .command_feedback
            .as_ref()
            .map(|feedback| feedback.level)
        {
            Some(FeedbackLevel::Error) => Style::default().fg(Color::Red),
            Some(FeedbackLevel::Success) => Style::default().fg(Color::Green),
            Some(FeedbackLevel::Info) => Style::default().fg(Color::Cyan),
            None => Style::default().fg(Color::DarkGray),
        };
        let para = Paragraph::new(status_text).style(style);
        frame.render_widget(para, area);
    }

    fn status_badge(&self) -> String {
        if self.mode == TuiMode::GateOverlay {
            return "WAITING APPROVAL".to_string();
        }
        if let Some(pending) = &self.pending_user_input {
            return format!(
                "WAITING INPUT {}/{}",
                pending.answers.len() + 1,
                pending.questions.len()
            );
        }
        let pending_count = build_transcript_render_model(self.transcript.iter())
            .live_model()
            .pending
            .len();
        let route = match self.route {
            Route::Dashboard => "DASHBOARD",
            Route::Workspace => "WORKSPACE",
            Route::SessionDetail => "SESSION",
            Route::Summary => "SUMMARY",
        };
        if self.route == Route::SessionDetail && pending_count > 0 {
            format!("{route} · waiting {}", pending_count)
        } else if self.route == Route::SessionDetail && self.log_scroll > 0 {
            format!("{route} · history -{}", self.log_scroll)
        } else {
            route.to_string()
        }
    }

    fn render_command_bar(&self, frame: &mut Frame, area: Rect) {
        let gate_allows_edit = self
            .pending_gate_display
            .as_ref()
            .map(|display| display.allow_edit)
            .unwrap_or(false);
        let title = if self.mode == TuiMode::GateOverlay {
            if gate_allows_edit {
                "COMMAND — gate pending"
            } else {
                "COMMAND — approval pending"
            }
        } else if let Some(pending) = &self.pending_user_input {
            pending
                .current_question()
                .map(|question| question.header.as_str())
                .unwrap_or("REPLY")
        } else {
            "COMMAND"
        };
        let visible_width = area.width.saturating_sub(4) as usize;
        let title = truncate_text(title, visible_width.max(1));
        let border_style = if self.command_input.is_empty() {
            Style::default()
        } else {
            Style::default().fg(Color::Yellow)
        };
        let prompt = if self.command_input.is_empty() {
            if self.mode == TuiMode::GateOverlay {
                if gate_allows_edit {
                    "/approve, /reject or /edit <path>"
                } else {
                    "/approve or /reject"
                }
            } else if self.pending_user_input.is_some() {
                "Type your answer or /reply <text>"
            } else {
                match self.route {
                    Route::Dashboard => "Type /help, /workspace or press Enter on a session",
                    Route::Workspace => "Type /help, /dashboard or press Enter on a session",
                    Route::SessionDetail => "Type /help, /summary or Esc for dashboard",
                    Route::Summary => "Type /help, /live or Esc for session",
                }
            }
        } else {
            &self.command_input
        };
        let display = truncate_left(prompt, visible_width);
        let paragraph = Paragraph::new(display).block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(paragraph, area);

        let cursor_col = truncate_left_offset(prompt, visible_width) as u16;
        frame.set_cursor(area.x + 1 + cursor_col, area.y + 1);
    }

    fn render_gate_overlay(&self, frame: &mut Frame) {
        let area = frame.size();
        let overlay_area = centered_overlay_rect(area, 60, 10, 32);

        frame.render_widget(Clear, overlay_area);

        let display = self.pending_gate_display.as_ref();
        let content = if let Some(d) = display {
            let usage_str = if let Some(u) = &d.usage {
                format!(
                    "Tokens: {} prompt + {} completion",
                    u.prompt_tokens, u.completion_tokens
                )
            } else {
                "Tokens: —".to_string()
            };
            let cost_str = if let Some(c) = &d.cost {
                match c {
                    CostDisplay::Usd(v) => format!("Cost: ${:.4}", v),
                    CostDisplay::Subscription => "Cost: via subscription".to_string(),
                    CostDisplay::Free => "Cost: free".to_string(),
                }
            } else {
                "Cost: —".to_string()
            };
            if overlay_area.width < 60 || overlay_area.height < 10 {
                if d.allow_edit {
                    format!(
                        "GATE {}\n{}\n{}\n[Y] approve  [N] reject  [/edit <path>]",
                        d.phase, usage_str, cost_str
                    )
                } else {
                    format!(
                        "APPROVAL {}\n{}\n{}\n[Y] approve  [N] reject",
                        d.phase, usage_str, cost_str
                    )
                }
            } else if d.allow_edit {
                format!(
                    "GATE: Phase '{}' complete\n\n  {}\n  {}\n\n  [Y] Approve   [N] Reject   [/edit <path>] Pause for edits",
                    d.phase, usage_str, cost_str
                )
            } else {
                format!(
                    "APPROVAL: Phase '{}'\n\n  {}\n\n  {}\n  {}\n\n  [Y] Approve   [N] Reject",
                    d.phase, d.description, usage_str, cost_str
                )
            }
        } else {
            "Approval pending…".to_string()
        };

        let para = Paragraph::new(content)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(if display.map(|d| d.allow_edit).unwrap_or(false) {
                        "Gate Review"
                    } else {
                        "Approval Review"
                    })
                    .style(Style::default().fg(Color::Yellow)),
            )
            .style(Style::default());
        frame.render_widget(para, overlay_area);
    }

    fn render_user_input_overlay(&self, frame: &mut Frame) {
        let Some(pending) = &self.pending_user_input else {
            return;
        };
        let Some(question) = pending.current_question() else {
            return;
        };

        let area = frame.size();
        let overlay_area = centered_overlay_rect(area, 65, 11, 36);
        frame.render_widget(Clear, overlay_area);

        let mut lines = vec![
            format!(
                "Question {}/{}",
                pending.answers.len() + 1,
                pending.questions.len()
            ),
            String::new(),
            question.question.clone(),
        ];
        if question.is_secret {
            lines.push(String::new());
            lines.push("Answer will be recorded as provided.".to_string());
        }
        if let Some(options) = &question.options {
            if !options.is_empty() {
                lines.push(String::new());
                lines.push(format!("Options: {}", options.join(" | ")));
            }
        }
        if overlay_area.height >= 9 {
            lines.push(String::new());
            lines.push("Submit with Enter or use /reply <text>.".to_string());
        } else {
            lines.push(String::new());
            lines.push("Enter to submit.".to_string());
        }

        let para = Paragraph::new(lines.join("\n")).block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!("User Input — {}", question.header))
                .style(Style::default().fg(Color::Yellow)),
        );
        frame.render_widget(para, overlay_area);
    }

    fn render_summary(&self, frame: &mut Frame, area: Rect) {
        let header = Row::new(vec!["Phase", "Tokens", "Cost"])
            .style(Style::default().add_modifier(Modifier::BOLD))
            .bottom_margin(1);

        let mut rows: Vec<Row> = Vec::new();
        let mut total_tokens = 0u64;
        let mut total_cost: Option<f64> = None;

        if let Some(u) = &self.session_usage {
            for phase in &u.phases {
                let tokens = phase.prompt_tokens + phase.completion_tokens;
                total_tokens += tokens as u64;
                let cost_str = match phase.cost_usd {
                    Some(c) => {
                        *total_cost.get_or_insert(0.0) += c;
                        format!("${:.4}", c)
                    }
                    None => "—".to_string(),
                };
                rows.push(Row::new(vec![
                    phase.phase.clone(),
                    tokens.to_string(),
                    cost_str,
                ]));
            }
            rows.push(Row::new(vec![
                "".to_string(),
                "".to_string(),
                "".to_string(),
            ]));
            rows.push(
                Row::new(vec![
                    "TOTAL".to_string(),
                    total_tokens.to_string(),
                    total_cost
                        .map(|c| format!("${:.4}", c))
                        .unwrap_or_else(|| "—".to_string()),
                ])
                .style(Style::default().add_modifier(Modifier::BOLD)),
            );
        }

        rows.push(Row::new(vec![
            "".to_string(),
            "".to_string(),
            "[q] quit  [Esc] session".to_string(),
        ]));

        let widths = [
            Constraint::Length(18),
            Constraint::Length(12),
            Constraint::Min(20),
        ];
        let table = Table::new(rows, widths).header(header).block(
            Block::default().borders(Borders::ALL).title(format!(
                "SESSION SUMMARY — {}",
                self.selected_session()
                    .map(|session| short_id(&session.id))
                    .or_else(|| self.live_session_id.as_deref().map(short_id))
                    .unwrap_or_else(|| "—".to_string())
            )),
        );

        frame.render_widget(table, area);
    }

    fn select_prev(&mut self) {
        if let Some(index) = self.selected_session_index() {
            if index > 0 {
                self.set_selected_session_by_index(index - 1);
            }
        } else if !self.sessions.is_empty() {
            self.set_selected_session_by_index(0);
        }
    }

    fn select_next(&mut self) {
        if let Some(index) = self.selected_session_index() {
            if index + 1 < self.sessions.len() {
                self.set_selected_session_by_index(index + 1);
            }
        } else if !self.sessions.is_empty() {
            self.set_selected_session_by_index(0);
        }
    }

    pub fn toggle_focus(&mut self) {
        self.focus = match self.route {
            Route::Dashboard | Route::Workspace => Panel::Sessions,
            Route::SessionDetail | Route::Summary => match self.focus {
                Panel::Phases => Panel::Log,
                _ => Panel::Phases,
            },
        };
    }

    pub fn handle_up(&mut self) {
        match self.route {
            Route::Dashboard | Route::Workspace => self.select_prev(),
            Route::SessionDetail => match self.focus {
                Panel::Phases => self.phase_prev(),
                Panel::Log => self.scroll_log_by(1, 1),
                Panel::Sessions => self.select_prev(),
            },
            Route::Summary => {}
        }
    }

    pub fn handle_down(&mut self) {
        match self.route {
            Route::Dashboard | Route::Workspace => self.select_next(),
            Route::SessionDetail => match self.focus {
                Panel::Phases => self.phase_next(),
                Panel::Log => self.scroll_log_toward_live(1),
                Panel::Sessions => self.select_next(),
            },
            Route::Summary => {}
        }
    }

    pub fn handle_page_up(&mut self) {
        if self.focus == Panel::Log {
            self.scroll_log_by(10, 1);
        }
    }

    pub fn handle_page_down(&mut self) {
        if self.focus == Panel::Log {
            self.scroll_log_toward_live(10);
        }
    }

    pub fn handle_home(&mut self) {
        if self.focus == Panel::Log {
            self.log_scroll = self.max_log_scroll();
        }
    }

    pub fn handle_end(&mut self) {
        if self.focus == Panel::Log {
            self.log_scroll = 0;
        }
    }

    async fn open_selected_session(&mut self) -> Result<()> {
        self.route = Route::SessionDetail;
        self.focus = Panel::Log;
        let (phases, transcript) =
            Self::load_session_data(&self.storage, self.selected_session_id.as_deref()).await?;
        self.phases = phases;
        self.transcript = transcript;
        self.last_seq = self.transcript.last().map(|item| item.seq).unwrap_or(0);
        Ok(())
    }

    fn go_to_dashboard(&mut self) {
        self.route = Route::Dashboard;
        self.focus = Panel::Sessions;
        self.selected_phase = None;
        self.log_scroll = 0;
    }

    fn go_to_workspace(&mut self) {
        self.route = Route::Workspace;
        self.focus = Panel::Sessions;
        self.selected_phase = None;
        self.log_scroll = 0;
    }

    fn go_to_summary(&mut self) {
        self.route = Route::Summary;
    }

    fn phase_prev(&mut self) {
        match self.selected_phase {
            Some(0) | None => {}
            Some(i) => {
                self.selected_phase = Some(i - 1);
                self.log_scroll = 0;
            }
        }
    }

    fn phase_next(&mut self) {
        let max = self.phases.len().saturating_sub(1);
        self.selected_phase = Some(match self.selected_phase {
            None => 0,
            Some(i) if i < max => i + 1,
            Some(i) => i,
        });
        self.log_scroll = 0;
    }

    fn reset_for_session(&mut self) {
        self.transcript.clear();
        self.phases.clear();
        self.last_seq = 0;
        self.selected_phase = None;
        self.pending_user_input = None;
        self.session_usage = None;
        self.log_scroll = 0;
    }

    fn scroll_log_by(&mut self, delta: usize, minimum_step: usize) {
        let step = delta.max(minimum_step);
        let max_scroll = self.max_log_scroll();
        self.log_scroll = (self.log_scroll + step).min(max_scroll);
    }

    fn scroll_log_toward_live(&mut self, delta: usize) {
        self.log_scroll = self.log_scroll.saturating_sub(delta);
    }

    fn max_log_scroll(&self) -> usize {
        let filtered_logs = self.filtered_logs_for_selected_phase();
        let render_model = build_transcript_render_model(filtered_logs.iter().copied());
        let total_lines = transcript_line_count(&render_model);
        total_lines.saturating_sub(1)
    }

    fn filtered_logs_for_selected_phase(&self) -> Vec<&TranscriptItemRecord> {
        let (display_phase, _) = self.display_phase_info();
        self.transcript
            .iter()
            .filter(|l| {
                l.phase
                    .as_deref()
                    .map(|phase| phase == display_phase)
                    .unwrap_or(true)
            })
            .collect()
    }

    fn display_phase_info(&self) -> (&str, bool) {
        if let Some(i) = self.selected_phase {
            let name = self.phases.get(i).map(|p| p.phase.as_str()).unwrap_or("—");
            let running = self
                .phases
                .get(i)
                .map(|p| p.status == "running")
                .unwrap_or(false);
            (name, running)
        } else {
            let running = self.phases.iter().find(|p| p.status == "running");
            let last_done = self
                .phases
                .iter()
                .rev()
                .find(|p| p.status == "completed" || p.status == "failed");
            let phase = running.or(last_done).or_else(|| self.phases.last());
            let name = phase.map(|p| p.phase.as_str()).unwrap_or("—");
            (name, running.is_some())
        }
    }

    pub fn handle_input_key(&mut self, key: KeyEvent) -> bool {
        if key.kind != KeyEventKind::Press {
            return false;
        }

        match key.code {
            KeyCode::Enter => {
                !self.command_input.is_empty()
                    || self.pending_user_input.is_some()
                    || self.mode == TuiMode::GateOverlay
            }
            KeyCode::Backspace => {
                if self.command_input.is_empty() {
                    false
                } else {
                    self.command_input.pop();
                    true
                }
            }
            KeyCode::Char(c) => {
                if self.command_input.is_empty()
                    && self.pending_user_input.is_none()
                    && self.mode != TuiMode::GateOverlay
                    && c != '/'
                {
                    return false;
                }
                if self.command_input.is_empty()
                    && self.mode == TuiMode::GateOverlay
                    && self.pending_user_input.is_none()
                    && c != '/'
                {
                    return false;
                }
                self.command_input.push(c);
                true
            }
            _ => false,
        }
    }

    pub async fn submit_input(&mut self) -> Result<bool> {
        let submitted = self.command_input.trim().to_string();
        self.command_input.clear();

        if submitted.is_empty() {
            if self.pending_user_input.is_some() {
                self.set_feedback("Answer cannot be empty.", FeedbackLevel::Error);
                return Ok(false);
            }
            return Ok(false);
        }

        match parse_command_action(&submitted) {
            Ok(Some(action)) => return self.execute_command(action).await,
            Ok(None) => {}
            Err(err) => {
                self.set_feedback(err.to_string(), FeedbackLevel::Error);
                return Ok(false);
            }
        }

        if self.pending_user_input.is_some() {
            self.record_user_input_answer(submitted).await?;
            return Ok(false);
        }

        if self.mode == TuiMode::GateOverlay {
            self.set_feedback(
                "Gate pending. Use /approve, /reject or /edit <path>.",
                FeedbackLevel::Error,
            );
        } else {
            self.set_feedback(
                "No active question. Use /help to list available commands.",
                FeedbackLevel::Info,
            );
        }
        Ok(false)
    }

    async fn execute_command(&mut self, action: CommandAction) -> Result<bool> {
        match action {
            CommandAction::Help => {
                self.set_feedback(
                    "Commands: /help /approve /reject /edit <path> /reply <text> /dashboard /workspace /focus <sessions|phases|log> /live /refresh /summary /quit",
                    FeedbackLevel::Info,
                );
            }
            CommandAction::Dashboard => {
                self.go_to_dashboard();
                self.set_feedback("Returned to dashboard.", FeedbackLevel::Success);
            }
            CommandAction::Workspace => {
                self.go_to_workspace();
                self.set_feedback("Showing workspace view.", FeedbackLevel::Success);
            }
            CommandAction::Approve => {
                if self.mode == TuiMode::GateOverlay {
                    self.respond_gate(GateResponse::Approve);
                    self.set_feedback("Gate approved.", FeedbackLevel::Success);
                } else {
                    self.set_feedback("No gate is waiting for approval.", FeedbackLevel::Error);
                }
            }
            CommandAction::Reject => {
                if self.mode == TuiMode::GateOverlay {
                    self.respond_gate(GateResponse::Reject);
                    self.set_feedback("Gate rejected. Session will pause.", FeedbackLevel::Info);
                } else {
                    self.set_feedback("No gate is waiting for rejection.", FeedbackLevel::Error);
                }
            }
            CommandAction::Edit(path) => {
                if self.mode == TuiMode::GateOverlay {
                    if self
                        .pending_gate_display
                        .as_ref()
                        .map(|display| display.allow_edit)
                        .unwrap_or(false)
                    {
                        let display = path.display().to_string();
                        self.respond_gate(GateResponse::Edit(path));
                        self.set_feedback(
                            format!("Gate paused for edits at {}.", display),
                            FeedbackLevel::Info,
                        );
                    } else {
                        self.set_feedback(
                            "This approval does not support /edit. Use /approve or /reject.",
                            FeedbackLevel::Error,
                        );
                    }
                } else {
                    self.set_feedback("No gate is waiting for edits.", FeedbackLevel::Error);
                }
            }
            CommandAction::Reply(text) => {
                if self.pending_user_input.is_some() {
                    self.record_user_input_answer(text).await?;
                } else {
                    self.set_feedback("No active user question to answer.", FeedbackLevel::Error);
                }
            }
            CommandAction::Focus(panel) => {
                if self.route == Route::SessionDetail {
                    self.focus = panel;
                    self.set_feedback("Focus updated.", FeedbackLevel::Success);
                } else {
                    self.set_feedback(
                        "Panel focus is only available in session detail.",
                        FeedbackLevel::Error,
                    );
                }
            }
            CommandAction::Live => {
                self.route = Route::SessionDetail;
                self.selected_phase = None;
                self.log_scroll = 0;
                self.focus = Panel::Log;
                self.set_feedback("Returned to session view.", FeedbackLevel::Success);
            }
            CommandAction::Refresh => {
                self.tick().await?;
                self.set_feedback("Refreshed.", FeedbackLevel::Success);
            }
            CommandAction::Summary => {
                if self.session_usage.is_none() {
                    if let Some(session) = self.selected_session() {
                        if let Ok(usage) = self.storage.get_session_usage_summary(&session.id).await
                        {
                            self.session_usage = Some(usage);
                        }
                    }
                }
                if self.session_usage.is_some() {
                    self.go_to_summary();
                    self.set_feedback("Showing session summary.", FeedbackLevel::Success);
                } else {
                    self.set_feedback(
                        "Session summary is not available yet.",
                        FeedbackLevel::Error,
                    );
                }
            }
            CommandAction::Quit => return Ok(true),
        }

        Ok(false)
    }

    async fn record_user_input_answer(&mut self, answer: String) -> Result<()> {
        let Some(mut pending) = self.pending_user_input.take() else {
            self.set_feedback("No active user question to answer.", FeedbackLevel::Error);
            return Ok(());
        };

        let Some(question) = pending.current_question().cloned() else {
            self.set_feedback("No remaining question to answer.", FeedbackLevel::Error);
            return Ok(());
        };

        pending.answers.push(answer.clone());

        if !pending.is_complete() {
            let answered = pending.answers.len();
            let total = pending.questions.len();
            self.pending_user_input = Some(pending);
            self.set_feedback(
                format!(
                    "Recorded answer {}/{}. Continue with the next question.",
                    answered, total
                ),
                FeedbackLevel::Success,
            );
            return Ok(());
        }

        if let Some(responder) = self.pending_user_input_responder.take() {
            let _ = responder.send(pending.answers);
            self.set_feedback(
                format!("Submitted answer for '{}'.", question.header),
                FeedbackLevel::Success,
            );
        } else {
            self.set_feedback(
                "This question is not attached to a running agent anymore.",
                FeedbackLevel::Error,
            );
        }
        Ok(())
    }
}

// ── Public entry points ────────────────────────────────────────────────────────

/// Run `koklo monitor`. Dispatches to TUI or follow mode.
pub async fn run_monitor(
    session_filter: Option<String>,
    follow: bool,
    project_filter: Option<String>,
    storage: Arc<SessionManager>,
) -> Result<()> {
    if follow {
        run_follow_mode(session_filter, project_filter, storage).await
    } else {
        run_tui_mode(session_filter, project_filter, storage).await
    }
}

/// Run the integrated TUI for `koklo run` with a live event bus and gate channel.
pub async fn run_integrated_tui(
    storage: Arc<SessionManager>,
    event_rx: Option<broadcast::Receiver<PipelineEvent>>,
    gate_channel: Option<GateChannel>,
    user_input_channel: Option<UserInputChannel>,
    preset_phases: Vec<String>,
) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = std::io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = MonitorApp::new_integrated(
        storage,
        event_rx,
        gate_channel,
        user_input_channel,
        None,
        None,
        preset_phases,
    )
    .await?;
    let result = tui_integrated_event_loop(&mut terminal, &mut app).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

// ── Follow mode ────────────────────────────────────────────────────────────────

async fn run_follow_mode(
    session_filter: Option<String>,
    project_filter: Option<String>,
    storage: Arc<SessionManager>,
) -> Result<()> {
    let sessions = MonitorApp::load_sessions(&storage, project_filter.as_deref()).await?;
    let session = if let Some(ref filter) = session_filter {
        sessions
            .iter()
            .find(|s| s.id.starts_with(filter.as_str()))
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", filter))?
            .clone()
    } else {
        sessions
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No sessions found"))?
    };

    println!(
        "Following session: {} ({})",
        session.id, session.feature_title
    );

    let mut last_seq: i64 = 0;
    let mut render_engine = PlainRenderEngine::new(true);
    let tick = Duration::from_millis(500);

    loop {
        tokio::time::sleep(tick).await;

        let items = storage
            .get_transcript_items_since(&session.id, last_seq)
            .await?;
        let rendered = render_engine.push_records(items.clone());
        if !rendered.is_empty() {
            print!("{rendered}");
            let _ = std::io::stdout().flush();
        }
        if let Some(last) = items.last() {
            last_seq = last.seq;
        }

        if let Some(s) = storage.get_session(&session.id).await? {
            if s.status == "completed" || s.status == "failed" {
                println!("\nSession {} — {}", short_id(&s.id), s.status);
                break;
            }
        }
    }

    Ok(())
}

// ── TUI mode ───────────────────────────────────────────────────────────────────

async fn run_tui_mode(
    session_filter: Option<String>,
    project_filter: Option<String>,
    storage: Arc<SessionManager>,
) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = std::io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = MonitorApp::new(session_filter.as_deref(), project_filter, storage).await?;
    let result = tui_event_loop(&mut terminal, &mut app).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

async fn tui_event_loop(
    terminal: &mut Terminal<CrosstermBackend<std::io::Stdout>>,
    app: &mut MonitorApp,
) -> Result<()> {
    let tick_rate = Duration::from_millis(500);
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| app.render(f))?;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or(Duration::ZERO);

        if event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }
                if matches!(
                    key.code,
                    KeyCode::Enter | KeyCode::Backspace | KeyCode::Char(_)
                ) && app.handle_input_key(key)
                {
                    if matches!(key.code, KeyCode::Enter) && app.submit_input().await? {
                        break;
                    }
                    continue;
                }
                match app.route.clone() {
                    Route::Dashboard => match key.code {
                        KeyCode::Char('q') | KeyCode::Char('Q') => break,
                        KeyCode::Up => app.handle_up(),
                        KeyCode::Down => app.handle_down(),
                        KeyCode::Enter => app.open_selected_session().await?,
                        KeyCode::Char('w') | KeyCode::Char('W') => app.go_to_workspace(),
                        KeyCode::Char('s') | KeyCode::Char('S') => {
                            app.execute_command(CommandAction::Summary).await?;
                        }
                        KeyCode::Char('r') => {
                            app.tick().await?;
                        }
                        _ => {}
                    },
                    Route::Workspace => match key.code {
                        KeyCode::Char('q') | KeyCode::Char('Q') => break,
                        KeyCode::Up => app.handle_up(),
                        KeyCode::Down => app.handle_down(),
                        KeyCode::Enter => app.open_selected_session().await?,
                        KeyCode::Esc | KeyCode::Backspace => app.go_to_dashboard(),
                        KeyCode::Char('r') => {
                            app.tick().await?;
                        }
                        _ => {}
                    },
                    Route::SessionDetail => match key.code {
                        KeyCode::Char('q') | KeyCode::Char('Q') => break,
                        KeyCode::Up => app.handle_up(),
                        KeyCode::Down => app.handle_down(),
                        KeyCode::PageUp => app.handle_page_up(),
                        KeyCode::PageDown => app.handle_page_down(),
                        KeyCode::Home => app.handle_home(),
                        KeyCode::End => app.handle_end(),
                        KeyCode::Tab => app.toggle_focus(),
                        KeyCode::Esc | KeyCode::Backspace => app.go_to_dashboard(),
                        KeyCode::Char('s') | KeyCode::Char('S') => {
                            app.execute_command(CommandAction::Summary).await?;
                        }
                        KeyCode::Char('r') => {
                            app.tick().await?;
                        }
                        _ => {}
                    },
                    Route::Summary => match key.code {
                        KeyCode::Char('q') | KeyCode::Char('Q') => break,
                        KeyCode::Esc | KeyCode::Backspace => app.route = Route::SessionDetail,
                        _ => {}
                    },
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            app.tick().await?;
            last_tick = Instant::now();
        }
    }

    Ok(())
}

async fn tui_integrated_event_loop(
    terminal: &mut Terminal<CrosstermBackend<std::io::Stdout>>,
    app: &mut MonitorApp,
) -> Result<()> {
    let tick_rate = Duration::from_millis(50); // faster for event bus draining
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| app.render(f))?;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or(Duration::ZERO);

        if event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }
                if matches!(
                    key.code,
                    KeyCode::Enter | KeyCode::Backspace | KeyCode::Char(_)
                ) && app.handle_input_key(key)
                {
                    if matches!(key.code, KeyCode::Enter) && app.submit_input().await? {
                        break;
                    }
                    continue;
                }
                match app.mode.clone() {
                    TuiMode::GateOverlay => match key.code {
                        KeyCode::Char('y') | KeyCode::Char('Y') => {
                            app.respond_gate(GateResponse::Approve);
                            app.set_feedback("Gate approved.", FeedbackLevel::Success);
                        }
                        KeyCode::Char('n') | KeyCode::Char('N') => {
                            app.respond_gate(GateResponse::Reject);
                            app.set_feedback(
                                "Gate rejected. Session will pause.",
                                FeedbackLevel::Info,
                            );
                        }
                        _ => {}
                    },
                    TuiMode::Live => match app.route.clone() {
                        Route::Dashboard => match key.code {
                            KeyCode::Char('q') | KeyCode::Char('Q') => break,
                            KeyCode::Up => app.handle_up(),
                            KeyCode::Down => app.handle_down(),
                            KeyCode::Enter => app.open_selected_session().await?,
                            KeyCode::Char('w') | KeyCode::Char('W') => app.go_to_workspace(),
                            KeyCode::Char('s') | KeyCode::Char('S') => {
                                app.execute_command(CommandAction::Summary).await?;
                            }
                            KeyCode::Char('r') => {
                                app.tick().await?;
                            }
                            _ => {}
                        },
                        Route::Workspace => match key.code {
                            KeyCode::Char('q') | KeyCode::Char('Q') => break,
                            KeyCode::Up => app.handle_up(),
                            KeyCode::Down => app.handle_down(),
                            KeyCode::Enter => app.open_selected_session().await?,
                            KeyCode::Esc | KeyCode::Backspace => app.go_to_dashboard(),
                            KeyCode::Char('r') => {
                                app.tick().await?;
                            }
                            _ => {}
                        },
                        Route::SessionDetail => match key.code {
                            KeyCode::Char('q') | KeyCode::Char('Q') => break,
                            KeyCode::Up => app.handle_up(),
                            KeyCode::Down => app.handle_down(),
                            KeyCode::PageUp => app.handle_page_up(),
                            KeyCode::PageDown => app.handle_page_down(),
                            KeyCode::Home => app.handle_home(),
                            KeyCode::End => app.handle_end(),
                            KeyCode::Tab => app.toggle_focus(),
                            KeyCode::Esc | KeyCode::Backspace => app.go_to_dashboard(),
                            KeyCode::Char('s') | KeyCode::Char('S') => {
                                app.execute_command(CommandAction::Summary).await?;
                            }
                            KeyCode::Char('r') => {
                                app.tick().await?;
                            }
                            _ => {}
                        },
                        Route::Summary => match key.code {
                            KeyCode::Char('q') | KeyCode::Char('Q') => break,
                            KeyCode::Esc | KeyCode::Backspace => {
                                app.route = Route::SessionDetail;
                            }
                            _ => {}
                        },
                    },
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            app.tick().await?;
            last_tick = Instant::now();
        }
    }

    Ok(())
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn status_icon(status: &str) -> &'static str {
    match status {
        "running" => "●",
        "completed" => "✓",
        "failed" => "✗",
        "paused" => "⏸",
        "pending" => "·",
        _ => "○",
    }
}

fn sidebar_border_style(focused: bool) -> Style {
    if focused {
        Style::default().fg(Color::Yellow)
    } else {
        Style::default()
            .fg(Color::DarkGray)
            .add_modifier(Modifier::DIM)
    }
}

fn sidebar_title_style(focused: bool) -> Style {
    if focused {
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
            .fg(Color::Gray)
            .add_modifier(Modifier::BOLD | Modifier::DIM)
    }
}

fn log_border_style(focused: bool) -> Style {
    if focused {
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::White)
    }
}

fn render_info_card(frame: &mut Frame, area: Rect, title: &str, lines: &[String]) {
    let para = Paragraph::new(lines.join("\n"))
        .block(Block::default().borders(Borders::ALL).title(title))
        .wrap(ratatui::widgets::Wrap { trim: false });
    frame.render_widget(para, area);
}

fn short_id(id: &str) -> String {
    id[..6.min(id.len())].to_string()
}

fn truncate(s: &str, max: usize) -> String {
    truncate_text(s, max)
}

fn truncate_text(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        text.to_string()
    } else if max <= 1 {
        "…".to_string()
    } else {
        let head = text.chars().take(max.saturating_sub(1)).collect::<String>();
        format!("{head}…")
    }
}

fn truncate_path(path: &str, max: usize) -> String {
    truncate_left(path, max.max(1))
}

fn session_branch_label(session: &Session) -> String {
    if session.workspace_branch.is_empty() {
        "(shared project tree)".to_string()
    } else {
        session.workspace_branch.clone()
    }
}

fn current_dir_string() -> String {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".to_string())
}

fn detect_project_root() -> Option<String> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join(".koklo").exists() {
            return Some(dir.to_string_lossy().into_owned());
        }
        if !dir.pop() {
            return None;
        }
    }
}

fn terminal_layout(area: Rect) -> TerminalLayout {
    if area.width < 72 || area.height < 22 {
        TerminalLayout::Compact
    } else if area.width < 110 || area.height < 30 {
        TerminalLayout::Stacked
    } else {
        TerminalLayout::Wide
    }
}

fn centered_overlay_rect(
    area: Rect,
    width_percent: u16,
    desired_height: u16,
    min_width: u16,
) -> Rect {
    let max_width = area.width.saturating_sub(2).max(1);
    let max_height = area.height.saturating_sub(2).max(1);
    let desired_width = area
        .width
        .saturating_mul(width_percent)
        .saturating_div(100)
        .max(min_width);
    let width = desired_width.min(max_width);
    let height = desired_height.min(max_height);
    let x = area.x + area.width.saturating_sub(width) / 2;
    let y = area.y + area.height.saturating_sub(height) / 2;
    Rect::new(x, y, width, height)
}

fn format_status_line(
    max_width: usize,
    badge: &str,
    feedback: Option<&str>,
    nav_text: &str,
    cost_text: Option<&str>,
) -> String {
    if max_width == 0 {
        return String::new();
    }

    let mut line = truncate_text(badge, max_width);
    let extras: Vec<&str> = if let Some(feedback) = feedback {
        vec![feedback]
    } else {
        let mut parts = vec![nav_text];
        if let Some(cost) = cost_text {
            parts.push(cost);
        }
        parts
    };

    for extra in extras {
        let candidate = format!("{line}  |  {extra}");
        if candidate.chars().count() <= max_width {
            line = candidate;
            continue;
        }

        let reserved = format!("{line}  |  ");
        let remaining = max_width.saturating_sub(reserved.chars().count());
        if remaining > 0 {
            line = format!("{reserved}{}", truncate_text(extra, remaining));
        }
        break;
    }

    line
}

fn phase_dur_str(started_at: &Option<String>, completed_at: &Option<String>) -> String {
    if let (Some(start), Some(end)) = (started_at, completed_at) {
        if let (Ok(s), Ok(e)) = (
            chrono::DateTime::parse_from_rfc3339(start),
            chrono::DateTime::parse_from_rfc3339(end),
        ) {
            let secs = (e - s).num_seconds();
            return format!("  {}s", secs);
        }
    }
    String::new()
}

/// Rank phase statuses so bus overrides only advance forward, never regress.
fn phase_status_rank(status: &str) -> u8 {
    match status {
        "pending" => 0,
        "running" => 1,
        "completed" => 2,
        "failed" => 2,
        _ => 0,
    }
}

fn transcript_record_from_event(item: TranscriptItem, seq: i64) -> TranscriptItemRecord {
    TranscriptItemRecord {
        id: item.id,
        session_id: item.session_id,
        phase: item.phase.map(|phase| phase.to_string()),
        agent_name: item.agent_name,
        source: format!("{:?}", item.source).to_lowercase(),
        kind: format!("{:?}", item.kind)
            .chars()
            .flat_map(|ch| {
                if ch.is_ascii_uppercase() {
                    vec!['_', ch.to_ascii_lowercase()]
                } else {
                    vec![ch]
                }
            })
            .collect::<String>()
            .trim_start_matches('_')
            .to_string(),
        status: format!("{:?}", item.status)
            .chars()
            .flat_map(|ch| {
                if ch.is_ascii_uppercase() {
                    vec!['_', ch.to_ascii_lowercase()]
                } else {
                    vec![ch]
                }
            })
            .collect::<String>()
            .trim_start_matches('_')
            .to_string(),
        item_key: item.item_key,
        summary: item.summary,
        payload_json: item.payload.map(|payload| payload.to_string()),
        seq,
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

impl PendingUserInput {
    fn from_record(item: &TranscriptItemRecord) -> Option<Self> {
        let payload = item.payload()?;
        let questions =
            serde_json::from_value::<Vec<UserInputQuestion>>(payload.get("questions")?.clone())
                .ok()?;
        if questions.is_empty() {
            return None;
        }
        Some(Self {
            request_id: item.item_key.clone().unwrap_or_else(|| item.id.clone()),
            questions,
            answers: Vec::new(),
        })
    }
}

fn parse_command_action(input: &str) -> Result<Option<CommandAction>> {
    let trimmed = input.trim();
    if !trimmed.starts_with('/') {
        return Ok(None);
    }

    let command = trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let rest = trimmed[command.len()..].trim();

    let action = match command.as_str() {
        "/help" | "/?" | "/commands" => CommandAction::Help,
        "/approve" | "/yes" => CommandAction::Approve,
        "/reject" | "/no" => CommandAction::Reject,
        "/dashboard" | "/home" => CommandAction::Dashboard,
        "/workspace" | "/ws" => CommandAction::Workspace,
        "/edit" => {
            if rest.is_empty() {
                anyhow::bail!("Usage: /edit <path>");
            }
            CommandAction::Edit(PathBuf::from(rest))
        }
        "/reply" => {
            if rest.is_empty() {
                anyhow::bail!("Usage: /reply <text>");
            }
            CommandAction::Reply(rest.to_string())
        }
        "/focus" => match rest.to_ascii_lowercase().as_str() {
            "sessions" => CommandAction::Focus(Panel::Sessions),
            "phases" => CommandAction::Focus(Panel::Phases),
            "log" | "logs" => CommandAction::Focus(Panel::Log),
            _ => anyhow::bail!("Usage: /focus <sessions|phases|log>"),
        },
        "/live" => CommandAction::Live,
        "/refresh" | "/reload" => CommandAction::Refresh,
        "/summary" => CommandAction::Summary,
        "/quit" | "/exit" => CommandAction::Quit,
        other => anyhow::bail!("Unknown command: {}", other),
    };

    Ok(Some(action))
}

fn tone_style(tone: RenderTone) -> Style {
    match tone {
        RenderTone::Default => Style::default(),
        RenderTone::Muted => Style::default()
            .fg(Color::DarkGray)
            .add_modifier(Modifier::DIM),
        RenderTone::Info => Style::default().fg(Color::Cyan),
        RenderTone::Success => Style::default().fg(Color::Green),
        RenderTone::Warning => Style::default().fg(Color::Yellow),
        RenderTone::Error => Style::default().fg(Color::Red),
    }
}

fn block_lines(block: &RenderBlock) -> Vec<Line<'static>> {
    match &block.body {
        RenderBlockBody::Markdown(text) => crate::md_render::markdown_to_lines(text),
        RenderBlockBody::Lines(lines) if block.kind == RenderBlockKind::FileChange => {
            style_file_change_lines(lines)
        }
        RenderBlockBody::Lines(lines) => {
            let style = tone_style(block.tone);
            lines
                .iter()
                .map(|line| Line::from(Span::styled(line.clone(), style)))
                .collect()
        }
    }
}

fn style_file_change_lines(lines: &[String]) -> Vec<Line<'static>> {
    lines
        .iter()
        .map(|line| style_file_change_line(line))
        .collect()
}

fn style_file_change_line(line: &str) -> Line<'static> {
    let indent = line
        .chars()
        .take_while(|ch| ch.is_whitespace())
        .collect::<String>();
    let trimmed = line[indent.len()..].to_string();

    let (style, accent) = if trimmed.starts_with('+') {
        (
            Style::default().fg(Color::Green).bg(Color::Rgb(16, 48, 24)),
            "+ ",
        )
    } else if trimmed.starts_with('-') {
        (
            Style::default().fg(Color::Red).bg(Color::Rgb(56, 20, 20)),
            "- ",
        )
    } else if trimmed.starts_with("@@") {
        (
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
            "│ ",
        )
    } else if trimmed.starts_with('●') || trimmed.starts_with('Δ') {
        (
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
            "",
        )
    } else {
        (Style::default().fg(Color::White), "")
    };

    let mut spans = Vec::new();
    if !indent.is_empty() {
        spans.push(Span::raw(indent));
    }
    if trimmed.starts_with('+') || trimmed.starts_with('-') {
        spans.push(Span::styled(
            accent.to_string(),
            style.add_modifier(Modifier::BOLD),
        ));
        spans.push(Span::styled(trimmed[1..].to_string(), style));
    } else if trimmed.starts_with("@@") {
        spans.push(Span::styled(accent.to_string(), style));
        spans.push(Span::styled(trimmed, style));
    } else {
        spans.push(Span::styled(trimmed, style));
    }
    Line::from(spans)
}

fn inset_lines(lines: Vec<Line<'static>>, inset: usize) -> Vec<Line<'static>> {
    if inset == 0 {
        return lines;
    }

    let padding = " ".repeat(inset);
    lines
        .into_iter()
        .map(|line| {
            let mut spans = Vec::with_capacity(line.spans.len() + 1);
            spans.push(Span::raw(padding.clone()));
            spans.extend(line.spans);
            Line::from(spans)
        })
        .collect()
}

fn transcript_line_count(render_model: &TranscriptRenderModel) -> usize {
    let mut total = 0usize;
    let mut previous_kind = None;
    for block in &render_model.blocks {
        if previous_kind != Some(block.kind) {
            total += 1;
            previous_kind = Some(block.kind);
        }
        total += block_lines(block).len();
    }
    total
}

fn timeline_window(
    total_lines: usize,
    visible_height: usize,
    scroll_lines: usize,
) -> (usize, usize, usize) {
    if total_lines == 0 || visible_height == 0 {
        return (0, 0, 0);
    }

    let max_scroll = total_lines.saturating_sub(visible_height);
    let clamped_scroll = scroll_lines.min(max_scroll);
    let end = total_lines.saturating_sub(clamped_scroll);
    let start = end.saturating_sub(visible_height);
    (start, end, clamped_scroll)
}

fn preview_lines(block: &RenderBlock, max_lines: usize) -> Vec<Line<'static>> {
    if max_lines == 0 {
        return Vec::new();
    }

    let mut lines = block_lines(block);
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len().saturating_sub(max_lines));
    }
    lines
}

fn card_lines(block: &RenderBlock, max_lines: usize) -> Vec<Line<'static>> {
    if max_lines == 0 {
        return Vec::new();
    }

    let mut lines = vec![Line::from(vec![
        Span::styled(
            block_time(block),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::DIM),
        ),
        Span::raw("  "),
        Span::styled(
            block_status_label(block),
            tone_style(block.tone).add_modifier(Modifier::BOLD),
        ),
    ])];

    if max_lines == 1 {
        return lines;
    }

    let mut preview = preview_lines(block, max_lines.saturating_sub(1));
    if preview.is_empty() {
        preview.push(Line::from(""));
    }
    lines.extend(preview);
    lines
}

fn activity_card_lines(blocks: &[RenderBlock], max_lines: usize) -> Vec<Line<'static>> {
    if max_lines == 0 {
        return Vec::new();
    }

    let mut lines = Vec::new();
    for block in blocks {
        if lines.len() >= max_lines {
            break;
        }

        let style = tone_style(block.tone);
        let summary = compact_block_summary(block);
        lines.push(Line::from(vec![
            Span::styled(
                block_time(block),
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::DIM),
            ),
            Span::raw("  "),
            Span::styled(
                block_status_label(block),
                style.add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::styled(summary, style),
        ]));
    }

    if lines.is_empty() {
        lines.push(Line::from(""));
    }
    lines
}

fn select_live_overview_cards(live_model: &TranscriptLiveModel) -> Vec<LiveOverviewCardKind> {
    let mut cards = Vec::new();

    if !live_model.pending.is_empty() {
        cards.push(LiveOverviewCardKind::Waiting);
    }

    if let Some(primary) = select_primary_live_overview_card(live_model) {
        cards.push(primary);
    }

    cards
}

fn select_primary_live_overview_card(
    live_model: &TranscriptLiveModel,
) -> Option<LiveOverviewCardKind> {
    let assistant = live_model.latest_assistant.as_ref().and_then(|block| {
        is_live_block(block).then_some((
            block.seq,
            live_card_priority(LiveOverviewCardKind::Assistant),
            LiveOverviewCardKind::Assistant,
        ))
    });
    let thinking = live_model.latest_thinking.as_ref().and_then(|block| {
        (is_live_block(block) || block_is_newer_than(block, live_model.latest_assistant.as_ref()))
            .then_some((
                block.seq,
                live_card_priority(LiveOverviewCardKind::Thinking),
                LiveOverviewCardKind::Thinking,
            ))
    });
    let activity = live_model.latest_activity.as_ref().and_then(|block| {
        (is_actionable_activity(block)
            && (is_live_block(block)
                || block_is_newer_than(block, live_model.latest_assistant.as_ref())))
        .then_some((
            block.seq,
            live_card_priority(LiveOverviewCardKind::Activity),
            LiveOverviewCardKind::Activity,
        ))
    });

    [assistant, thinking, activity]
        .into_iter()
        .flatten()
        .max_by_key(|(seq, priority, _)| (*seq, *priority))
        .map(|(_, _, card)| card)
}

fn live_overview_height(cards: &[LiveOverviewCardKind]) -> u16 {
    match cards.len() {
        0 => 0,
        1 => 6,
        _ => 7,
    }
}

fn is_live_block(block: &RenderBlock) -> bool {
    matches!(
        block.status.as_deref(),
        Some("pending" | "streaming" | "in_progress" | "updated")
    )
}

fn block_is_newer_than(block: &RenderBlock, other: Option<&RenderBlock>) -> bool {
    other.map(|other| block.seq > other.seq).unwrap_or(true)
}

fn is_actionable_activity(block: &RenderBlock) -> bool {
    matches!(
        block.kind,
        RenderBlockKind::Tool | RenderBlockKind::Command | RenderBlockKind::FileChange
    )
}

fn live_card_priority(kind: LiveOverviewCardKind) -> u8 {
    match kind {
        LiveOverviewCardKind::Waiting => 0,
        LiveOverviewCardKind::Assistant => 1,
        LiveOverviewCardKind::Activity => 2,
        LiveOverviewCardKind::Thinking => 3,
    }
}

fn block_time(block: &RenderBlock) -> String {
    block
        .created_at
        .as_deref()
        .and_then(|value| value.get(11..19))
        .unwrap_or("??:??:??")
        .to_string()
}

fn block_status_label(block: &RenderBlock) -> String {
    match block.status.as_deref() {
        Some("pending") => "pending".to_string(),
        Some("streaming") => "streaming".to_string(),
        Some("completed") | Some("resolved") => "done".to_string(),
        Some("failed") => "failed".to_string(),
        Some(other) => other.replace('_', " "),
        None => block_kind_label(block.kind).to_ascii_lowercase(),
    }
}

fn compact_block_summary(block: &RenderBlock) -> String {
    match &block.body {
        RenderBlockBody::Markdown(text) => text
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("assistant update")
            .trim()
            .to_string(),
        RenderBlockBody::Lines(lines) => lines
            .iter()
            .find(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .unwrap_or_else(|| block_kind_label(block.kind).to_ascii_lowercase()),
    }
}

fn live_card_title(title: &str, pending_count: usize, block: Option<&RenderBlock>) -> String {
    let icon = match title {
        "ASSISTANT" => "✦",
        "THINKING" => "⋯",
        "ACTIVITY" => "⚙",
        "WAITING" => "?",
        _ => "•",
    };
    if title == "WAITING" && pending_count > 1 {
        format!("{icon} {title} ({pending_count})")
    } else if let Some(block) = block {
        format!("{icon} {} · {}", title, block_kind_label(block.kind))
    } else {
        format!("{icon} {title}")
    }
}

fn block_kind_label(kind: RenderBlockKind) -> &'static str {
    match kind {
        RenderBlockKind::Assistant => "Assistant",
        RenderBlockKind::Reasoning => "Reasoning",
        RenderBlockKind::Plan => "Plan",
        RenderBlockKind::Tool => "Tools",
        RenderBlockKind::Command => "Commands",
        RenderBlockKind::FileChange => "Files",
        RenderBlockKind::Approval => "Approval",
        RenderBlockKind::UserInput => "Input",
        RenderBlockKind::Usage => "Usage",
        RenderBlockKind::Lifecycle => "Lifecycle",
        RenderBlockKind::Metadata => "Metadata",
    }
}

fn timeline_section_header(kind: RenderBlockKind) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            format!("── {} ", block_kind_label(kind).to_uppercase()),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "────────────────────────",
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::DIM),
        ),
    ])
}

fn truncate_left(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else if max <= 1 {
        "…".to_string()
    } else {
        let tail = text
            .chars()
            .rev()
            .take(max.saturating_sub(1))
            .collect::<Vec<_>>();
        format!("…{}", tail.into_iter().rev().collect::<String>())
    }
}

fn truncate_left_offset(text: &str, max: usize) -> usize {
    truncate_left(text, max).chars().count()
}

#[cfg(test)]
mod tests {
    use super::{
        activity_card_lines, block_kind_label, format_status_line, live_card_title,
        live_overview_height, parse_command_action, select_live_overview_cards,
        style_file_change_lines, terminal_layout, timeline_section_header, timeline_window,
        CommandAction, LiveOverviewCardKind, Panel, TerminalLayout,
    };
    use crate::render_model::{
        RenderBlock, RenderBlockBody, RenderBlockKind, RenderTone, TranscriptLiveModel,
    };
    use ratatui::{layout::Rect, style::Color};
    use std::path::PathBuf;

    #[test]
    fn parses_focus_command() {
        let parsed = parse_command_action("/focus log").unwrap();
        assert_eq!(parsed, Some(CommandAction::Focus(Panel::Log)));
    }

    #[test]
    fn parses_workspace_command() {
        let parsed = parse_command_action("/workspace").unwrap();
        assert_eq!(parsed, Some(CommandAction::Workspace));
    }

    #[test]
    fn parses_edit_command() {
        let parsed = parse_command_action("/edit docs/spec.md").unwrap();
        assert_eq!(
            parsed,
            Some(CommandAction::Edit(PathBuf::from("docs/spec.md")))
        );
    }

    #[test]
    fn rejects_unknown_command() {
        let err = parse_command_action("/wat").unwrap_err();
        assert!(err.to_string().contains("Unknown command"));
    }

    #[test]
    fn live_waiting_card_title_shows_count() {
        assert_eq!(live_card_title("WAITING", 3, None), "? WAITING (3)");
    }

    #[test]
    fn timeline_header_uses_kind_label() {
        let header = timeline_section_header(RenderBlockKind::Command);
        assert!(header
            .spans
            .iter()
            .any(|span| span.content.contains("COMMANDS")));
        assert_eq!(block_kind_label(RenderBlockKind::FileChange), "Files");
    }

    #[test]
    fn live_card_title_includes_block_label() {
        let block = RenderBlock {
            kind: RenderBlockKind::Reasoning,
            tone: RenderTone::Info,
            source_kind: "reasoning".to_string(),
            status: Some("streaming".to_string()),
            item_key: Some("r1".to_string()),
            seq: 10,
            created_at: None,
            body: RenderBlockBody::Lines(vec!["⋯ inspecting".to_string()]),
        };

        assert_eq!(
            live_card_title("THINKING", 0, Some(&block)),
            "⋯ THINKING · Reasoning"
        );
    }

    #[test]
    fn activity_card_lines_show_recent_summaries() {
        let command = RenderBlock {
            kind: RenderBlockKind::Command,
            tone: RenderTone::Warning,
            source_kind: "command".to_string(),
            status: Some("completed".to_string()),
            item_key: Some("cmd-1".to_string()),
            seq: 1,
            created_at: Some("2026-01-01T12:00:00Z".to_string()),
            body: RenderBlockBody::Lines(vec!["$ cargo test -p koklo-cli".to_string()]),
        };
        let file_change = RenderBlock {
            kind: RenderBlockKind::FileChange,
            tone: RenderTone::Info,
            source_kind: "file_change".to_string(),
            status: Some("updated".to_string()),
            item_key: Some("patch-1".to_string()),
            seq: 2,
            created_at: Some("2026-01-01T12:00:01Z".to_string()),
            body: RenderBlockBody::Lines(vec!["Δ apps/cli/src/monitor.rs".to_string()]),
        };

        let lines = activity_card_lines(&[command, file_change], 3);
        let rendered = lines
            .iter()
            .map(|line| {
                line.spans
                    .iter()
                    .map(|span| span.content.as_ref())
                    .collect::<String>()
            })
            .collect::<Vec<_>>();

        assert!(rendered[0].contains("cargo test -p koklo-cli"));
        assert!(rendered[1].contains("apps/cli/src/monitor.rs"));
    }

    #[test]
    fn overview_hides_stale_completed_assistant_and_activity() {
        let assistant = RenderBlock {
            kind: RenderBlockKind::Assistant,
            tone: RenderTone::Default,
            source_kind: "message_delta".to_string(),
            status: Some("completed".to_string()),
            item_key: Some("a1".to_string()),
            seq: 5,
            created_at: None,
            body: RenderBlockBody::Markdown("Final answer".to_string()),
        };
        let activity = RenderBlock {
            kind: RenderBlockKind::Command,
            tone: RenderTone::Warning,
            source_kind: "command".to_string(),
            status: Some("completed".to_string()),
            item_key: Some("cmd-1".to_string()),
            seq: 4,
            created_at: None,
            body: RenderBlockBody::Lines(vec!["$ cargo test".to_string()]),
        };
        let live = TranscriptLiveModel {
            latest_assistant: Some(assistant),
            latest_activity: Some(activity.clone()),
            recent_activity: vec![activity],
            ..TranscriptLiveModel::default()
        };

        let cards = select_live_overview_cards(&live);
        assert!(cards.is_empty());
        assert_eq!(live_overview_height(&cards), 0);
    }

    #[test]
    fn overview_prefers_newer_activity_over_completed_assistant() {
        let assistant = RenderBlock {
            kind: RenderBlockKind::Assistant,
            tone: RenderTone::Default,
            source_kind: "message_delta".to_string(),
            status: Some("completed".to_string()),
            item_key: Some("a1".to_string()),
            seq: 5,
            created_at: None,
            body: RenderBlockBody::Markdown("Final answer".to_string()),
        };
        let activity = RenderBlock {
            kind: RenderBlockKind::Command,
            tone: RenderTone::Warning,
            source_kind: "command".to_string(),
            status: Some("completed".to_string()),
            item_key: Some("cmd-2".to_string()),
            seq: 6,
            created_at: None,
            body: RenderBlockBody::Lines(vec!["$ cargo fmt".to_string()]),
        };
        let live = TranscriptLiveModel {
            latest_assistant: Some(assistant),
            latest_activity: Some(activity.clone()),
            recent_activity: vec![activity],
            ..TranscriptLiveModel::default()
        };

        assert_eq!(
            select_live_overview_cards(&live),
            vec![LiveOverviewCardKind::Activity]
        );
    }

    #[test]
    fn overview_keeps_waiting_and_primary_live_card_only() {
        let waiting = RenderBlock {
            kind: RenderBlockKind::Approval,
            tone: RenderTone::Warning,
            source_kind: "approval_request".to_string(),
            status: Some("pending".to_string()),
            item_key: Some("approval-1".to_string()),
            seq: 7,
            created_at: None,
            body: RenderBlockBody::Lines(vec!["? Approve".to_string()]),
        };
        let assistant = RenderBlock {
            kind: RenderBlockKind::Assistant,
            tone: RenderTone::Default,
            source_kind: "message_delta".to_string(),
            status: Some("streaming".to_string()),
            item_key: Some("a2".to_string()),
            seq: 8,
            created_at: None,
            body: RenderBlockBody::Markdown("Working".to_string()),
        };
        let live = TranscriptLiveModel {
            latest_assistant: Some(assistant),
            pending: vec![waiting],
            ..TranscriptLiveModel::default()
        };

        assert_eq!(
            select_live_overview_cards(&live),
            vec![
                LiveOverviewCardKind::Waiting,
                LiveOverviewCardKind::Assistant
            ]
        );
        assert_eq!(live_overview_height(&select_live_overview_cards(&live)), 7);
    }

    #[test]
    fn phase_status_rank_orders_correctly() {
        use super::phase_status_rank;
        assert!(phase_status_rank("running") > phase_status_rank("pending"));
        assert!(phase_status_rank("completed") > phase_status_rank("running"));
        assert!(phase_status_rank("failed") > phase_status_rank("running"));
        assert_eq!(phase_status_rank("completed"), phase_status_rank("failed"));
    }

    #[test]
    fn timeline_window_follows_live_tail_by_default() {
        assert_eq!(timeline_window(20, 5, 0), (15, 20, 0));
    }

    #[test]
    fn timeline_window_clamps_history_scroll() {
        assert_eq!(timeline_window(20, 5, 999), (0, 5, 15));
    }

    #[test]
    fn timeline_window_handles_empty_or_tiny_viewports() {
        assert_eq!(timeline_window(0, 5, 3), (0, 0, 0));
        assert_eq!(timeline_window(8, 0, 3), (0, 0, 0));
    }

    #[test]
    fn terminal_layout_switches_at_small_sizes() {
        assert_eq!(
            terminal_layout(Rect::new(0, 0, 140, 40)),
            TerminalLayout::Wide
        );
        assert_eq!(
            terminal_layout(Rect::new(0, 0, 90, 28)),
            TerminalLayout::Stacked
        );
        assert_eq!(
            terminal_layout(Rect::new(0, 0, 60, 20)),
            TerminalLayout::Compact
        );
    }

    #[test]
    fn status_line_prioritizes_core_information_when_narrow() {
        let text = format_status_line(
            28,
            "LIVE",
            None,
            "[q] quit  [Tab] next panel",
            Some("Tokens: 120"),
        );
        assert!(text.contains("LIVE"));
        assert!(!text.contains("Tokens: 120"));
    }

    #[test]
    fn file_change_lines_highlight_additions_and_removals() {
        let lines = style_file_change_lines(&[
            "● Update(src/lib.rs)".to_string(),
            "- old line".to_string(),
            "+ new line".to_string(),
        ]);

        assert_eq!(lines[1].spans[0].style.fg, Some(Color::Red));
        assert_eq!(lines[2].spans[0].style.fg, Some(Color::Green));
    }

    #[test]
    fn bus_phase_override_survives_db_rebuild() {
        use koklo_storage::PhaseRecord;
        use std::collections::HashMap;

        // Simulate: bus says "spec" is running, but DB hasn't caught up yet.
        let preset_phases = ["spec".to_string(), "dev".to_string()];
        let bus_phase_status: HashMap<String, (String, Option<String>)> = {
            let mut m = HashMap::new();
            m.insert(
                "spec".to_string(),
                (
                    "running".to_string(),
                    Some("2026-01-01T00:00:00Z".to_string()),
                ),
            );
            m
        };

        // DB returns no phases (not yet inserted).
        let db_phases: Vec<PhaseRecord> = vec![];

        // Rebuild from preset (same logic as tick())
        let db_map: HashMap<String, PhaseRecord> = db_phases
            .into_iter()
            .map(|p| (p.phase.clone(), p))
            .collect();
        let mut phases: Vec<PhaseRecord> = preset_phases
            .iter()
            .map(|name| {
                db_map.get(name).cloned().unwrap_or_else(|| PhaseRecord {
                    id: format!("pending-{}", name),
                    session_id: "test-session".to_string(),
                    phase: name.clone(),
                    status: "pending".to_string(),
                    started_at: None,
                    completed_at: None,
                    error: None,
                })
            })
            .collect();

        // Re-apply bus overrides
        for phase in &mut phases {
            if let Some((bus_status, bus_started_at)) = bus_phase_status.get(&phase.phase) {
                if super::phase_status_rank(bus_status) > super::phase_status_rank(&phase.status) {
                    phase.status = bus_status.clone();
                    if bus_status == "running" && phase.started_at.is_none() {
                        phase.started_at = bus_started_at.clone();
                    }
                }
            }
        }

        assert_eq!(phases[0].phase, "spec");
        assert_eq!(phases[0].status, "running");
        assert!(phases[0].started_at.is_some());
        assert_eq!(phases[1].phase, "dev");
        assert_eq!(phases[1].status, "pending");
    }
}
