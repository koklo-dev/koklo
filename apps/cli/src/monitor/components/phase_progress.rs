//! Segmented phase progress bar with status coloring.

use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem},
    Frame,
};

use crate::monitor::theme::{colors, icons, styles};

pub struct PhaseSegment {
    pub label: String,
    pub status: String,
}

impl PhaseSegment {
    pub fn new(label: impl Into<String>, status: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            status: status.into(),
        }
    }
}

/// Render phases as a vertical list with status icons and duration.
pub fn render_phase_list(
    frame: &mut Frame,
    area: Rect,
    title: &str,
    segments: &[PhaseSegment],
    selected: Option<usize>,
    focused: bool,
    tick: usize,
) {
    let spinner = icons::spinner_frame(tick);
    let items: Vec<ListItem> = segments
        .iter()
        .enumerate()
        .map(|(i, seg)| {
            let icon = if seg.status == "running" {
                spinner
            } else {
                icons::status_icon(&seg.status)
            };
            let is_selected = selected == Some(i);
            let style = if is_selected {
                styles::selected()
            } else {
                styles::status_style(&seg.status)
            };
            ListItem::new(format!(" {} {}", icon, seg.label)).style(style)
        })
        .collect();

    let block = Block::default()
        .borders(Borders::ALL)
        .title(Span::styled(title, styles::title(focused)))
        .border_style(styles::border(focused));

    let list = List::new(items).block(block);
    frame.render_widget(list, area);
}

/// Render a compact horizontal progress bar for phases.
pub fn render_phase_bar(frame: &mut Frame, area: Rect, segments: &[PhaseSegment]) {
    if segments.is_empty() || area.width < 4 {
        return;
    }

    let total = segments.len();
    let bar_width = (area.width.saturating_sub(2)) as usize;
    let seg_width = (bar_width / total).max(1);

    let spans: Vec<Span> = segments
        .iter()
        .map(|seg| {
            let color = match seg.status.as_str() {
                "completed" => colors::SUCCESS,
                "running" => colors::ACCENT,
                "failed" => colors::DANGER,
                _ => colors::SURFACE_HOVER,
            };
            let fill = "█".repeat(seg_width);
            Span::styled(fill, Style::default().fg(color))
        })
        .collect();

    let line = Line::from(spans);
    let para = ratatui::widgets::Paragraph::new(line);
    frame.render_widget(para, area);
}
