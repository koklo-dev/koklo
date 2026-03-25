use super::*;

impl MonitorApp {
    pub(crate) fn render_phases(&self, frame: &mut Frame, area: Rect) {
        let border_style = sidebar_border_style(self.ui.focus == Panel::Phases);

        let session_label = self
            .selected_session()
            .map(|s| short_id(&s.id))
            .unwrap_or_else(|| "—".to_string());

        let spinner_frame = SPINNER[self.ui.tick_count % SPINNER.len()];
        let items: Vec<ListItem> = self
            .state
            .phases
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let icon = if p.status == "running" {
                    spinner_frame
                } else {
                    status_icon(&p.status)
                };
                let dur = phase_dur_str(&p.started_at, &p.completed_at);
                let selected = self.state.selected_phase == Some(i);
                let style = if selected {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::DIM)
                };
                ListItem::new(format!(" {} {}{}", icon, p.phase, dur)).style(style)
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(
                    format!("Phases · {session_label}"),
                    sidebar_title_style(self.ui.focus == Panel::Phases),
                ))
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }
}
