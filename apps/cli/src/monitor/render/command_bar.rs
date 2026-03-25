use super::*;

impl MonitorApp {
    pub(crate) fn render_command_bar(&self, frame: &mut Frame, area: Rect) {
        let gate_allows_edit = self
            .runtime
            .pending_gate_display
            .as_ref()
            .map(|display| display.allow_edit)
            .unwrap_or(false);
        let title = if self.ui.mode == TuiMode::GateOverlay {
            if gate_allows_edit {
                "COMMAND — gate pending"
            } else {
                "COMMAND — approval pending"
            }
        } else if let Some(pending) = &self.ui.pending_user_input {
            pending
                .current_question()
                .map(|question| question.header.as_str())
                .unwrap_or("REPLY")
        } else {
            "COMMAND"
        };
        let visible_width = area.width.saturating_sub(4) as usize;
        let title = truncate_text(title, visible_width.max(1));
        let border_style = if self.ui.command_input.is_empty() {
            Style::default()
        } else {
            Style::default().fg(Color::Yellow)
        };
        let prompt = if self.ui.command_input.is_empty() {
            if self.ui.mode == TuiMode::GateOverlay {
                if gate_allows_edit {
                    "/approve, /reject or /edit <path>"
                } else {
                    "/approve or /reject"
                }
            } else if self.ui.pending_user_input.is_some() {
                "Type your answer or /reply <text>"
            } else {
                match self.ui.route {
                    Route::Dashboard => "Type /help, /workspace or press Enter on a session",
                    Route::Workspace => "Type /help, /dashboard or press Enter on a session",
                    Route::SessionDetail => "Type /help, /summary or Esc for dashboard",
                    Route::Summary => "Type /help, /live or Esc for session",
                }
            }
        } else {
            &self.ui.command_input
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
}
