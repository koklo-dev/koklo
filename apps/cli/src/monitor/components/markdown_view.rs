//! Markdown rendering widget wrapping the existing markdown_to_lines.

use ratatui::{
    layout::Rect,
    text::Text,
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::monitor::theme::styles;
use crate::render::markdown::markdown_to_lines;

/// Render markdown content in a bordered block.
pub fn render_markdown(
    frame: &mut Frame,
    area: Rect,
    content: &str,
    title: Option<&str>,
    focused: bool,
) {
    let lines = markdown_to_lines(content);
    let text = Text::from(lines);

    let mut block = Block::default()
        .borders(Borders::ALL)
        .border_style(styles::border(focused));

    if let Some(t) = title {
        block = block.title(ratatui::text::Span::styled(t, styles::title(focused)));
    }

    let para = Paragraph::new(text).block(block).wrap(Wrap { trim: false });
    frame.render_widget(para, area);
}

/// Render raw markdown lines without a border.
pub fn render_markdown_inline(frame: &mut Frame, area: Rect, content: &str) {
    let lines = markdown_to_lines(content);
    let text = Text::from(lines);
    let para = Paragraph::new(text).wrap(Wrap { trim: false });
    frame.render_widget(para, area);
}
