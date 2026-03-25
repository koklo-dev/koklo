use super::*;

impl MonitorApp {
    pub fn handle_input_key(&mut self, key: KeyEvent) -> bool {
        if key.kind != KeyEventKind::Press {
            return false;
        }

        match key.code {
            KeyCode::Enter => {
                !self.ui.command_input.is_empty()
                    || self.ui.pending_user_input.is_some()
                    || self.ui.mode == TuiMode::GateOverlay
            }
            KeyCode::Backspace => {
                if self.ui.command_input.is_empty() {
                    false
                } else {
                    self.ui.command_input.pop();
                    true
                }
            }
            KeyCode::Char(c) => {
                if !self.accepts_char_input(c) {
                    return false;
                }
                self.ui.command_input.push(c);
                true
            }
            _ => false,
        }
    }

    fn accepts_char_input(&self, c: char) -> bool {
        if !self.ui.command_input.is_empty() {
            return true;
        }

        if self.ui.pending_user_input.is_some() {
            return true;
        }

        if c == '/' {
            return true;
        }

        self.ui.mode != TuiMode::GateOverlay && self.ui.pending_user_input.is_some()
            || (self.ui.mode == TuiMode::GateOverlay && c == '/')
    }

    pub async fn submit_input(&mut self) -> Result<bool> {
        let submitted = self.ui.command_input.trim().to_string();
        self.ui.command_input.clear();

        if submitted.is_empty() {
            if self.ui.pending_user_input.is_some() {
                self.set_feedback("Answer cannot be empty.", FeedbackLevel::Error);
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

        if self.ui.pending_user_input.is_some() {
            self.record_user_input_answer(submitted).await?;
            return Ok(false);
        }

        self.handle_freeform_submit();
        Ok(false)
    }

    fn handle_freeform_submit(&mut self) {
        if self.ui.mode == TuiMode::GateOverlay {
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
    }
}
