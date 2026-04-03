//! Unified diff rendering with +/- coloring.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::monitor::theme::{colors, styles};

/// Style a list of diff lines with appropriate colors.
pub fn style_diff_lines(diff_text: &str) -> Vec<Line<'static>> {
    diff_text
        .lines()
        .map(|line| {
            let style = if line.starts_with('+') && !line.starts_with("+++") {
                Style::default().fg(colors::SUCCESS)
            } else if line.starts_with('-') && !line.starts_with("---") {
                Style::default().fg(colors::DANGER)
            } else if line.starts_with("@@") {
                Style::default()
                    .fg(colors::INFO)
                    .add_modifier(Modifier::DIM)
            } else if line.starts_with("diff ") || line.starts_with("index ") {
                Style::default()
                    .fg(colors::TEXT_MUTED)
                    .add_modifier(Modifier::DIM)
            } else {
                Style::default().fg(colors::TEXT_SECONDARY)
            };
            Line::from(Span::styled(line.to_string(), style))
        })
        .collect()
}

/// Render a diff view in a bordered frame.
pub fn render_diff(frame: &mut Frame, area: Rect, title: &str, diff_text: &str, focused: bool) {
    let lines = style_diff_lines(diff_text);
    let block = Block::default()
        .borders(Borders::ALL)
        .title(Span::styled(title, styles::title(focused)))
        .border_style(styles::border(focused));

    let para = Paragraph::new(Text::from(lines))
        .block(block)
        .wrap(Wrap { trim: false });
    frame.render_widget(para, area);
}
