//! `koklo monitor` — live TUI dashboard for pipeline activity.
//!
//! Polls the SQLite database every 500 ms.  Two display modes:
//! - Default: ratatui TUI with sessions + phases + log panels
//! - `--follow`: plain text stream (for CI / scripting)

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
    Summary,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FeedbackLevel {
    Info,
    Success,
    Error,
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
    selected_session: usize,
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
    session_usage: Option<SessionUsageSummary>,
    live_session_id: Option<String>,
    /// Preset phase names in order — used to pre-populate the phase panel as "pending".
    preset_phase_names: Vec<String>,
    command_input: String,
    command_feedback: Option<CommandFeedback>,
    pending_user_input: Option<PendingUserInput>,
}

impl MonitorApp {
    pub async fn new(
        session_filter: Option<&str>,
        project_filter: Option<String>,
        storage: Arc<SessionManager>,
    ) -> Result<Self> {
        let sessions = Self::load_sessions(&storage, project_filter.as_deref()).await?;
        let selected_session = if let Some(filter) = session_filter {
            sessions
                .iter()
                .position(|s| s.id.starts_with(filter))
                .unwrap_or(0)
        } else {
            0
        };

        let (phases, transcript) = if !sessions.is_empty() {
            let sid = &sessions[selected_session].id;
            let p = storage.get_phases_for_session(sid).await?;
            let l = storage.get_transcript_items_for_session(sid).await?;
            (p, l)
        } else {
            (vec![], vec![])
        };

        let last_seq = transcript.last().map(|l| l.seq).unwrap_or(0);

        Ok(Self {
            sessions,
            phases,
            transcript,
            selected_session,
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
            session_usage: None,
            live_session_id: None,
            preset_phase_names: vec![],
            command_input: String::new(),
            command_feedback: None,
            pending_user_input: None,
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
        let selected_session = if let Some(filter) = session_filter {
            sessions
                .iter()
                .position(|s| s.id.starts_with(filter))
                .unwrap_or(0)
        } else {
            0
        };
        let (phases, transcript) = if !sessions.is_empty() {
            let sid = &sessions[selected_session].id;
            let p = storage.get_phases_for_session(sid).await?;
            let l = storage.get_transcript_items_for_session(sid).await?;
            (p, l)
        } else {
            (vec![], vec![])
        };
        let last_seq = transcript.last().map(|l| l.seq).unwrap_or(0);
        Ok(Self {
            sessions,
            phases,
            transcript,
            selected_session,
            last_seq,
            focus: Panel::Sessions,
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
            session_usage: None,
            live_session_id: None,
            preset_phase_names: preset_phases,
            command_input: String::new(),
            command_feedback: None,
            pending_user_input: None,
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
                    Err(_) => break, // lagged or closed
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

        if self.selected_session >= self.sessions.len() && !self.sessions.is_empty() {
            self.selected_session = self.sessions.len() - 1;
        }

        if self.sessions.is_empty() {
            return Ok(changed);
        }

        let sid = self.sessions[self.selected_session].id.clone();
        let new_phases = self.storage.get_phases_for_session(&sid).await?;
        if new_phases.len() != self.phases.len() {
            changed = true;
        }
        if self.preset_phase_names.is_empty() {
            self.phases = new_phases;
        } else {
            use std::collections::HashMap;
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
                self.mode = TuiMode::Summary;
            }
            PipelineEvent::PhaseStarted { phase, session_id } => {
                if self.live_session_id.is_none() {
                    self.live_session_id = Some(session_id.clone());
                }
                if let Some(p) = self
                    .phases
                    .iter_mut()
                    .find(|p| p.phase == phase.to_string())
                {
                    p.status = "running".to_string();
                    p.started_at = Some(chrono::Utc::now().to_rfc3339());
                    p.session_id = session_id;
                }
            }
            PipelineEvent::PhaseCompleted {
                phase,
                session_id: _,
            } => {
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
        match self.mode {
            TuiMode::Summary => self.render_summary(frame),
            _ => {
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

                let cols = Layout::default()
                    .direction(Direction::Horizontal)
                    .constraints([Constraint::Percentage(28), Constraint::Percentage(72)])
                    .split(main_area);

                let left_rows = Layout::default()
                    .direction(Direction::Vertical)
                    .constraints([Constraint::Percentage(45), Constraint::Percentage(55)])
                    .split(cols[0]);

                self.render_sessions(frame, left_rows[0]);
                self.render_phases(frame, left_rows[1]);
                self.render_logs(frame, cols[1]);
                self.render_command_bar(frame, command_area);
                self.render_statusbar(frame, status_area);

                if self.mode == TuiMode::GateOverlay {
                    self.render_gate_overlay(frame);
                } else if self.pending_user_input.is_some() {
                    self.render_user_input_overlay(frame);
                }
            }
        }
    }

    fn render_sessions(&self, frame: &mut Frame, area: Rect) {
        let border_style = if self.focus == Panel::Sessions {
            Style::default().fg(Color::Yellow)
        } else {
            Style::default()
        };

        let items: Vec<ListItem> = self
            .sessions
            .iter()
            .enumerate()
            .map(|(i, s)| {
                let icon = status_icon(&s.status);
                let short_id = short_id(&s.id);
                let short_title = truncate(&s.feature_title, 14);
                let style = if i == self.selected_session {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };
                ListItem::new(format!(
                    "{} {}  {}  {}",
                    icon, short_id, short_title, s.status
                ))
                .style(style)
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title("SESSIONS")
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }

    fn render_phases(&self, frame: &mut Frame, area: Rect) {
        let border_style = if self.focus == Panel::Phases {
            Style::default().fg(Color::Yellow)
        } else {
            Style::default()
        };

        let session_label = self
            .sessions
            .get(self.selected_session)
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
                };
                ListItem::new(format!("{} {}{}", icon, p.phase, dur)).style(style)
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!("PHASES — {}", session_label))
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }

    fn render_logs(&self, frame: &mut Frame, area: Rect) {
        let border_style = if self.focus == Panel::Log {
            Style::default().fg(Color::Yellow)
        } else {
            Style::default()
        };

        let session_label = self
            .sessions
            .get(self.selected_session)
            .map(|s| short_id(&s.id))
            .unwrap_or_else(|| "—".to_string());

        // Determine which phase logs to show.
        let (display_phase, is_live) = if let Some(i) = self.selected_phase {
            // Explicit phase selection from the Phases panel.
            let name = self.phases.get(i).map(|p| p.phase.as_str()).unwrap_or("—");
            let running = self
                .phases
                .get(i)
                .map(|p| p.status == "running")
                .unwrap_or(false);
            (name, running)
        } else {
            // Default: follow the live running phase (or last completed).
            let running = self.phases.iter().find(|p| p.status == "running");
            let phase = running.or_else(|| self.phases.last());
            let name = phase.map(|p| p.phase.as_str()).unwrap_or("—");
            (name, running.is_some())
        };

        let filtered_logs: Vec<&TranscriptItemRecord> = self
            .transcript
            .iter()
            .filter(|l| {
                l.phase
                    .as_deref()
                    .map(|phase| phase == display_phase)
                    .unwrap_or(true)
            })
            .collect();

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

        let visible_height = area.height.saturating_sub(2) as usize;

        let mut all_styled: Vec<Line> = Vec::new();
        let mut agent_buf = String::new();

        let flush_agent_buf = |buf: &mut String, out: &mut Vec<Line>| {
            if !buf.is_empty() {
                let text = std::mem::take(buf);
                out.append(&mut crate::md_render::markdown_to_lines(&text));
            }
        };

        for log in &filtered_logs {
            if log.kind == "message_delta" {
                agent_buf.push_str(&log.summary);
                continue;
            }

            if log.kind == "message" && log.summary == "message completed" {
                continue;
            }

            if !agent_buf.is_empty() {
                flush_agent_buf(&mut agent_buf, &mut all_styled);
            }
            for raw_line in timeline_lines(log) {
                let style = timeline_style(log);
                all_styled.push(Line::from(Span::styled(raw_line, style)));
            }
        }
        flush_agent_buf(&mut agent_buf, &mut all_styled);

        // Scroll to bottom.
        let start = all_styled.len().saturating_sub(visible_height);
        let display_lines: Vec<Line> = all_styled[start..].to_vec();

        let para = Paragraph::new(Text::from(display_lines))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(title)
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
            TuiMode::Summary => "[q] quit  [Tab] live",
            TuiMode::Live if self.pending_user_input.is_some() => {
                "[Enter] answer  [/reply <text>]  [Tab] panels"
            }
            TuiMode::Live => match self.focus {
                Panel::Sessions => "[q] quit  [↑↓] select session  [Tab] next panel  [r] refresh",
                Panel::Phases => "[q] quit  [↑↓] select phase  [Esc] live view  [Tab] next panel",
                Panel::Log => "[q] quit  [Tab] next panel  [r] refresh  [/] commands",
            },
        };

        let status_text = if let Some(feedback) = &self.command_feedback {
            if cost_part.is_empty() {
                feedback.text.clone()
            } else {
                format!("{}  |  {}", feedback.text, cost_part)
            }
        } else if cost_part.is_empty() {
            nav_text.to_string()
        } else {
            format!("{}  |  {}", nav_text, cost_part)
        };

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
                "Type /help for commands"
            }
        } else {
            &self.command_input
        };
        let visible_width = area.width.saturating_sub(4) as usize;
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
        let width = (area.width * 60 / 100).max(50);
        let height = 10u16;
        let x = (area.width.saturating_sub(width)) / 2;
        let y = (area.height.saturating_sub(height)) / 2;
        let overlay_area = Rect::new(x, y, width, height);

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
            if d.allow_edit {
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
        let width = (area.width * 65 / 100).max(56);
        let height = 11u16;
        let x = (area.width.saturating_sub(width)) / 2;
        let y = (area.height.saturating_sub(height)) / 2;
        let overlay_area = Rect::new(x, y, width, height);
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
        lines.push(String::new());
        lines.push("Submit with Enter or use /reply <text>.".to_string());

        let para = Paragraph::new(lines.join("\n")).block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!("User Input — {}", question.header))
                .style(Style::default().fg(Color::Yellow)),
        );
        frame.render_widget(para, overlay_area);
    }

    fn render_summary(&self, frame: &mut Frame) {
        let area = frame.size();

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
            "[q] quit  [Tab] live".to_string(),
        ]));

        let widths = [
            Constraint::Length(18),
            Constraint::Length(12),
            Constraint::Min(20),
        ];
        let table = Table::new(rows, widths).header(header).block(
            Block::default().borders(Borders::ALL).title(format!(
                "SESSION SUMMARY — {}",
                self.live_session_id.as_deref().unwrap_or("—")
            )),
        );

        frame.render_widget(table, area);
    }

    fn select_prev(&mut self) {
        if self.selected_session > 0 {
            self.selected_session -= 1;
            self.reset_for_session();
        }
    }

    fn select_next(&mut self) {
        if self.selected_session + 1 < self.sessions.len() {
            self.selected_session += 1;
            self.reset_for_session();
        }
    }

    pub fn toggle_focus(&mut self) {
        self.focus = match self.focus {
            Panel::Sessions => Panel::Phases,
            Panel::Phases => Panel::Log,
            Panel::Log => Panel::Sessions,
        };
    }

    pub fn handle_up(&mut self) {
        match self.focus {
            Panel::Sessions => self.select_prev(),
            Panel::Phases => self.phase_prev(),
            Panel::Log => {}
        }
    }

    pub fn handle_down(&mut self) {
        match self.focus {
            Panel::Sessions => self.select_next(),
            Panel::Phases => self.phase_next(),
            Panel::Log => {}
        }
    }

    fn phase_prev(&mut self) {
        match self.selected_phase {
            Some(0) | None => {}
            Some(i) => self.selected_phase = Some(i - 1),
        }
    }

    fn phase_next(&mut self) {
        let max = self.phases.len().saturating_sub(1);
        self.selected_phase = Some(match self.selected_phase {
            None => 0,
            Some(i) if i < max => i + 1,
            Some(i) => i,
        });
    }

    fn reset_for_session(&mut self) {
        self.transcript.clear();
        self.phases.clear();
        self.last_seq = 0;
        self.selected_phase = None;
        self.pending_user_input = None;
    }

    pub fn handle_input_key(&mut self, key: KeyEvent) -> bool {
        if key.kind != KeyEventKind::Press {
            return false;
        }

        match key.code {
            KeyCode::Enter => true,
            KeyCode::Backspace => {
                self.command_input.pop();
                true
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
                    "Commands: /help /approve /reject /edit <path> /reply <text> /focus <sessions|phases|log> /live /refresh /summary /quit",
                    FeedbackLevel::Info,
                );
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
                self.focus = panel;
                self.set_feedback("Focus updated.", FeedbackLevel::Success);
            }
            CommandAction::Live => {
                self.mode = TuiMode::Live;
                self.selected_phase = None;
                self.set_feedback("Returned to live view.", FeedbackLevel::Success);
            }
            CommandAction::Refresh => {
                self.tick().await?;
                self.set_feedback("Refreshed.", FeedbackLevel::Success);
            }
            CommandAction::Summary => {
                if self.session_usage.is_some() {
                    self.mode = TuiMode::Summary;
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
    let tick = Duration::from_millis(500);

    loop {
        tokio::time::sleep(tick).await;

        let items = storage
            .get_transcript_items_since(&session.id, last_seq)
            .await?;
        for item in &items {
            let time = item.created_at.get(11..19).unwrap_or("??:??:??");
            if item.kind == "message_delta" {
                print!("{}", item.summary);
            } else {
                for line in timeline_lines(item) {
                    println!("[{}] {}", time, line);
                }
            }
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
                match key.code {
                    KeyCode::Char('q') | KeyCode::Char('Q') => break,
                    KeyCode::Up => app.handle_up(),
                    KeyCode::Down => app.handle_down(),
                    KeyCode::Tab => app.toggle_focus(),
                    // Esc in Phases panel clears phase selection (back to live view).
                    KeyCode::Esc => app.selected_phase = None,
                    KeyCode::Char('r') => {
                        app.tick().await?;
                    }
                    _ => {}
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
                    TuiMode::Summary => match key.code {
                        KeyCode::Char('q') | KeyCode::Char('Q') => break,
                        KeyCode::Tab => app.mode = TuiMode::Live,
                        _ => {}
                    },
                    TuiMode::Live => match key.code {
                        KeyCode::Char('q') | KeyCode::Char('Q') => break,
                        KeyCode::Up => app.handle_up(),
                        KeyCode::Down => app.handle_down(),
                        KeyCode::Tab => app.toggle_focus(),
                        KeyCode::Esc => app.selected_phase = None,
                        KeyCode::Char('r') => {
                            app.tick().await?;
                        }
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

fn short_id(id: &str) -> String {
    id[..6.min(id.len())].to_string()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max.saturating_sub(1)])
    }
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

fn timeline_lines(item: &TranscriptItemRecord) -> Vec<String> {
    let prefix = match item.kind.as_str() {
        "tool_call" => "⚙",
        "tool_result" => "↳",
        "reasoning" => "⋯",
        "plan" => "☰",
        "command" => "$",
        "file_change" => "Δ",
        "approval_request" => "?",
        "approval_decision" => "✓",
        "usage" => "◷",
        "phase_lifecycle" => "•",
        "session_lifecycle" => "■",
        _ => "·",
    };
    item.summary
        .lines()
        .map(|line| format!("{} {}", prefix, line))
        .collect()
}

fn timeline_style(item: &TranscriptItemRecord) -> Style {
    match item.kind.as_str() {
        "tool_call" => Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::DIM),
        "tool_result" => {
            if item.status == "failed" {
                Style::default().fg(Color::Red).add_modifier(Modifier::DIM)
            } else {
                Style::default()
                    .fg(Color::Green)
                    .add_modifier(Modifier::DIM)
            }
        }
        "reasoning" => Style::default().fg(Color::Cyan).add_modifier(Modifier::DIM),
        "plan" => Style::default().fg(Color::Blue).add_modifier(Modifier::DIM),
        "command" => Style::default().fg(Color::LightYellow),
        "file_change" => Style::default().fg(Color::Magenta),
        "approval_request" => Style::default().fg(Color::Yellow),
        "approval_decision" => Style::default().fg(Color::Green),
        "usage" => Style::default().fg(Color::DarkGray),
        "phase_lifecycle" | "session_lifecycle" => Style::default()
            .fg(Color::DarkGray)
            .add_modifier(Modifier::DIM),
        _ => Style::default(),
    }
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
    use super::{parse_command_action, CommandAction, Panel};
    use std::path::PathBuf;

    #[test]
    fn parses_focus_command() {
        let parsed = parse_command_action("/focus log").unwrap();
        assert_eq!(parsed, Some(CommandAction::Focus(Panel::Log)));
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
}
