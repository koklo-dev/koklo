//! Horizontal tab bar.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::monitor::theme::colors;

pub struct TabBar<'a> {
    pub tabs: &'a [&'a str],
    pub selected: usize,
}

impl<'a> TabBar<'a> {
    pub fn new(tabs: &'a [&'a str], selected: usize) -> Self {
        Self { tabs, selected }
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let spans: Vec<Span> = self
            .tabs
            .iter()
            .enumerate()
            .flat_map(|(i, tab)| {
                let style = if i == self.selected {
                    Style::default()
                        .fg(colors::ACCENT)
                        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
                } else {
                    Style::default().fg(colors::TEXT_SECONDARY)
                };

                let mut v = vec![Span::styled(format!(" {} ", tab), style)];
                if i + 1 < self.tabs.len() {
                    v.push(Span::styled("│", Style::default().fg(colors::BORDER)));
                }
                v
            })
            .collect();

        let line = Line::from(spans);
        let para = Paragraph::new(line);
        frame.render_widget(para, area);
    }
}
