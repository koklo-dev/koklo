use super::*;

impl MonitorApp {
    pub(crate) fn render_gate_overlay(&self, frame: &mut Frame) {
        let area = frame.size();
        let overlay_area = centered_overlay_rect(area, 60, 10, 32);

        frame.render_widget(Clear, overlay_area);

        let display = self.runtime.pending_gate_display.as_ref();
        let content = if let Some(d) = display {
            let usage_str = if let Some(u) = &d.usage {
                format!(
                    "Tokens: {} prompt + {} completion",
                    u.prompt_tokens, u.completion_tokens
                )
            } else {
                "Tokens: —".to_string()
            };
            let cost_str = if let Some(c) = &d.cost {
                match c {
                    CostDisplay::Usd(v) => format!("Cost: ${:.4}", v),
                    CostDisplay::Subscription => "Cost: via subscription".to_string(),
                    CostDisplay::Free => "Cost: free".to_string(),
                }
            } else {
                "Cost: —".to_string()
            };
            if overlay_area.width < 60 || overlay_area.height < 10 {
                if d.allow_edit {
                    format!(
                        "GATE {}\n{}\n{}\n[Y] approve  [N] reject  [/edit <path>]",
                        d.phase, usage_str, cost_str
                    )
                } else {
                    format!(
                        "APPROVAL {}\n{}\n{}\n[Y] approve  [N] reject",
                        d.phase, usage_str, cost_str
                    )
                }
            } else if d.allow_edit {
                format!(
                    "GATE: Phase '{}' complete\n\n  {}\n  {}\n\n  [Y] Approve   [N] Reject   [/edit <path>] Pause for edits",
                    d.phase, usage_str, cost_str
                )
            } else {
                format!(
                    "APPROVAL: Phase '{}'\n\n  {}\n\n  {}\n  {}\n\n  [Y] Approve   [N] Reject",
                    d.phase, d.description, usage_str, cost_str
                )
            }
        } else {
            "Approval pending…".to_string()
        };

        let para = Paragraph::new(content)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(if display.map(|d| d.allow_edit).unwrap_or(false) {
                        "Gate Review"
                    } else {
                        "Approval Review"
                    })
                    .style(Style::default().fg(Color::Yellow)),
            )
            .style(Style::default());
        frame.render_widget(para, overlay_area);
    }
}
