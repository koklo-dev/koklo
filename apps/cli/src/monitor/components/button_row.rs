//! Horizontal row of action buttons.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::monitor::theme::{colors, styles::TuiTone};

pub struct Button<'a> {
    pub label: &'a str,
    pub key_hint: Option<&'a str>,
    pub tone: TuiTone,
}

impl<'a> Button<'a> {
    pub fn new(label: &'a str) -> Self {
        Self {
            label,
            key_hint: None,
            tone: TuiTone::Default,
        }
    }

    pub fn key(mut self, key: &'a str) -> Self {
        self.key_hint = Some(key);
        self
    }

    pub fn tone(mut self, tone: TuiTone) -> Self {
        self.tone = tone;
        self
    }
}

pub fn render_button_row(
    frame: &mut Frame,
    area: Rect,
    buttons: &[Button],
    selected: Option<usize>,
) {
    let spans: Vec<Span> = buttons
        .iter()
        .enumerate()
        .flat_map(|(i, btn)| {
            let is_selected = selected == Some(i);
            let color = match btn.tone {
                TuiTone::Success => colors::SUCCESS,
                TuiTone::Error => colors::DANGER,
                TuiTone::Warning => colors::WARNING,
                TuiTone::Bmad => colors::BMAD,
                _ => colors::TEXT_SECONDARY,
            };

            let style = if is_selected {
                Style::default()
                    .fg(color)
                    .add_modifier(Modifier::BOLD | Modifier::REVERSED)
            } else {
                Style::default().fg(color)
            };

            let mut spans = Vec::new();
            if let Some(key) = btn.key_hint {
                spans.push(Span::styled(
                    format!("[{}] ", key),
                    Style::default()
                        .fg(colors::TEXT_MUTED)
                        .add_modifier(Modifier::DIM),
                ));
            }
            spans.push(Span::styled(btn.label, style));
            spans.push(Span::raw("   "));
            spans
        })
        .collect();

    let line = Line::from(spans);
    let para = Paragraph::new(line);
    frame.render_widget(para, area);
}
