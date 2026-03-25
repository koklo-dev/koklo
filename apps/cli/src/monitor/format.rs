pub(crate) fn status_icon(status: &str) -> &'static str {
    match status {
        "running" => "●",
        "completed" => "✓",
        "failed" => "✗",
        "paused" => "⏸",
        "pending" => "·",
        _ => "○",
    }
}

pub(crate) fn sidebar_border_style(focused: bool) -> Style {
    if focused {
        Style::default().fg(Color::Yellow)
    } else {
        Style::default()
            .fg(Color::DarkGray)
            .add_modifier(Modifier::DIM)
    }
}

pub(crate) fn sidebar_title_style(focused: bool) -> Style {
    if focused {
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
            .fg(Color::Gray)
            .add_modifier(Modifier::BOLD | Modifier::DIM)
    }
}

pub(crate) fn log_border_style(focused: bool) -> Style {
    if focused {
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::White)
    }
}

pub(crate) fn render_info_card(frame: &mut Frame, area: Rect, title: &str, lines: &[String]) {
    let para = Paragraph::new(lines.join("\n"))
        .block(Block::default().borders(Borders::ALL).title(title))
        .wrap(ratatui::widgets::Wrap { trim: false });
    frame.render_widget(para, area);
}

use super::*;

pub(crate) fn short_id(id: &str) -> String {
    id[..6.min(id.len())].to_string()
}

pub(crate) fn truncate(s: &str, max: usize) -> String {
    truncate_text(s, max)
}

pub(crate) fn truncate_text(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        text.to_string()
    } else if max <= 1 {
        "…".to_string()
    } else {
        let head = text.chars().take(max.saturating_sub(1)).collect::<String>();
        format!("{head}…")
    }
}

pub(crate) fn truncate_path(path: &str, max: usize) -> String {
    truncate_left(path, max.max(1))
}

pub(crate) fn truncate_left(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else if max <= 1 {
        "…".to_string()
    } else {
        let tail = text
            .chars()
            .rev()
            .take(max.saturating_sub(1))
            .collect::<Vec<_>>();
        format!("…{}", tail.into_iter().rev().collect::<String>())
    }
}

pub(crate) fn truncate_left_offset(text: &str, max: usize) -> usize {
    truncate_left(text, max).chars().count()
}

pub(crate) fn session_branch_label(session: &Session) -> String {
    if session.workspace_branch.is_empty() {
        "(shared project tree)".to_string()
    } else {
        session.workspace_branch.clone()
    }
}

pub(crate) fn current_dir_string() -> String {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".to_string())
}

pub(crate) fn detect_project_root() -> Option<String> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join(".koklo").exists() {
            return Some(dir.to_string_lossy().into_owned());
        }
        if !dir.pop() {
            return None;
        }
    }
}

pub(crate) fn format_status_line(
    max_width: usize,
    badge: &str,
    feedback: Option<&str>,
    nav_text: &str,
    cost_text: Option<&str>,
) -> String {
    if max_width == 0 {
        return String::new();
    }

    let mut line = truncate_text(badge, max_width);
    let extras: Vec<&str> = if let Some(feedback) = feedback {
        vec![feedback]
    } else {
        let mut parts = vec![nav_text];
        if let Some(cost) = cost_text {
            parts.push(cost);
        }
        parts
    };

    for extra in extras {
        let candidate = format!("{line}  |  {extra}");
        if candidate.chars().count() <= max_width {
            line = candidate;
            continue;
        }

        let reserved = format!("{line}  |  ");
        let remaining = max_width.saturating_sub(reserved.chars().count());
        if remaining > 0 {
            line = format!("{reserved}{}", truncate_text(extra, remaining));
        }
        break;
    }

    line
}

pub(crate) fn phase_dur_str(started_at: &Option<String>, completed_at: &Option<String>) -> String {
    if let (Some(start), Some(end)) = (started_at, completed_at) {
        if let (Ok(s), Ok(e)) = (
            chrono::DateTime::parse_from_rfc3339(start),
            chrono::DateTime::parse_from_rfc3339(end),
        ) {
            let secs = (e - s).num_seconds();
            return format!("  {}s", secs);
        }
    }
    String::new()
}
