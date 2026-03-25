use super::*;

impl MonitorApp {
    pub(crate) async fn record_user_input_answer(&mut self, answer: String) -> Result<()> {
        let Some(mut pending) = self.ui.pending_user_input.take() else {
            self.set_feedback("No active user question to answer.", FeedbackLevel::Error);
            return Ok(());
        };

        let Some(question) = pending.current_question().cloned() else {
            self.set_feedback("No remaining question to answer.", FeedbackLevel::Error);
            return Ok(());
        };

        pending.answers.push(answer);

        if !pending.is_complete() {
            self.store_partial_user_input_answers(pending);
            return Ok(());
        }

        self.finish_user_input_answer(pending, question.header)
            .await;
        Ok(())
    }

    fn store_partial_user_input_answers(&mut self, pending: PendingUserInput) {
        let answered = pending.answers.len();
        let total = pending.questions.len();
        self.ui.pending_user_input = Some(pending);
        self.set_feedback(
            format!(
                "Recorded answer {}/{}. Continue with the next question.",
                answered, total
            ),
            FeedbackLevel::Success,
        );
    }

    async fn finish_user_input_answer(
        &mut self,
        pending: PendingUserInput,
        question_header: String,
    ) {
        if let Some(responder) = self.runtime.pending_user_input_responder.take() {
            let _ = responder.send(pending.answers);
            self.set_feedback(
                format!("Submitted answer for '{}'.", question_header),
                FeedbackLevel::Success,
            );
        } else {
            self.set_feedback(
                "This question is not attached to a running agent anymore.",
                FeedbackLevel::Error,
            );
        }
    }
}
