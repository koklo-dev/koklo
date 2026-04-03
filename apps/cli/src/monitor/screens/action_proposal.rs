//! Page 8: Action Proposal — gate approval with impact details.

use ratatui::{
    style::{Modifier, Style},
    text::{Line, Span, Text},
    Frame,
};

use crate::monitor::components::modal::Modal;
use crate::monitor::theme::colors;
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_action_proposal(&self, frame: &mut Frame) {
        let display = self.runtime.pending_gate_display.as_ref();

        let (title, body_lines) = if let Some(d) = display {
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
                    koklo_events::CostDisplay::Usd(v) => format!("Coût: ${:.4}", v),
                    koklo_events::CostDisplay::Subscription => "Coût: via abonnement".to_string(),
                    koklo_events::CostDisplay::Free => "Coût: gratuit".to_string(),
                }
            } else {
                "Coût: —".to_string()
            };

            let title = if d.allow_edit {
                "Validation de la Phase"
            } else {
                "Approbation Requise"
            };

            let mut lines = vec![
                Line::from(""),
                Line::from(Span::styled(
                    "L'assistant souhaite effectuer l'action suivante :",
                    Style::default().fg(colors::TEXT_SECONDARY),
                )),
                Line::from(""),
                Line::from(Span::styled(
                    format!("  Phase: {}", d.phase),
                    Style::default()
                        .fg(colors::TEXT)
                        .add_modifier(Modifier::BOLD),
                )),
                Line::from(Span::styled(
                    format!("  {}", d.description),
                    Style::default().fg(colors::TEXT_SECONDARY),
                )),
                Line::from(""),
                Line::from(Span::styled(
                    format!("  {}  |  {}", usage_str, cost_str),
                    Style::default().fg(colors::TEXT_MUTED),
                )),
                Line::from(""),
            ];

            if d.allow_edit {
                lines.push(Line::from(vec![
                    Span::styled(
                        "  [Y] Autoriser",
                        Style::default()
                            .fg(colors::SUCCESS)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::raw("   "),
                    Span::styled(
                        "[N] Refuser",
                        Style::default()
                            .fg(colors::DANGER)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::raw("   "),
                    Span::styled("[/edit <path>] Modifier", Style::default().fg(colors::INFO)),
                ]));
            } else {
                lines.push(Line::from(vec![
                    Span::styled(
                        "  [Y] Autoriser",
                        Style::default()
                            .fg(colors::SUCCESS)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::raw("   "),
                    Span::styled(
                        "[N] Refuser",
                        Style::default()
                            .fg(colors::DANGER)
                            .add_modifier(Modifier::BOLD),
                    ),
                ]));
            }

            (title, lines)
        } else {
            (
                "Approbation en attente…",
                vec![Line::from(Span::styled(
                    "  En attente de la proposition…",
                    Style::default().fg(colors::TEXT_MUTED),
                ))],
            )
        };

        Modal::new(title, Text::from(body_lines))
            .border_color(colors::ACCENT)
            .size(65, 14)
            .min_width(36)
            .render(frame);
    }
}
