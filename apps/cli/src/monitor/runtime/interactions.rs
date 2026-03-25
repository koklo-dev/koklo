use super::*;

impl MonitorApp {
    pub fn respond_gate(&mut self, response: GateResponse) {
        if let Some(responder) = self.runtime.pending_gate_responder.take() {
            let _ = responder.send(response);
        }
        self.runtime.pending_gate_display = None;
        self.ui.mode = TuiMode::Live;
    }

    pub(crate) fn push_transcript_record(&mut self, item: TranscriptItemRecord) {
        self.track_interaction_from_transcript(&item);
        self.state.transcript.push(item);
    }

    fn track_interaction_from_transcript(&mut self, item: &TranscriptItemRecord) {
        if item.kind == "user_input_request" && item.status == "pending" {
            if self.runtime.pending_user_input_responder.is_none() {
                if let Some(pending) = PendingUserInput::from_record(item) {
                    self.ui.pending_user_input = Some(pending);
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
                .ui
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
                self.ui.pending_user_input = None;
                self.runtime.pending_user_input_responder = None;
            }
        }
    }

    pub(crate) fn set_feedback(&mut self, text: impl Into<String>, level: FeedbackLevel) {
        self.ui.command_feedback = Some(CommandFeedback {
            text: text.into(),
            level,
            expires_at: Instant::now() + Duration::from_secs(8),
        });
    }
}
