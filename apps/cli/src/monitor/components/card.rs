//! Generic bordered card with title, body, and optional footer.

use ratatui::{
    layout::Rect,
    style::Style,
    text::Text,
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::monitor::theme::{colors, styles};

pub struct Card<'a> {
    pub title: &'a str,
    pub body: Text<'a>,
    pub footer: Option<Text<'a>>,
    pub border_color: Option<ratatui::style::Color>,
    pub focused: bool,
}

impl<'a> Card<'a> {
    pub fn new(title: &'a str, body: Text<'a>) -> Self {
        Self {
            title,
            body,
            footer: None,
            border_color: None,
            focused: false,
        }
    }

    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }

    pub fn border_color(mut self, color: ratatui::style::Color) -> Self {
        self.border_color = Some(color);
        self
    }

    pub fn footer(mut self, footer: Text<'a>) -> Self {
        self.footer = Some(footer);
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let border_style = self
            .border_color
            .map(|c| Style::default().fg(c))
            .unwrap_or_else(|| styles::border(self.focused));
        let title_style = self
            .border_color
            .map(|c| {
                Style::default()
                    .fg(c)
                    .add_modifier(ratatui::style::Modifier::BOLD)
            })
            .unwrap_or_else(|| styles::title(self.focused));

        let mut content = self.body.clone();
        if let Some(footer) = &self.footer {
            content.extend(Text::raw("\n"));
            content.extend(footer.clone());
        }

        let block = Block::default()
            .borders(Borders::ALL)
            .title(ratatui::text::Span::styled(self.title, title_style))
            .border_style(border_style);

        let para = Paragraph::new(content)
            .block(block)
            .wrap(Wrap { trim: false });
        frame.render_widget(para, area);
    }
}

/// Shorthand: render a simple card with string lines.
pub fn render_card(frame: &mut Frame, area: Rect, title: &str, lines: &[String], focused: bool) {
    let body = Text::raw(lines.join("\n"));
    Card::new(title, body).focused(focused).render(frame, area);
}

/// Quick info card (replaces the old `render_info_card`).
pub fn render_info_card(frame: &mut Frame, area: Rect, title: &str, lines: &[String]) {
    let body = Text::raw(lines.join("\n"));
    Card::new(title, body)
        .border_color(colors::BORDER)
        .render(frame, area);
}
