use super::*;

impl MonitorApp {
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

        match self.ui.route {
            Route::Dashboard => self.render_dashboard(frame, main_area),
            Route::Workspace => self.render_workspace(frame, main_area),
            Route::SessionDetail => self.render_session_detail(frame, main_area),
            Route::Summary => self.render_summary(frame, main_area),
        }

        self.render_command_bar(frame, command_area);
        self.render_statusbar(frame, status_area);

        if self.ui.mode == TuiMode::GateOverlay {
            self.render_gate_overlay(frame);
        } else if self.ui.pending_user_input.is_some() {
            self.render_user_input_overlay(frame);
        }
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
}
