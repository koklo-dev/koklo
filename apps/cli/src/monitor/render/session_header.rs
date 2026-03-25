use super::*;

impl MonitorApp {
    pub(crate) fn render_session_header(&self, frame: &mut Frame, area: Rect) {
        let lines = if let Some(session) = self.selected_session() {
            vec![
                format!(
                    "{}  ·  {}  ·  preset {}",
                    short_id(&session.id),
                    session.status,
                    session.preset
                ),
                session.feature_title.clone(),
                format!(
                    "workspace: {}",
                    truncate_path(
                        &session.workspace_path,
                        area.width.saturating_sub(4) as usize
                    )
                ),
                format!("branch: {}", session_branch_label(session)),
            ]
        } else {
            vec![
                "No session selected.".to_string(),
                "Press Esc to return to the dashboard.".to_string(),
            ]
        };

        let para = Paragraph::new(lines.join("\n"))
            .block(Block::default().borders(Borders::ALL).title("Session"))
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }
}
