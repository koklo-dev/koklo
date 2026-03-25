use super::*;

impl MonitorApp {
    pub(crate) fn render_logs(&self, frame: &mut Frame, area: Rect) {
        let border_style = log_border_style(self.ui.focus == Panel::Log);

        let session_label = self
            .selected_session()
            .map(|s| short_id(&s.id))
            .unwrap_or_else(|| "—".to_string());

        let (display_phase, is_live) = self.display_phase_info();
        let filtered_logs = self.filtered_logs_for_selected_phase();

        let agent_name = filtered_logs
            .last()
            .and_then(|l| l.agent_name.as_deref())
            .unwrap_or("—");

        let spinner_frame = SPINNER[self.ui.tick_count % SPINNER.len()];
        let phase_label = if is_live {
            format!("{} {}", spinner_frame, display_phase)
        } else {
            display_phase.to_string()
        };

        let title = format!(
            "{}  ·  session {}  ·  {}",
            agent_name, session_label, phase_label
        );

        let render_model = build_transcript_render_model(filtered_logs.iter().copied());
        let live_model = render_model.live_model();
        let overview_cards = select_live_overview_cards(&live_model);
        let overview_height = live_overview_height(&overview_cards);

        if overview_height == 0 {
            self.render_transcript_timeline(
                frame,
                area,
                &render_model,
                &title,
                border_style,
                self.state.log_scroll,
            );
        } else {
            let sections = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(overview_height), Constraint::Min(8)])
                .split(area);

            self.render_live_overview(frame, sections[0], &live_model, &overview_cards);
            self.render_transcript_timeline(
                frame,
                sections[1],
                &render_model,
                &title,
                border_style,
                self.state.log_scroll,
            );
        }
    }
}
