//! Centered overlay modal with title, content, and action hints.

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Span, Text},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

use crate::monitor::theme::colors;

pub struct Modal<'a> {
    pub title: &'a str,
    pub body: Text<'a>,
    pub border_color: Color,
    pub width_percent: u16,
    pub height: u16,
    pub min_width: u16,
}

impl<'a> Modal<'a> {
    pub fn new(title: &'a str, body: Text<'a>) -> Self {
        Self {
            title,
            body,
            border_color: colors::ACCENT,
            width_percent: 60,
            height: 12,
            min_width: 32,
        }
    }

    pub fn border_color(mut self, color: Color) -> Self {
        self.border_color = color;
        self
    }

    pub fn size(mut self, width_percent: u16, height: u16) -> Self {
        self.width_percent = width_percent;
        self.height = height;
        self
    }

    pub fn min_width(mut self, min_width: u16) -> Self {
        self.min_width = min_width;
        self
    }

    pub fn render(&self, frame: &mut Frame) {
        let area = frame.size();
        let overlay = centered_rect(area, self.width_percent, self.height, self.min_width);

        frame.render_widget(Clear, overlay);

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                self.title,
                Style::default()
                    .fg(self.border_color)
                    .add_modifier(Modifier::BOLD),
            ))
            .border_style(Style::default().fg(self.border_color));

        let para = Paragraph::new(self.body.clone())
            .block(block)
            .wrap(Wrap { trim: false });
        frame.render_widget(para, overlay);
    }
}

/// Compute a centered rectangle within `area`.
pub fn centered_rect(area: Rect, width_percent: u16, desired_height: u16, min_width: u16) -> Rect {
    let max_width = area.width.saturating_sub(2).max(1);
    let max_height = area.height.saturating_sub(2).max(1);
    let desired_width = area
        .width
        .saturating_mul(width_percent)
        .saturating_div(100)
        .max(min_width);
    let width = desired_width.min(max_width);
    let height = desired_height.min(max_height);
    let x = area.x + area.width.saturating_sub(width) / 2;
    let y = area.y + area.height.saturating_sub(height) / 2;
    Rect::new(x, y, width, height)
}
