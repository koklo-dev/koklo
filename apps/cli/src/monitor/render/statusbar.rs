use super::*;

impl MonitorApp {
    pub(crate) fn render_statusbar(&self, frame: &mut Frame, area: Rect) {
        let gate_allows_edit = self
            .runtime
            .pending_gate_display
            .as_ref()
            .map(|display| display.allow_edit)
            .unwrap_or(false);
        let cost_part = if self.ui.has_subscription_cost {
            format!("Tokens: {} | via subscription", self.ui.running_tokens)
        } else if let Some(cost) = self.ui.running_cost {
            format!("Tokens: {} | Cost: ${:.4}", self.ui.running_tokens, cost)
        } else if self.ui.running_tokens > 0 {
            format!("Tokens: {}", self.ui.running_tokens)
        } else {
            String::new()
        };

        let nav_text = match self.ui.mode {
            TuiMode::GateOverlay if gate_allows_edit => {
                "[Enter] submit  [Y/N] quick approve-reject  [/edit <path>]"
            }
            TuiMode::GateOverlay => "[Enter] submit  [Y/N] quick approve-reject",
            TuiMode::Live if self.ui.pending_user_input.is_some() => {
                "[Enter] answer  [/reply <text>]"
            }
            TuiMode::Live => match self.ui.route {
                Route::Dashboard => {
                    "[q] quit  [↑↓] select session  [Enter] open  [w] workspace  [r] refresh"
                }
                Route::Workspace => "[q] quit  [↑↓] select session  [Enter] open  [Esc] dashboard",
                Route::SessionDetail => match self.ui.focus {
                    Panel::Phases => "[q] quit  [↑↓] select phase  [Tab] log  [Esc] dashboard",
                    Panel::Log => "[q] quit  [↑↓/Pg] scroll log  [Tab] phases  [Esc] dashboard",
                    Panel::Sessions => "[q] quit  [Esc] dashboard",
                },
                Route::Summary => "[q] quit  [Esc] session  [/] commands",
                _ => "[q] quit  [↑↓] navigate  [Esc] back  [Ctrl+K] commands",
            },
            TuiMode::CommandPalette => "[↑↓] select  [Enter] open  [Esc] close",
        };

        let live_badge = self.status_badge();
        let status_text = format_status_line(
            area.width.saturating_sub(1) as usize,
            &live_badge,
            self.ui
                .command_feedback
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
            .ui
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
        if self.ui.mode == TuiMode::GateOverlay {
            return "WAITING APPROVAL".to_string();
        }
        if let Some(pending) = &self.ui.pending_user_input {
            return format!(
                "WAITING INPUT {}/{}",
                pending.answers.len() + 1,
                pending.questions.len()
            );
        }
        let pending_count = build_transcript_render_model(self.state.transcript.iter())
            .live_model()
            .pending
            .len();
        let route = match self.ui.route {
            Route::Dashboard => "DASHBOARD",
            Route::Workspace => "WORKSPACE",
            Route::SessionDetail => "SESSION",
            Route::Summary => "SUMMARY",
            _ => self.ui.route.badge(),
        };
        if self.ui.route == Route::SessionDetail && pending_count > 0 {
            format!("{route} · waiting {}", pending_count)
        } else if self.ui.route == Route::SessionDetail && self.state.log_scroll > 0 {
            format!("{route} · history -{}", self.state.log_scroll)
        } else {
            route.to_string()
        }
    }
}
