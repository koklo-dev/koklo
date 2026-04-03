//! Reusable style factories built on the color palette.

use ratatui::style::{Color, Modifier, Style};

use super::colors;

// ── Text hierarchy ─────────────────────────────────────────────────

pub fn heading() -> Style {
    Style::default()
        .fg(colors::TEXT)
        .add_modifier(Modifier::BOLD)
}

pub fn subheading() -> Style {
    Style::default()
        .fg(colors::TEXT_SECONDARY)
        .add_modifier(Modifier::BOLD)
}

pub fn body() -> Style {
    Style::default().fg(colors::TEXT)
}

pub fn secondary() -> Style {
    Style::default().fg(colors::TEXT_SECONDARY)
}

pub fn muted() -> Style {
    Style::default()
        .fg(colors::TEXT_MUTED)
        .add_modifier(Modifier::DIM)
}

// ── Borders ────────────────────────────────────────────────────────

pub fn border(focused: bool) -> Style {
    if focused {
        Style::default().fg(colors::BORDER_FOCUS)
    } else {
        Style::default()
            .fg(colors::BORDER)
            .add_modifier(Modifier::DIM)
    }
}

pub fn title(focused: bool) -> Style {
    if focused {
        Style::default()
            .fg(colors::ACCENT)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
            .fg(colors::TEXT_SECONDARY)
            .add_modifier(Modifier::BOLD | Modifier::DIM)
    }
}

// ── Selection ──────────────────────────────────────────────────────

pub fn selected() -> Style {
    Style::default()
        .fg(colors::ACCENT)
        .add_modifier(Modifier::BOLD)
}

pub fn unselected() -> Style {
    Style::default()
        .fg(colors::TEXT_MUTED)
        .add_modifier(Modifier::DIM)
}

// ── Status / Semantic ──────────────────────────────────────────────

pub fn status_style(status: &str) -> Style {
    match status {
        "running" => Style::default().fg(colors::ACCENT),
        "completed" => Style::default().fg(colors::SUCCESS),
        "failed" => Style::default().fg(colors::DANGER),
        "paused" => Style::default().fg(colors::WARNING),
        "pending" => muted(),
        _ => body(),
    }
}

pub fn tone(tone: TuiTone) -> Style {
    match tone {
        TuiTone::Default => body(),
        TuiTone::Muted => muted(),
        TuiTone::Info => Style::default().fg(colors::INFO),
        TuiTone::Success => Style::default().fg(colors::SUCCESS),
        TuiTone::Warning => Style::default().fg(colors::WARNING),
        TuiTone::Error => Style::default().fg(colors::DANGER),
        TuiTone::Bmad => Style::default().fg(colors::BMAD),
    }
}

pub fn feedback(level: FeedbackLvl) -> Style {
    match level {
        FeedbackLvl::Info => Style::default().fg(Color::Cyan),
        FeedbackLvl::Success => Style::default().fg(colors::SUCCESS),
        FeedbackLvl::Error => Style::default().fg(colors::DANGER),
    }
}

// ── Sidebar ────────────────────────────────────────────────────────

pub fn sidebar_item(active: bool) -> Style {
    if active {
        Style::default()
            .fg(colors::SIDEBAR_ACTIVE)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(colors::SIDEBAR_TEXT)
    }
}

pub fn sidebar_bg() -> Style {
    Style::default()
        .bg(colors::SIDEBAR_BG)
        .fg(colors::SIDEBAR_TEXT)
}

// ── Tone & feedback enums kept here to avoid circular deps ─────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TuiTone {
    Default,
    Muted,
    Info,
    Success,
    Warning,
    Error,
    Bmad,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedbackLvl {
    Info,
    Success,
    Error,
}
