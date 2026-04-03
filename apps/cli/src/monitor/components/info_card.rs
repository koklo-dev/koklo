//! Compact info card: icon + label + value.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::Span,
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::monitor::theme::colors;

pub struct InfoCard<'a> {
    pub title: &'a str,
    pub lines: &'a [String],
}

impl<'a> InfoCard<'a> {
    pub fn new(title: &'a str, lines: &'a [String]) -> Self {
        Self { title, lines }
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let para = Paragraph::new(self.lines.join("\n"))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(Span::styled(
                        self.title,
                        Style::default()
                            .fg(colors::TEXT_SECONDARY)
                            .add_modifier(Modifier::BOLD),
                    ))
                    .border_style(Style::default().fg(colors::BORDER)),
            )
            .style(Style::default().fg(colors::TEXT_SECONDARY))
            .wrap(Wrap { trim: false });
        frame.render_widget(para, area);
    }
}
