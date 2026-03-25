use super::*;

impl MonitorApp {
    /// Poll the DB and event bus for new data. Returns `true` if anything changed.
    pub async fn tick(&mut self) -> Result<bool> {
        self.ui.tick_count = self.ui.tick_count.wrapping_add(1);

        let mut changed = self.expire_feedback_if_needed();

        for event in self.drain_pipeline_events() {
            self.handle_pipeline_event(event).await?;
            changed = true;
        }

        if self.poll_pending_runtime_requests() {
            changed = true;
        }

        if self.refresh_sessions().await? {
            changed = true;
        }

        if self.sync_live_session_selection() {
            changed = true;
        }

        if self.refresh_selected_session_data().await? {
            changed = true;
        }

        Ok(changed)
    }

    fn expire_feedback_if_needed(&mut self) -> bool {
        let expired = self
            .ui
            .command_feedback
            .as_ref()
            .map(|feedback| feedback.expires_at <= Instant::now())
            .unwrap_or(false);

        if expired {
            self.ui.command_feedback = None;
        }

        expired
    }

    fn drain_pipeline_events(&mut self) -> Vec<PipelineEvent> {
        let Some(rx) = self.runtime.event_rx.as_mut() else {
            return Vec::new();
        };

        let mut events = Vec::new();
        loop {
            match rx.try_recv() {
                Ok(event) => events.push(event),
                Err(broadcast::error::TryRecvError::Empty) => break,
                Err(broadcast::error::TryRecvError::Lagged(n)) => {
                    tracing::warn!("Event bus lagged, missed {} events", n);
                }
                Err(broadcast::error::TryRecvError::Closed) => break,
            }
        }
        events
    }

    fn poll_pending_runtime_requests(&mut self) -> bool {
        if self.ui.mode != TuiMode::Live {
            return false;
        }

        let mut changed = false;
        if self.poll_pending_gate_request() {
            changed = true;
        }
        if self.poll_pending_user_input_request() {
            changed = true;
        }
        changed
    }

    fn poll_pending_gate_request(&mut self) -> bool {
        let Some(channel) = self.runtime.gate_channel.as_ref() else {
            return false;
        };
        if !channel.has_pending() {
            return false;
        }

        let Some(req) = channel.take_pending() else {
            return false;
        };

        let koklo_events::GateRequest { display, responder } = req;
        self.runtime.pending_gate_display = Some(display);
        self.runtime.pending_gate_responder = Some(responder);
        self.ui.mode = TuiMode::GateOverlay;
        true
    }

    fn poll_pending_user_input_request(&mut self) -> bool {
        let Some(channel) = self.runtime.user_input_channel.as_ref() else {
            return false;
        };
        if !channel.has_pending() {
            return false;
        }

        let Some(req) = channel.take_pending() else {
            return false;
        };

        let koklo_events::UserInputRequest { display, responder } = req;
        self.ui.pending_user_input = Some(PendingUserInput {
            request_id: display.request_id,
            questions: display.questions,
            answers: Vec::new(),
        });
        self.runtime.pending_user_input_responder = Some(responder);
        self.set_feedback(
            "Agent input requested. Answer directly or use /reply <text>.",
            FeedbackLevel::Info,
        );
        true
    }

    async fn refresh_sessions(&mut self) -> Result<bool> {
        let new_sessions =
            Self::load_sessions(&self.storage, self.state.project_filter.as_deref()).await?;
        let changed = new_sessions.len() != self.state.sessions.len();
        self.state.sessions = new_sessions;
        self.ensure_selected_session();
        Ok(changed)
    }

    fn sync_live_session_selection(&mut self) -> bool {
        let Some(live_id) = self.state.live_session_id.clone() else {
            return false;
        };

        let Some(pos) = self.state.sessions.iter().position(|s| s.id == live_id) else {
            return false;
        };

        if self.selected_session_index() == Some(pos) {
            return false;
        }

        self.state.selected_session_id = Some(live_id);
        self.state.last_seq = self.state.transcript.last().map(|l| l.seq).unwrap_or(0);
        true
    }

    async fn refresh_selected_session_data(&mut self) -> Result<bool> {
        let Some(session) = self.selected_session() else {
            return Ok(false);
        };

        let sid = session.id.clone();
        let mut changed = self.refresh_phases(&sid).await?;
        if self.refresh_transcript(&sid).await? {
            changed = true;
        }

        Ok(changed)
    }

    async fn refresh_phases(&mut self, session_id: &str) -> Result<bool> {
        let new_phases = self.storage.get_phases_for_session(session_id).await?;
        let changed = new_phases.len() != self.state.phases.len();

        self.state.phases = if self.state.preset_phase_names.is_empty() {
            new_phases
        } else {
            self.merge_db_phases_with_presets(new_phases)
        };

        self.apply_bus_phase_overrides();
        Ok(changed)
    }

    fn merge_db_phases_with_presets(&self, new_phases: Vec<PhaseRecord>) -> Vec<PhaseRecord> {
        let db_map: HashMap<String, PhaseRecord> = new_phases
            .into_iter()
            .map(|phase| (phase.phase.clone(), phase))
            .collect();

        self.state
            .preset_phase_names
            .iter()
            .map(|name| {
                db_map.get(name).cloned().unwrap_or_else(|| PhaseRecord {
                    id: format!("pending-{}", name),
                    session_id: self.state.live_session_id.clone().unwrap_or_default(),
                    phase: name.clone(),
                    status: "pending".to_string(),
                    started_at: None,
                    completed_at: None,
                    error: None,
                })
            })
            .collect()
    }

    fn apply_bus_phase_overrides(&mut self) {
        for phase in &mut self.state.phases {
            if let Some((bus_status, bus_started_at)) =
                self.state.bus_phase_status.get(&phase.phase)
            {
                if phase_status_rank(bus_status) > phase_status_rank(&phase.status) {
                    phase.status = bus_status.clone();
                    if bus_status == "running" && phase.started_at.is_none() {
                        phase.started_at = bus_started_at.clone();
                    }
                }
            }
        }
    }

    async fn refresh_transcript(&mut self, session_id: &str) -> Result<bool> {
        let new_logs = self
            .storage
            .get_transcript_items_since(session_id, self.state.last_seq)
            .await?;
        if new_logs.is_empty() {
            return Ok(false);
        }

        self.state.last_seq = new_logs
            .last()
            .map(|item| item.seq)
            .unwrap_or(self.state.last_seq);
        for item in new_logs {
            self.push_transcript_record(item);
        }
        Ok(true)
    }
}
