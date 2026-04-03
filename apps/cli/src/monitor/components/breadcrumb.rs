//! Breadcrumb trail: Home › Sessions › abc123

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::monitor::theme::{colors, icons};

pub struct Breadcrumb<'a> {
    pub segments: &'a [&'a str],
}

impl<'a> Breadcrumb<'a> {
    pub fn new(segments: &'a [&'a str]) -> Self {
        Self { segments }
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let mut spans: Vec<Span> = Vec::new();
        for (i, segment) in self.segments.iter().enumerate() {
            let is_last = i + 1 == self.segments.len();
            let style = if is_last {
                Style::default()
                    .fg(colors::TEXT)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(colors::TEXT_SECONDARY)
            };

            spans.push(Span::styled(*segment, style));
            if !is_last {
                spans.push(Span::styled(
                    icons::ICON_BREADCRUMB_SEP,
                    Style::default().fg(colors::TEXT_MUTED),
                ));
            }
        }

        let line = Line::from(spans);
        let para = Paragraph::new(line);
        frame.render_widget(para, area);
    }
}
