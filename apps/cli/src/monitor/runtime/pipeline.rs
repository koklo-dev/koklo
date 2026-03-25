use super::*;

impl MonitorApp {
    pub(crate) async fn handle_pipeline_event(&mut self, event: PipelineEvent) -> Result<()> {
        match event {
            PipelineEvent::Transcript { item } => self.handle_transcript_event(item),
            PipelineEvent::UsageUpdate {
                prompt_tokens,
                completion_tokens,
                cost,
                ..
            } => self.handle_usage_update(prompt_tokens, completion_tokens, cost),
            PipelineEvent::SessionCompleted { session_id } => {
                self.handle_session_completed(session_id).await?
            }
            PipelineEvent::PhaseStarted { phase, session_id } => {
                self.handle_phase_started(phase.to_string(), session_id)
            }
            PipelineEvent::PhaseCompleted {
                phase,
                session_id: _,
            } => self.handle_phase_finished(phase.to_string(), "completed"),
            PipelineEvent::PhaseFailed { phase, .. } => {
                self.handle_phase_finished(phase.to_string(), "failed")
            }
            _ => {}
        }
        Ok(())
    }

    fn handle_transcript_event(&mut self, item: TranscriptItem) {
        let session_id = item.session_id.clone();
        if self.state.live_session_id.is_none() {
            self.state.live_session_id = Some(session_id);
        }
        self.state.last_seq += 1;
        self.push_transcript_record(transcript_record_from_event(item, self.state.last_seq));
    }

    fn handle_usage_update(
        &mut self,
        prompt_tokens: u32,
        completion_tokens: u32,
        cost: Option<CostDisplay>,
    ) {
        self.ui.running_tokens += (prompt_tokens + completion_tokens) as u64;
        match cost {
            Some(CostDisplay::Usd(value)) => {
                *self.ui.running_cost.get_or_insert(0.0) += value;
            }
            Some(CostDisplay::Subscription) => {
                self.ui.has_subscription_cost = true;
            }
            Some(CostDisplay::Free) | None => {}
        }
    }

    async fn handle_session_completed(&mut self, session_id: String) -> Result<()> {
        if let Ok(usage) = self.storage.get_session_usage_summary(&session_id).await {
            self.state.session_usage = Some(usage);
        }
        self.ui.route = Route::Summary;
        Ok(())
    }

    fn handle_phase_started(&mut self, phase: String, session_id: String) {
        if self.state.live_session_id.is_none() {
            self.state.live_session_id = Some(session_id.clone());
        }

        let now = chrono::Utc::now().to_rfc3339();
        self.state
            .bus_phase_status
            .insert(phase.clone(), ("running".to_string(), Some(now.clone())));

        if let Some(existing) = self.state.phases.iter_mut().find(|p| p.phase == phase) {
            existing.status = "running".to_string();
            existing.started_at = Some(now);
            existing.session_id = session_id;
        }
    }

    fn handle_phase_finished(&mut self, phase: String, status: &str) {
        self.state
            .bus_phase_status
            .insert(phase.clone(), (status.to_string(), None));

        if let Some(existing) = self.state.phases.iter_mut().find(|p| p.phase == phase) {
            existing.status = status.to_string();
            existing.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }
}
