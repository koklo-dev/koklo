use super::*;

impl MonitorApp {
    pub(crate) fn render_summary(&self, frame: &mut Frame, area: Rect) {
        let header = Row::new(vec!["Phase", "Tokens", "Cost"])
            .style(Style::default().add_modifier(Modifier::BOLD))
            .bottom_margin(1);

        let mut rows: Vec<Row> = Vec::new();
        let mut total_tokens = 0u64;
        let mut total_cost: Option<f64> = None;

        if let Some(u) = &self.state.session_usage {
            for phase in &u.phases {
                let tokens = phase.prompt_tokens + phase.completion_tokens;
                total_tokens += tokens as u64;
                let cost_str = match phase.cost_usd {
                    Some(c) => {
                        *total_cost.get_or_insert(0.0) += c;
                        format!("${:.4}", c)
                    }
                    None => "—".to_string(),
                };
                rows.push(Row::new(vec![
                    phase.phase.clone(),
                    tokens.to_string(),
                    cost_str,
                ]));
            }
            rows.push(Row::new(vec![
                "".to_string(),
                "".to_string(),
                "".to_string(),
            ]));
            rows.push(
                Row::new(vec![
                    "TOTAL".to_string(),
                    total_tokens.to_string(),
                    total_cost
                        .map(|c| format!("${:.4}", c))
                        .unwrap_or_else(|| "—".to_string()),
                ])
                .style(Style::default().add_modifier(Modifier::BOLD)),
            );
        }

        rows.push(Row::new(vec![
            "".to_string(),
            "".to_string(),
            "[q] quit  [Esc] session".to_string(),
        ]));

        let widths = [
            Constraint::Length(18),
            Constraint::Length(12),
            Constraint::Min(20),
        ];
        let table = Table::new(rows, widths).header(header).block(
            Block::default().borders(Borders::ALL).title(format!(
                "SESSION SUMMARY — {}",
                self.selected_session()
                    .map(|session| short_id(&session.id))
                    .or_else(|| self.state.live_session_id.as_deref().map(short_id))
                    .unwrap_or_else(|| "—".to_string())
            )),
        );

        frame.render_widget(table, area);
    }
}
