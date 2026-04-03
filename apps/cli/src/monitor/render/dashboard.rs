use super::*;

impl MonitorApp {
    pub(crate) fn render_dashboard(&self, frame: &mut Frame, area: Rect) {
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

    fn render_sessions(&self, frame: &mut Frame, area: Rect, title: &str) {
        let border_style = sidebar_border_style(self.ui.focus == Panel::Sessions);
        let selected_index = self.selected_session_index();

        let items: Vec<ListItem> = self
            .state
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
                    sidebar_title_style(self.ui.focus == Panel::Sessions),
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
                format!("{} sessions tracked", self.state.sessions.len()),
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
                        self.state
                            .current_project_root
                            .as_deref()
                            .unwrap_or("not detected"),
                        34
                    )
                ),
                format!(
                    "Filter {}",
                    truncate_path(
                        self.state
                            .project_filter
                            .as_deref()
                            .unwrap_or("all sessions"),
                        33
                    )
                ),
                format!("Current dir {}", truncate_path(&self.state.current_dir, 30)),
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

    pub(crate) fn session_counts(&self) -> (usize, usize, usize) {
        let running = self
            .state
            .sessions
            .iter()
            .filter(|session| session.status == "running")
            .count();
        let paused = self
            .state
            .sessions
            .iter()
            .filter(|session| session.status == "paused")
            .count();
        let completed = self
            .state
            .sessions
            .iter()
            .filter(|session| session.status == "completed")
            .count();
        (running, paused, completed)
    }
}
