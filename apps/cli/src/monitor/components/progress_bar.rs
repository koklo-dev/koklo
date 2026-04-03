//! Horizontal progress bar — determinate and indeterminate modes.

use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::monitor::theme::colors;

pub enum ProgressMode {
    Determinate(f64),
    Indeterminate(usize),
}

pub fn render_progress_bar(
    frame: &mut Frame,
    area: Rect,
    mode: &ProgressMode,
    label: Option<&str>,
) {
    let bar_width = area.width.saturating_sub(2) as usize;
    if bar_width == 0 {
        return;
    }

    let bar = match mode {
        ProgressMode::Determinate(pct) => {
            let filled = ((pct.clamp(0.0, 1.0)) * bar_width as f64) as usize;
            let empty = bar_width.saturating_sub(filled);
            format!("{}{}", "█".repeat(filled), "░".repeat(empty),)
        }
        ProgressMode::Indeterminate(tick) => {
            let pos = tick % (bar_width * 2);
            let pos = if pos >= bar_width {
                bar_width * 2 - pos - 1
            } else {
                pos
            };
            let mut bar: Vec<char> = vec!['░'; bar_width];
            let block_size = 3.min(bar_width);
            for i in 0..block_size {
                let idx = (pos + i).min(bar_width.saturating_sub(1));
                bar[idx] = '█';
            }
            bar.into_iter().collect()
        }
    };

    let mut spans = vec![Span::styled(bar, Style::default().fg(colors::ACCENT))];
    if let Some(label) = label {
        spans.push(Span::raw(format!(" {}", label)));
    }

    let line = Line::from(spans);
    let para = Paragraph::new(line);
    frame.render_widget(para, area);
}
