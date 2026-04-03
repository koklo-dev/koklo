use super::*;

impl MonitorApp {
    fn select_prev(&mut self) {
        if let Some(index) = self.selected_session_index() {
            if index > 0 {
                self.set_selected_session_by_index(index - 1);
            }
        } else if !self.state.sessions.is_empty() {
            self.set_selected_session_by_index(0);
        }
    }
    fn select_next(&mut self) {
        if let Some(index) = self.selected_session_index() {
            if index + 1 < self.state.sessions.len() {
                self.set_selected_session_by_index(index + 1);
            }
        } else if !self.state.sessions.is_empty() {
            self.set_selected_session_by_index(0);
        }
    }

    pub fn toggle_focus(&mut self) {
        self.ui.focus = match self.ui.route {
            Route::Dashboard
            | Route::Workspace
            | Route::ProjectHome
            | Route::ConversationHistory => Panel::Sessions,
            Route::SessionDetail
            | Route::Summary
            | Route::Conversation
            | Route::ExecutionProgress => match self.ui.focus {
                Panel::Phases => Panel::Log,
                _ => Panel::Phases,
            },
            _ => Panel::Sessions,
        };
    }

    pub fn handle_up(&mut self) {
        match self.ui.route {
            Route::Dashboard
            | Route::Workspace
            | Route::ProjectHome
            | Route::ConversationHistory => self.select_prev(),
            Route::SessionDetail | Route::Conversation | Route::ExecutionProgress => {
                match self.ui.focus {
                    Panel::Phases => self.phase_prev(),
                    Panel::Log => self.scroll_log_by(1, 1),
                    Panel::Sessions => self.select_prev(),
                }
            }
            _ => {}
        }
    }

    pub fn handle_down(&mut self) {
        match self.ui.route {
            Route::Dashboard
            | Route::Workspace
            | Route::ProjectHome
            | Route::ConversationHistory => self.select_next(),
            Route::SessionDetail | Route::Conversation | Route::ExecutionProgress => {
                match self.ui.focus {
                    Panel::Phases => self.phase_next(),
                    Panel::Log => self.scroll_log_toward_live(1),
                    Panel::Sessions => self.select_next(),
                }
            }
            _ => {}
        }
    }

    pub fn handle_page_up(&mut self) {
        if self.ui.focus == Panel::Log {
            self.scroll_log_by(10, 1);
        }
    }

    pub fn handle_page_down(&mut self) {
        if self.ui.focus == Panel::Log {
            self.scroll_log_toward_live(10);
        }
    }

    pub fn handle_home(&mut self) {
        if self.ui.focus == Panel::Log {
            self.state.log_scroll = self.max_log_scroll();
        }
    }

    pub fn handle_end(&mut self) {
        if self.ui.focus == Panel::Log {
            self.state.log_scroll = 0;
        }
    }

    pub(crate) async fn open_selected_session(&mut self) -> Result<()> {
        self.ui.route = Route::SessionDetail;
        self.ui.router.push(Route::SessionDetail);
        self.ui.focus = Panel::Log;
        self.ui.focus_zone = FocusZone::Main;
        let (phases, transcript) =
            Self::load_session_data(&self.storage, self.state.selected_session_id.as_deref())
                .await?;
        self.state.phases = phases;
        self.state.transcript = transcript;
        self.state.last_seq = self
            .state
            .transcript
            .last()
            .map(|item| item.seq)
            .unwrap_or(0);
        Ok(())
    }

    pub(crate) fn go_to_dashboard(&mut self) {
        self.ui.route = Route::Dashboard;
        self.ui.router.navigate(Route::Dashboard);
        self.ui.focus = Panel::Sessions;
        self.ui.focus_zone = FocusZone::Main;
        self.state.selected_phase = None;
        self.state.log_scroll = 0;
    }

    pub(crate) fn go_to_workspace(&mut self) {
        self.ui.route = Route::Workspace;
        self.ui.router.push(Route::Workspace);
        self.ui.focus = Panel::Sessions;
        self.state.selected_phase = None;
        self.state.log_scroll = 0;
    }

    pub(crate) fn go_to_summary(&mut self) {
        self.ui.route = Route::Summary;
        self.ui.router.push(Route::Summary);
    }

    fn phase_prev(&mut self) {
        match self.state.selected_phase {
            Some(0) | None => {}
            Some(i) => {
                self.state.selected_phase = Some(i - 1);
                self.state.log_scroll = 0;
            }
        }
    }

    fn phase_next(&mut self) {
        let max = self.state.phases.len().saturating_sub(1);
        self.state.selected_phase = Some(match self.state.selected_phase {
            None => 0,
            Some(i) if i < max => i + 1,
            Some(i) => i,
        });
        self.state.log_scroll = 0;
    }

    pub(crate) fn reset_for_session(&mut self) {
        self.state.transcript.clear();
        self.state.phases.clear();
        self.state.last_seq = 0;
        self.state.selected_phase = None;
        self.ui.pending_user_input = None;
        self.state.session_usage = None;
        self.state.log_scroll = 0;
    }

    fn scroll_log_by(&mut self, delta: usize, minimum_step: usize) {
        let step = delta.max(minimum_step);
        let max_scroll = self.max_log_scroll();
        self.state.log_scroll = (self.state.log_scroll + step).min(max_scroll);
    }

    fn scroll_log_toward_live(&mut self, delta: usize) {
        self.state.log_scroll = self.state.log_scroll.saturating_sub(delta);
    }

    fn max_log_scroll(&self) -> usize {
        let filtered_logs = self.filtered_logs_for_selected_phase();
        let render_model = build_transcript_render_model(filtered_logs.iter().copied());
        let total_lines = transcript_line_count(&render_model);
        total_lines.saturating_sub(1)
    }

    pub(crate) fn filtered_logs_for_selected_phase(&self) -> Vec<&TranscriptItemRecord> {
        let (display_phase, _) = self.display_phase_info();
        self.state
            .transcript
            .iter()
            .filter(|l| {
                l.phase
                    .as_deref()
                    .map(|phase| phase == display_phase)
                    .unwrap_or(true)
            })
            .collect()
    }

    pub(crate) fn display_phase_info(&self) -> (&str, bool) {
        if let Some(i) = self.state.selected_phase {
            let name = self
                .state
                .phases
                .get(i)
                .map(|p| p.phase.as_str())
                .unwrap_or("—");
            let running = self
                .state
                .phases
                .get(i)
                .map(|p| p.status == "running")
                .unwrap_or(false);
            (name, running)
        } else {
            let running = self.state.phases.iter().find(|p| p.status == "running");
            let last_done = self
                .state
                .phases
                .iter()
                .rev()
                .find(|p| p.status == "completed" || p.status == "failed");
            let phase = running.or(last_done).or_else(|| self.state.phases.last());
            let name = phase.map(|p| p.phase.as_str()).unwrap_or("—");
            (name, running.is_some())
        }
    }
}
