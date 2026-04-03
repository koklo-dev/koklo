pub(super) use super::*;

mod navigation;

impl MonitorApp {
    pub async fn new(
        session_filter: Option<&str>,
        project_filter: Option<String>,
        storage: Arc<SessionManager>,
    ) -> Result<Self> {
        let sessions = Self::load_sessions(&storage, project_filter.as_deref()).await?;
        let selected_session_id = Self::resolve_selected_session_id(&sessions, session_filter);
        let (phases, transcript) =
            Self::load_session_data(&storage, selected_session_id.as_deref()).await?;

        let last_seq = transcript.last().map(|l| l.seq).unwrap_or(0);
        let current_project_root = detect_project_root();

        let initial_route = if session_filter.is_some() {
            Route::SessionDetail
        } else {
            Route::ProjectHome
        };

        Ok(Self {
            state: MonitorState {
                sessions,
                phases,
                transcript,
                selected_session_id,
                last_seq,
                project_filter,
                selected_phase: None,
                session_usage: None,
                live_session_id: None,
                preset_phase_names: vec![],
                bus_phase_status: HashMap::new(),
                log_scroll: 0,
                current_dir: current_dir_string(),
                current_project_root,
            },
            ui: MonitorUiState {
                focus: Panel::Sessions,
                focus_zone: FocusZone::Main,
                tick_count: 0,
                running_tokens: 0,
                running_cost: None,
                has_subscription_cost: false,
                mode: TuiMode::Live,
                route: initial_route.clone(),
                router: Router::new(initial_route),
                sidebar_collapsed: false,
                command_input: String::new(),
                command_feedback: None,
                pending_user_input: None,
                palette_query: String::new(),
                palette_selected: 0,
                search_query: String::new(),
                active_tab: 0,
                kanban_col: 0,
                kanban_row: 0,
            },
            runtime: MonitorRuntimeState {
                event_rx: None,
                gate_channel: None,
                pending_gate_display: None,
                pending_gate_responder: None,
                user_input_channel: None,
                pending_user_input_responder: None,
            },
            storage,
        })
    }

    pub async fn new_integrated(
        storage: Arc<SessionManager>,
        event_rx: Option<broadcast::Receiver<PipelineEvent>>,
        gate_channel: Option<GateChannel>,
        user_input_channel: Option<UserInputChannel>,
        session_filter: Option<&str>,
        project_filter: Option<String>,
        preset_phases: Vec<String>,
    ) -> Result<Self> {
        let sessions = Self::load_sessions(&storage, project_filter.as_deref()).await?;
        let selected_session_id = Self::resolve_selected_session_id(&sessions, session_filter);
        let (phases, transcript) =
            Self::load_session_data(&storage, selected_session_id.as_deref()).await?;
        let last_seq = transcript.last().map(|l| l.seq).unwrap_or(0);
        let current_project_root = detect_project_root();

        Ok(Self {
            state: MonitorState {
                sessions,
                phases,
                transcript,
                selected_session_id,
                last_seq,
                project_filter,
                selected_phase: None,
                session_usage: None,
                live_session_id: None,
                preset_phase_names: preset_phases,
                bus_phase_status: HashMap::new(),
                log_scroll: 0,
                current_dir: current_dir_string(),
                current_project_root,
            },
            ui: MonitorUiState {
                focus: Panel::Log,
                focus_zone: FocusZone::Main,
                tick_count: 0,
                running_tokens: 0,
                running_cost: None,
                has_subscription_cost: false,
                mode: TuiMode::Live,
                route: Route::SessionDetail,
                router: Router::new(Route::SessionDetail),
                sidebar_collapsed: false,
                command_input: String::new(),
                command_feedback: None,
                pending_user_input: None,
                palette_query: String::new(),
                palette_selected: 0,
                search_query: String::new(),
                active_tab: 0,
                kanban_col: 0,
                kanban_row: 0,
            },
            runtime: MonitorRuntimeState {
                event_rx,
                gate_channel,
                pending_gate_display: None,
                pending_gate_responder: None,
                user_input_channel,
                pending_user_input_responder: None,
            },
            storage,
        })
    }

    pub(crate) async fn load_sessions(
        storage: &SessionManager,
        project_filter: Option<&str>,
    ) -> Result<Vec<Session>> {
        if let Some(path) = project_filter {
            storage.list_sessions_for_project(path).await
        } else {
            storage.list_sessions().await
        }
    }

    async fn load_session_data(
        storage: &SessionManager,
        session_id: Option<&str>,
    ) -> Result<(Vec<PhaseRecord>, Vec<TranscriptItemRecord>)> {
        if let Some(session_id) = session_id {
            let phases = storage.get_phases_for_session(session_id).await?;
            let transcript = storage.get_transcript_items_for_session(session_id).await?;
            Ok((phases, transcript))
        } else {
            Ok((vec![], vec![]))
        }
    }

    fn resolve_selected_session_id(
        sessions: &[Session],
        session_filter: Option<&str>,
    ) -> Option<String> {
        if let Some(filter) = session_filter {
            sessions
                .iter()
                .find(|session| session.id.starts_with(filter))
                .map(|session| session.id.clone())
        } else {
            sessions.first().map(|session| session.id.clone())
        }
    }

    pub(crate) fn selected_session(&self) -> Option<&Session> {
        self.state
            .selected_session_id
            .as_ref()
            .and_then(|selected_id| {
                self.state
                    .sessions
                    .iter()
                    .find(|session| &session.id == selected_id)
            })
    }

    pub(crate) fn selected_session_index(&self) -> Option<usize> {
        self.state
            .selected_session_id
            .as_ref()
            .and_then(|selected_id| {
                self.state
                    .sessions
                    .iter()
                    .position(|session| &session.id == selected_id)
            })
    }

    pub(crate) fn set_selected_session_by_index(&mut self, index: usize) {
        if let Some(session) = self.state.sessions.get(index) {
            self.state.selected_session_id = Some(session.id.clone());
            self.reset_for_session();
        }
    }

    pub(crate) fn ensure_selected_session(&mut self) {
        if self
            .state
            .selected_session_id
            .as_ref()
            .map(|selected_id| {
                self.state
                    .sessions
                    .iter()
                    .any(|session| &session.id == selected_id)
            })
            .unwrap_or(false)
        {
            return;
        }

        self.state.selected_session_id = self
            .state
            .sessions
            .first()
            .map(|session| session.id.clone());
        self.reset_for_session();
    }
}
