//! Confirmation dialog: question + approve/deny buttons.

use ratatui::{
    style::{Modifier, Style},
    text::{Line, Span, Text},
    Frame,
};

use super::modal::Modal;
use crate::monitor::theme::colors;

pub struct ConfirmDialog<'a> {
    pub title: &'a str,
    pub question: &'a str,
    pub detail: Option<&'a str>,
    pub approve_label: &'a str,
    pub approve_key: &'a str,
    pub deny_label: &'a str,
    pub deny_key: &'a str,
}

impl<'a> ConfirmDialog<'a> {
    pub fn new(title: &'a str, question: &'a str) -> Self {
        Self {
            title,
            question,
            detail: None,
            approve_label: "Autoriser",
            approve_key: "Y",
            deny_label: "Refuser",
            deny_key: "N",
        }
    }

    pub fn detail(mut self, detail: &'a str) -> Self {
        self.detail = Some(detail);
        self
    }

    pub fn labels(mut self, approve: &'a str, deny: &'a str) -> Self {
        self.approve_label = approve;
        self.deny_label = deny;
        self
    }

    pub fn render(&self, frame: &mut Frame) {
        let mut lines = vec![
            Line::from(""),
            Line::from(Span::styled(
                self.question,
                Style::default()
                    .fg(colors::TEXT)
                    .add_modifier(Modifier::BOLD),
            )),
        ];

        if let Some(detail) = self.detail {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                detail,
                Style::default().fg(colors::TEXT_SECONDARY),
            )));
        }

        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::styled(
                format!("  [{}] {} ", self.approve_key, self.approve_label),
                Style::default()
                    .fg(colors::SUCCESS)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("    "),
            Span::styled(
                format!("  [{}] {} ", self.deny_key, self.deny_label),
                Style::default()
                    .fg(colors::DANGER)
                    .add_modifier(Modifier::BOLD),
            ),
        ]));

        Modal::new(self.title, Text::from(lines))
            .border_color(colors::ACCENT)
            .size(60, 10)
            .render(frame);
    }
}
