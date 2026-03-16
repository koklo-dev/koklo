//! `koklo monitor` — live TUI dashboard for pipeline activity.
//!
//! Polls the SQLite database every 500 ms.  Two display modes:
//! - Default: ratatui TUI with sessions + phases + log panels
//! - `--follow`: plain text stream (for CI / scripting)

use anyhow::Result;
use koklo_storage::{AgentLogRecord, PhaseRecord, Session, SessionManager};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame, Terminal,
};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};

#[derive(PartialEq, Clone)]
enum Panel {
    Sessions,
    Phases,
    Log,
}

const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// Live-updating TUI monitor application.
pub struct MonitorApp {
    sessions: Vec<Session>,
    phases: Vec<PhaseRecord>,
    logs: Vec<AgentLogRecord>,
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

        let (phases, logs) = if !sessions.is_empty() {
            let sid = &sessions[selected_session].id;
            let p = storage.get_phases_for_session(sid).await?;
            let l = storage.get_agent_logs_for_session(sid).await?;
            (p, l)
        } else {
            (vec![], vec![])
        };

        let last_seq = logs.last().map(|l| l.seq).unwrap_or(0);

        Ok(Self {
            sessions,
            phases,
            logs,
            selected_session,
            last_seq,
            focus: Panel::Sessions,
            storage,
            project_filter,
            tick_count: 0,
            selected_phase: None,
        })
    }

    async fn load_sessions(
        storage: &SessionManager,
        project_filter: Option<&str>,
    ) -> Result<Vec<Session>> {
        if let Some(path) = project_filter {
            storage.list_sessions_for_project(path).await
        } else {
            storage.list_sessions().await
        }
    }

    /// Poll the DB for new data. Returns `true` if anything changed.
    pub async fn tick(&mut self) -> Result<bool> {
        self.tick_count = self.tick_count.wrapping_add(1);
        let new_sessions =
            Self::load_sessions(&self.storage, self.project_filter.as_deref()).await?;
        let changed = new_sessions.len() != self.sessions.len();
        self.sessions = new_sessions;

        if self.selected_session >= self.sessions.len() && !self.sessions.is_empty() {
            self.selected_session = self.sessions.len() - 1;
        }

        if self.sessions.is_empty() {
            return Ok(changed);
        }

        let sid = self.sessions[self.selected_session].id.clone();

        let new_phases = self.storage.get_phases_for_session(&sid).await?;
        let phases_changed = new_phases.len() != self.phases.len();
        self.phases = new_phases;

        let new_logs = self
            .storage
            .get_agent_logs_since(&sid, self.last_seq)
            .await?;
        if !new_logs.is_empty() {
            self.last_seq = new_logs.last().map(|l| l.seq).unwrap_or(self.last_seq);
            self.logs.extend(new_logs);
            return Ok(true);
        }

        Ok(changed || phases_changed)
    }

    pub fn render(&self, frame: &mut Frame) {
        let area = frame.size();

        let outer = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(1), Constraint::Length(1)])
            .split(area);

        let main_area = outer[0];
        let status_area = outer[1];

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
        self.render_statusbar(frame, status_area);
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

        let filtered_logs: Vec<&AgentLogRecord> = self
            .logs
            .iter()
            .filter(|l| l.phase == display_phase)
            .collect();

        let agent_name = filtered_logs
            .last()
            .map(|l| l.agent_name.as_str())
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

        // Show only the lines that fit in the visible area (scroll to bottom).
        let visible_height = area.height.saturating_sub(2) as usize;
        let start = filtered_logs.len().saturating_sub(visible_height);

        let items: Vec<ListItem> = filtered_logs[start..]
            .iter()
            .map(|log| {
                let time = log.created_at.get(11..19).unwrap_or("??:??:??");
                ListItem::new(format!("[{}] {}", time, log.message))
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }

    fn render_statusbar(&self, frame: &mut Frame, area: Rect) {
        let text = match self.focus {
            Panel::Sessions => "[q] quit  [↑↓] select session  [Tab] next panel  [r] refresh",
            Panel::Phases => "[q] quit  [↑↓] select phase  [Esc] live view  [Tab] next panel",
            Panel::Log => "[q] quit  [Tab] next panel  [r] refresh",
        };
        let para = Paragraph::new(text).style(Style::default().fg(Color::DarkGray));
        frame.render_widget(para, area);
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

    fn toggle_focus(&mut self) {
        self.focus = match self.focus {
            Panel::Sessions => Panel::Phases,
            Panel::Phases => Panel::Log,
            Panel::Log => Panel::Sessions,
        };
    }

    fn handle_up(&mut self) {
        match self.focus {
            Panel::Sessions => self.select_prev(),
            Panel::Phases => self.phase_prev(),
            Panel::Log => {}
        }
    }

    fn handle_down(&mut self) {
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
        self.logs.clear();
        self.phases.clear();
        self.last_seq = 0;
        self.selected_phase = None;
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

        let logs = storage.get_agent_logs_since(&session.id, last_seq).await?;
        for log in &logs {
            let time = log.created_at.get(11..19).unwrap_or("??:??:??");
            println!("[{}] [{}] {}", time, log.agent_name, log.message);
        }
        if let Some(last) = logs.last() {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

fn status_icon(status: &str) -> &'static str {
    match status {
        "running" => "●",
        "completed" => "✓",
        "failed" => "✗",
        "paused" => "⏸",
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
