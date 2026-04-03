//! Page 10: Structured Results — code, tables, markdown rendering.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::monitor::components::{empty_state::EmptyState, tabs::TabBar};
use crate::monitor::theme::{colors, styles};
use crate::monitor::types::MonitorApp;
use crate::render::model::{build_transcript_render_model, RenderBlockBody, RenderBlockKind};

const RESULT_TABS: &[&str] = &["Tout", "Code", "Texte", "Fichiers"];

impl MonitorApp {
    pub(crate) fn render_structured_results(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1), // Tabs
                Constraint::Min(8),    // Content
            ])
            .split(area);

        TabBar::new(RESULT_TABS, 0).render(frame, sections[0]);

        // Build results from transcript
        let filtered_logs = self.filtered_logs_for_selected_phase();
        let render_model = build_transcript_render_model(filtered_logs.iter().copied());

        let result_blocks: Vec<_> = render_model
            .blocks
            .iter()
            .filter(|b| {
                matches!(
                    b.kind,
                    RenderBlockKind::Assistant
                        | RenderBlockKind::FileChange
                        | RenderBlockKind::Plan
                )
            })
            .collect();

        if result_blocks.is_empty() {
            EmptyState::new("Aucun résultat structuré")
                .hint("Les résultats apparaîtront lorsque l'assistant aura terminé")
                .render(frame, sections[1]);
            return;
        }

        let mut all_lines: Vec<Line> = Vec::new();
        for block in &result_blocks {
            // Section header
            all_lines.push(Line::from(Span::styled(
                format!("── {} ──", block.source_kind),
                Style::default()
                    .fg(colors::TEXT_MUTED)
                    .add_modifier(Modifier::DIM),
            )));

            match &block.body {
                RenderBlockBody::Markdown(text) => {
                    for line in text.lines() {
                        all_lines.push(Line::from(Span::styled(
                            format!(" {line}"),
                            Style::default().fg(colors::TEXT),
                        )));
                    }
                }
                RenderBlockBody::Lines(lines) => {
                    for line in lines {
                        all_lines.push(Line::from(Span::styled(
                            format!(" {line}"),
                            Style::default().fg(colors::TEXT),
                        )));
                    }
                }
            }
            all_lines.push(Line::from(""));
        }

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled("Résultats", styles::title(true)))
            .border_style(styles::border(true));

        let para = Paragraph::new(Text::from(all_lines))
            .block(block)
            .wrap(Wrap { trim: false });
        frame.render_widget(para, sections[1]);
    }
}
