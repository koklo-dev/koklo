//! Page 18: BMAD Mode — guided workflow with phase validation.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::monitor::components::phase_progress::{self, PhaseSegment};
use crate::monitor::theme::{colors, styles};
use crate::monitor::types::MonitorApp;

const BMAD_PHASES: &[&str] = &[
    "analysis",
    "spec",
    "plan",
    "implement",
    "test",
    "security",
    "docs",
    "review",
];

impl MonitorApp {
    pub(crate) fn render_bmad_mode(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(4), // BMAD banner
                Constraint::Length(3), // Phase progress bar
                Constraint::Min(8),    // Current phase detail
            ])
            .split(area);

        // BMAD banner
        let banner = Paragraph::new(vec![
            Line::from(""),
            Line::from(vec![
                Span::styled(
                    " ◆ MODE BMAD ACTIF ",
                    Style::default()
                        .fg(colors::BMAD)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    " — Workflow guidé étape par étape avec validations humaines",
                    Style::default().fg(colors::TEXT_SECONDARY),
                ),
            ]),
        ])
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(colors::BMAD))
                .style(Style::default()),
        );
        frame.render_widget(banner, sections[0]);

        // Phase progress bar
        let segments: Vec<PhaseSegment> = if self.state.phases.is_empty() {
            BMAD_PHASES
                .iter()
                .map(|p| PhaseSegment::new(*p, "pending"))
                .collect()
        } else {
            self.state
                .phases
                .iter()
                .map(|p| PhaseSegment::new(&p.phase, &p.status))
                .collect()
        };
        phase_progress::render_phase_bar(frame, sections[1], &segments);

        // Phase detail list
        let items: Vec<ListItem> = segments
            .iter()
            .enumerate()
            .map(|(i, seg)| {
                let is_current = seg.status == "running";
                let is_done = seg.status == "completed";

                let icon = if is_done {
                    "✓"
                } else if is_current {
                    "▶"
                } else {
                    "·"
                };

                let style = if is_current {
                    Style::default()
                        .fg(colors::BMAD)
                        .add_modifier(Modifier::BOLD)
                } else if is_done {
                    Style::default().fg(colors::SUCCESS)
                } else {
                    styles::muted()
                };

                let validation = if is_done {
                    " ✓ Validé"
                } else if is_current {
                    " ⟳ En cours — validation requise"
                } else {
                    ""
                };

                ListItem::new(Line::from(vec![
                    Span::styled(format!("  {} ", icon), style),
                    Span::styled(format!("Phase {}: {}", i + 1, seg.label), style),
                    Span::styled(validation, styles::muted()),
                ]))
            })
            .collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                "Phases BMAD",
                Style::default()
                    .fg(colors::BMAD)
                    .add_modifier(Modifier::BOLD),
            ))
            .border_style(Style::default().fg(colors::BMAD));

        let list = List::new(items).block(block);
        frame.render_widget(list, sections[2]);
    }
}
