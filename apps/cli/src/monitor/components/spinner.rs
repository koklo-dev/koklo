//! Animated spinner widget.

use ratatui::{layout::Rect, style::Style, text::Span, widgets::Paragraph, Frame};

use crate::monitor::theme::{colors, icons};

pub fn render_spinner(frame: &mut Frame, area: Rect, tick: usize) {
    let s = icons::spinner_frame(tick);
    let para = Paragraph::new(Span::styled(s, Style::default().fg(colors::ACCENT)));
    frame.render_widget(para, area);
}

pub fn spinner_span(tick: usize) -> Span<'static> {
    Span::styled(
        icons::spinner_frame(tick).to_string(),
        Style::default().fg(colors::ACCENT),
    )
}
