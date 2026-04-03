//! Temporary feedback notification.

use std::time::Instant;

use ratatui::{layout::Rect, widgets::Paragraph, Frame};

use crate::monitor::theme::styles::{self, FeedbackLvl};

#[derive(Clone, Debug)]
pub struct Toast {
    pub message: String,
    pub level: FeedbackLvl,
    pub expires_at: Instant,
}

impl Toast {
    pub fn new(message: impl Into<String>, level: FeedbackLvl, duration_secs: u64) -> Self {
        Self {
            message: message.into(),
            level,
            expires_at: Instant::now() + std::time::Duration::from_secs(duration_secs),
        }
    }

    pub fn info(message: impl Into<String>) -> Self {
        Self::new(message, FeedbackLvl::Info, 4)
    }

    pub fn success(message: impl Into<String>) -> Self {
        Self::new(message, FeedbackLvl::Success, 4)
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self::new(message, FeedbackLvl::Error, 8)
    }

    pub fn is_expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let style = styles::feedback(self.level);
        let para = Paragraph::new(self.message.as_str()).style(style);
        frame.render_widget(para, area);
    }
}
