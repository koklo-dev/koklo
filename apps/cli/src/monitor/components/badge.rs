//! Inline status badge: colored dot + text.

use ratatui::{
    style::Style,
    text::{Line, Span},
};

use crate::monitor::theme::{colors, styles::TuiTone};

pub struct Badge<'a> {
    pub text: &'a str,
    pub tone: TuiTone,
}

impl<'a> Badge<'a> {
    pub fn new(text: &'a str, tone: TuiTone) -> Self {
        Self { text, tone }
    }

    pub fn to_span(&self) -> Span<'a> {
        let text_style = match self.tone {
            TuiTone::Success => Style::default().fg(colors::SUCCESS),
            TuiTone::Warning => Style::default().fg(colors::WARNING),
            TuiTone::Error => Style::default().fg(colors::DANGER),
            TuiTone::Info => Style::default().fg(colors::INFO),
            TuiTone::Bmad => Style::default().fg(colors::BMAD),
            _ => Style::default().fg(colors::TEXT_MUTED),
        };
        Span::styled(format!("● {}", self.text), text_style)
    }

    pub fn to_line(&self) -> Line<'a> {
        let (dot_color, text_style) = match self.tone {
            TuiTone::Success => (colors::SUCCESS, Style::default().fg(colors::SUCCESS)),
            TuiTone::Warning => (colors::WARNING, Style::default().fg(colors::WARNING)),
            TuiTone::Error => (colors::DANGER, Style::default().fg(colors::DANGER)),
            TuiTone::Info => (colors::INFO, Style::default().fg(colors::INFO)),
            TuiTone::Bmad => (colors::BMAD, Style::default().fg(colors::BMAD)),
            _ => (colors::TEXT_MUTED, Style::default().fg(colors::TEXT_MUTED)),
        };
        Line::from(vec![
            Span::styled("● ", Style::default().fg(dot_color)),
            Span::styled(self.text.to_string(), text_style),
        ])
    }
}

/// Map a status string to a badge tone.
pub fn status_tone(status: &str) -> TuiTone {
    match status {
        "running" => TuiTone::Warning,
        "completed" => TuiTone::Success,
        "failed" => TuiTone::Error,
        "paused" => TuiTone::Info,
        "pending" => TuiTone::Muted,
        _ => TuiTone::Default,
    }
}
