//! Session Summary — refactored from render/summary.rs with new theme.

use ratatui::{
    layout::{Constraint, Rect},
    style::{Modifier, Style},
    text::Span,
    widgets::{Block, Borders, Row, Table},
    Frame,
};

use crate::monitor::format::short_id;
use crate::monitor::theme::{colors, styles};
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_summary_v2(&self, frame: &mut Frame, area: Rect) {
        let header = Row::new(vec!["Phase", "Tokens", "Coût"])
            .style(styles::heading())
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
                rows.push(
                    Row::new(vec![phase.phase.clone(), tokens.to_string(), cost_str])
                        .style(styles::secondary()),
                );
            }
            rows.push(Row::new(vec!["", "", ""]));
            rows.push(
                Row::new(vec![
                    "TOTAL".to_string(),
                    total_tokens.to_string(),
                    total_cost
                        .map(|c| format!("${:.4}", c))
                        .unwrap_or_else(|| "—".to_string()),
                ])
                .style(styles::heading()),
            );
        }

        rows.push(Row::new(vec!["", "", ""]));
        rows.push(
            Row::new(vec![
                "".to_string(),
                "".to_string(),
                "[q] quitter  [Esc] retour".to_string(),
            ])
            .style(styles::muted()),
        );

        let session_label = self
            .selected_session()
            .map(|s| short_id(&s.id))
            .or_else(|| self.state.live_session_id.as_deref().map(short_id))
            .unwrap_or_else(|| "—".to_string());

        let widths = [
            Constraint::Length(18),
            Constraint::Length(12),
            Constraint::Min(20),
        ];

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                format!("RÉSUMÉ SESSION — {session_label}"),
                Style::default()
                    .fg(colors::ACCENT)
                    .add_modifier(Modifier::BOLD),
            ))
            .border_style(Style::default().fg(colors::ACCENT));

        let table = Table::new(rows, widths).header(header).block(block);
        frame.render_widget(table, area);
    }
}
