use super::*;

impl MonitorApp {
    pub(crate) async fn execute_command(&mut self, action: CommandAction) -> Result<bool> {
        match action {
            CommandAction::Help => self.show_help(),
            CommandAction::Dashboard => self.show_dashboard(),
            CommandAction::Workspace => self.show_workspace(),
            CommandAction::Approve => self.handle_gate_command(GateCommand::Approve),
            CommandAction::Reject => self.handle_gate_command(GateCommand::Reject),
            CommandAction::Edit(path) => self.handle_gate_command(GateCommand::Edit(path)),
            CommandAction::Reply(text) => self.handle_reply_command(text).await?,
            CommandAction::Focus(panel) => self.handle_focus_command(panel),
            CommandAction::Live => self.show_live_session(),
            CommandAction::Refresh => self.handle_refresh_command().await?,
            CommandAction::Summary => self.handle_summary_command().await?,
            CommandAction::Quit => return Ok(true),
        }

        Ok(false)
    }

    fn show_help(&mut self) {
        self.set_feedback(
            "Commands: /help /approve /reject /edit <path> /reply <text> /dashboard /workspace /focus <sessions|phases|log> /live /refresh /summary /quit",
            FeedbackLevel::Info,
        );
    }

    fn show_dashboard(&mut self) {
        self.go_to_dashboard();
        self.set_feedback("Returned to dashboard.", FeedbackLevel::Success);
    }

    fn show_workspace(&mut self) {
        self.go_to_workspace();
        self.set_feedback("Showing workspace view.", FeedbackLevel::Success);
    }

    fn show_live_session(&mut self) {
        self.ui.route = Route::SessionDetail;
        self.state.selected_phase = None;
        self.state.log_scroll = 0;
        self.ui.focus = Panel::Log;
        self.set_feedback("Returned to session view.", FeedbackLevel::Success);
    }

    fn handle_focus_command(&mut self, panel: Panel) {
        if self.ui.route == Route::SessionDetail {
            self.ui.focus = panel;
            self.set_feedback("Focus updated.", FeedbackLevel::Success);
        } else {
            self.set_feedback(
                "Panel focus is only available in session detail.",
                FeedbackLevel::Error,
            );
        }
    }

    async fn handle_refresh_command(&mut self) -> Result<()> {
        self.tick().await?;
        self.set_feedback("Refreshed.", FeedbackLevel::Success);
        Ok(())
    }

    async fn handle_summary_command(&mut self) -> Result<()> {
        self.load_session_usage_if_needed().await;
        if self.state.session_usage.is_some() {
            self.go_to_summary();
            self.set_feedback("Showing session summary.", FeedbackLevel::Success);
        } else {
            self.set_feedback(
                "Session summary is not available yet.",
                FeedbackLevel::Error,
            );
        }
        Ok(())
    }

    async fn load_session_usage_if_needed(&mut self) {
        if self.state.session_usage.is_some() {
            return;
        }

        if let Some(session) = self.selected_session() {
            if let Ok(usage) = self.storage.get_session_usage_summary(&session.id).await {
                self.state.session_usage = Some(usage);
            }
        }
    }

    async fn handle_reply_command(&mut self, text: String) -> Result<()> {
        if self.ui.pending_user_input.is_some() {
            self.record_user_input_answer(text).await
        } else {
            self.set_feedback("No active user question to answer.", FeedbackLevel::Error);
            Ok(())
        }
    }

    fn handle_gate_command(&mut self, command: GateCommand) {
        if self.ui.mode != TuiMode::GateOverlay {
            match command {
                GateCommand::Approve => {
                    self.set_feedback("No gate is waiting for approval.", FeedbackLevel::Error)
                }
                GateCommand::Reject => {
                    self.set_feedback("No gate is waiting for rejection.", FeedbackLevel::Error)
                }
                GateCommand::Edit(_) => {
                    self.set_feedback("No gate is waiting for edits.", FeedbackLevel::Error)
                }
            }
            return;
        }

        match command {
            GateCommand::Approve => {
                self.respond_gate(GateResponse::Approve);
                self.set_feedback("Gate approved.", FeedbackLevel::Success);
            }
            GateCommand::Reject => {
                self.respond_gate(GateResponse::Reject);
                self.set_feedback("Gate rejected. Session will pause.", FeedbackLevel::Info);
            }
            GateCommand::Edit(path) => {
                if self
                    .runtime
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
            }
        }
    }
}

enum GateCommand {
    Approve,
    Reject,
    Edit(PathBuf),
}
