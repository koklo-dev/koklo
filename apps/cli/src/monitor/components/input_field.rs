//! Single-line text input field with cursor.

use ratatui::{
    layout::Rect,
    style::Style,
    text::Span,
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::monitor::theme::{colors, styles};

pub struct InputField<'a> {
    pub value: &'a str,
    pub placeholder: &'a str,
    pub title: &'a str,
    pub focused: bool,
}

impl<'a> InputField<'a> {
    pub fn new(title: &'a str) -> Self {
        Self {
            value: "",
            placeholder: "",
            title,
            focused: false,
        }
    }

    pub fn value(mut self, value: &'a str) -> Self {
        self.value = value;
        self
    }

    pub fn placeholder(mut self, placeholder: &'a str) -> Self {
        self.placeholder = placeholder;
        self
    }

    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let visible_width = area.width.saturating_sub(4) as usize;
        let border_style = if self.focused && !self.value.is_empty() {
            Style::default().fg(colors::ACCENT)
        } else if self.focused {
            styles::border(true)
        } else {
            styles::border(false)
        };

        let display = if self.value.is_empty() {
            self.placeholder
        } else {
            self.value
        };

        let display_text = truncate_left(display, visible_width);
        let text_style = if self.value.is_empty() {
            styles::muted()
        } else {
            styles::body()
        };

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                truncate_text(self.title, visible_width.max(1)),
                styles::title(self.focused),
            ))
            .border_style(border_style);

        let para = Paragraph::new(Span::styled(display_text.clone(), text_style)).block(block);
        frame.render_widget(para, area);

        if self.focused {
            let cursor_col = display_text.chars().count() as u16;
            frame.set_cursor(area.x + 1 + cursor_col, area.y + 1);
        }
    }
}

fn truncate_left(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else if max <= 1 {
        "…".to_string()
    } else {
        let tail: Vec<char> = text.chars().rev().take(max.saturating_sub(1)).collect();
        format!("…{}", tail.into_iter().rev().collect::<String>())
    }
}

fn truncate_text(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        text.to_string()
    } else if max <= 1 {
        "…".to_string()
    } else {
        let head: String = text.chars().take(max.saturating_sub(1)).collect();
        format!("{head}…")
    }
}
