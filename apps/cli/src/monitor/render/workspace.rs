use super::*;

impl MonitorApp {
    pub(crate) fn render_workspace(&self, frame: &mut Frame, area: Rect) {
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
                format!("Current dir {}", truncate_path(&self.state.current_dir, 30)),
                format!(
                    "Project root {}",
                    truncate_path(
                        self.state
                            .current_project_root
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
                    truncate_path(
                        self.state
                            .project_filter
                            .as_deref()
                            .unwrap_or("all sessions"),
                        30
                    )
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
            .state
            .current_project_root
            .as_deref()
            .unwrap_or("not detected");
        let lines = [
            format!("Current dir: {}", self.state.current_dir),
            format!("Project root: {}", project_root),
            format!(
                "Monitor filter: {}",
                self.state
                    .project_filter
                    .as_deref()
                    .unwrap_or("all sessions")
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

    fn sessions_for_current_project(&self) -> usize {
        let Some(project_root) = self.state.current_project_root.as_deref() else {
            return 0;
        };
        self.state
            .sessions
            .iter()
            .filter(|session| session.project_path == project_root)
            .count()
    }

    fn sessions_for_selected_workspace(&self) -> usize {
        let Some(selected) = self.selected_session() else {
            return 0;
        };
        self.state
            .sessions
            .iter()
            .filter(|session| session.workspace_path == selected.workspace_path)
            .count()
    }
}
