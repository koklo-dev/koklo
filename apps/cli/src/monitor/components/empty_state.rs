//! "No data" placeholder with icon and message.

use ratatui::{
    layout::{Alignment, Rect},
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::Paragraph,
    Frame,
};

use crate::monitor::theme::{colors, styles};

pub struct EmptyState<'a> {
    pub icon: &'a str,
    pub message: &'a str,
    pub hint: Option<&'a str>,
}

impl<'a> EmptyState<'a> {
    pub fn new(message: &'a str) -> Self {
        Self {
            icon: "○",
            message,
            hint: None,
        }
    }

    pub fn icon(mut self, icon: &'a str) -> Self {
        self.icon = icon;
        self
    }

    pub fn hint(mut self, hint: &'a str) -> Self {
        self.hint = Some(hint);
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let mut lines = vec![
            Line::from(""),
            Line::from(Span::styled(
                self.icon,
                Style::default()
                    .fg(colors::TEXT_MUTED)
                    .add_modifier(Modifier::DIM),
            )),
            Line::from(""),
            Line::from(Span::styled(
                self.message,
                Style::default().fg(colors::TEXT_SECONDARY),
            )),
        ];

        if let Some(hint) = self.hint {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(hint, styles::muted())));
        }

        let para = Paragraph::new(Text::from(lines)).alignment(Alignment::Center);
        frame.render_widget(para, area);
    }
}
