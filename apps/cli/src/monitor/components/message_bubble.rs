//! Chat message bubble — left-aligned for AI, right-aligned for user.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Paragraph, Wrap},
    Frame,
};

use crate::monitor::theme::{colors, styles};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageSide {
    Left,  // AI messages
    Right, // User messages
}

pub struct MessageBubble<'a> {
    pub content: &'a str,
    pub sender: &'a str,
    pub side: MessageSide,
    pub timestamp: Option<&'a str>,
}

impl<'a> MessageBubble<'a> {
    pub fn ai(sender: &'a str, content: &'a str) -> Self {
        Self {
            content,
            sender,
            side: MessageSide::Left,
            timestamp: None,
        }
    }

    pub fn user(content: &'a str) -> Self {
        Self {
            content,
            sender: "Vous",
            side: MessageSide::Right,
            timestamp: None,
        }
    }

    pub fn timestamp(mut self, ts: &'a str) -> Self {
        self.timestamp = Some(ts);
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let (prefix, sender_style, body_style) = match self.side {
            MessageSide::Left => (
                "▎ ",
                Style::default()
                    .fg(colors::INFO)
                    .add_modifier(Modifier::BOLD),
                Style::default().fg(colors::TEXT),
            ),
            MessageSide::Right => (
                "  ",
                Style::default()
                    .fg(colors::ACCENT)
                    .add_modifier(Modifier::BOLD),
                Style::default().fg(colors::TEXT_SECONDARY),
            ),
        };

        let mut lines = Vec::new();

        // Header line: sender + optional timestamp
        let mut header_spans = vec![
            Span::styled(prefix, Style::default().fg(colors::BORDER)),
            Span::styled(self.sender, sender_style),
        ];
        if let Some(ts) = self.timestamp {
            header_spans.push(Span::styled(format!("  {}", ts), styles::muted()));
        }
        lines.push(Line::from(header_spans));

        // Body lines
        for line in self.content.lines() {
            lines.push(Line::from(vec![
                Span::styled(prefix, Style::default().fg(colors::BORDER)),
                Span::styled(line.to_string(), body_style),
            ]));
        }

        // Trailing separator
        lines.push(Line::from(""));

        let para = Paragraph::new(Text::from(lines)).wrap(Wrap { trim: false });
        frame.render_widget(para, area);
    }
}
