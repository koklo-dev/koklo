//! Search input with filter icon and result count.

use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::monitor::theme::{colors, styles};

pub struct SearchInput<'a> {
    pub query: &'a str,
    pub placeholder: &'a str,
    pub result_count: Option<usize>,
    pub focused: bool,
}

impl<'a> SearchInput<'a> {
    pub fn new() -> Self {
        Self {
            query: "",
            placeholder: "Rechercher…",
            result_count: None,
            focused: false,
        }
    }

    pub fn query(mut self, query: &'a str) -> Self {
        self.query = query;
        self
    }

    pub fn placeholder(mut self, placeholder: &'a str) -> Self {
        self.placeholder = placeholder;
        self
    }

    pub fn result_count(mut self, count: usize) -> Self {
        self.result_count = Some(count);
        self
    }

    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let border_style = if self.focused {
            Style::default().fg(colors::ACCENT)
        } else {
            styles::border(false)
        };

        let display = if self.query.is_empty() {
            self.placeholder
        } else {
            self.query
        };

        let text_style = if self.query.is_empty() {
            styles::muted()
        } else {
            styles::body()
        };

        let mut spans = vec![
            Span::styled("🔍 ", Style::default().fg(colors::TEXT_MUTED)),
            Span::styled(display, text_style),
        ];

        if let Some(count) = self.result_count {
            spans.push(Span::styled(
                format!("  ({count} résultats)"),
                styles::muted(),
            ));
        }

        let block = Block::default()
            .borders(Borders::ALL)
            .title("Recherche")
            .border_style(border_style);

        let para = Paragraph::new(Line::from(spans)).block(block);
        frame.render_widget(para, area);

        if self.focused {
            let cursor_col = 3 + display.chars().count() as u16;
            frame.set_cursor(area.x + 1 + cursor_col, area.y + 1);
        }
    }
}
