//! Bottom status bar with badge, navigation hints, and cost info.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use super::toast::Toast;
use crate::monitor::theme::{colors, styles};

pub struct StatusBar<'a> {
    pub badge: &'a str,
    pub nav_hints: &'a str,
    pub cost_text: Option<&'a str>,
    pub toast: Option<&'a Toast>,
}

impl<'a> StatusBar<'a> {
    pub fn new(badge: &'a str, nav_hints: &'a str) -> Self {
        Self {
            badge,
            nav_hints,
            cost_text: None,
            toast: None,
        }
    }

    pub fn cost(mut self, text: &'a str) -> Self {
        self.cost_text = Some(text);
        self
    }

    pub fn toast(mut self, toast: &'a Toast) -> Self {
        self.toast = Some(toast);
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        // If there's an active toast, show it instead of nav hints
        if let Some(toast) = self.toast {
            if !toast.is_expired() {
                let style = styles::feedback(toast.level);
                let text = format!("{}  |  {}", self.badge, toast.message);
                let para = Paragraph::new(Span::styled(text, style));
                frame.render_widget(para, area);
                return;
            }
        }

        let mut parts: Vec<Span> = Vec::new();

        // Badge (left)
        parts.push(Span::styled(
            self.badge,
            Style::default()
                .fg(colors::ACCENT)
                .add_modifier(Modifier::BOLD),
        ));

        // Nav hints (center)
        parts.push(Span::styled(
            format!("  │  {}", self.nav_hints),
            Style::default().fg(colors::TEXT_MUTED),
        ));

        // Cost (right)
        if let Some(cost) = self.cost_text {
            parts.push(Span::styled(
                format!("  │  {}", cost),
                Style::default().fg(colors::TEXT_MUTED),
            ));
        }

        let line = Line::from(parts);
        let para = Paragraph::new(line);
        frame.render_widget(para, area);
    }
}
