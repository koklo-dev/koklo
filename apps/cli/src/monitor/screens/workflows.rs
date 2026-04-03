//! Page 12: Workflows — preset catalog with phase steps.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::monitor::theme::{colors, styles};
use crate::monitor::types::MonitorApp;

struct PresetInfo {
    slug: &'static str,
    name: &'static str,
    description: &'static str,
    phases: &'static [&'static str],
}

const PRESETS: &[PresetInfo] = &[
    PresetInfo {
        slug: "sdd",
        name: "SDD — Standard",
        description: "5 phases : Spec → Plan → Implement → Test → Review",
        phases: &["spec", "plan", "implement", "test", "review"],
    },
    PresetInfo {
        slug: "bmad",
        name: "BMAD — Complet",
        description: "8 phases avec analyse, sécurité et documentation",
        phases: &[
            "analysis",
            "spec",
            "plan",
            "implement",
            "test",
            "security",
            "docs",
            "review",
        ],
    },
    PresetInfo {
        slug: "speckit",
        name: "Spec Kit",
        description: "6 phases avec constitution et planning des tâches",
        phases: &[
            "spec",
            "plan",
            "constitution",
            "tasks",
            "implement",
            "review",
        ],
    },
    PresetInfo {
        slug: "light",
        name: "Light — Rapide",
        description: "3 phases : Spec → Implement → Review",
        phases: &["spec", "implement", "review"],
    },
    PresetInfo {
        slug: "bugfix",
        name: "Bugfix",
        description: "Correction de bug rapide",
        phases: &["analysis", "implement", "test"],
    },
    PresetInfo {
        slug: "release",
        name: "Release",
        description: "Préparation de release",
        phases: &["analysis", "docs", "review"],
    },
];

impl MonitorApp {
    pub(crate) fn render_workflows(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Title
                Constraint::Min(8),    // Preset list
            ])
            .split(area);

        // Title
        let title_line = Line::from(vec![
            Span::styled(
                " Workflows ",
                Style::default()
                    .fg(colors::TEXT)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                " — Choisissez un workflow pour démarrer",
                Style::default().fg(colors::TEXT_SECONDARY),
            ),
        ]);
        let title_para = Paragraph::new(title_line).block(
            Block::default()
                .borders(Borders::BOTTOM)
                .border_style(Style::default().fg(colors::BORDER)),
        );
        frame.render_widget(title_para, sections[0]);

        // Preset cards
        let items: Vec<ListItem> = PRESETS
            .iter()
            .map(|preset| {
                let phases_str: String = preset
                    .phases
                    .iter()
                    .map(|p| format!("[{}]", p))
                    .collect::<Vec<_>>()
                    .join(" → ");

                ListItem::new(vec![
                    Line::from(vec![
                        Span::styled(
                            format!(" {} ", preset.name),
                            Style::default()
                                .fg(colors::ACCENT)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(format!("({})", preset.slug), styles::muted()),
                    ]),
                    Line::from(Span::styled(
                        format!("   {}", preset.description),
                        Style::default().fg(colors::TEXT_SECONDARY),
                    )),
                    Line::from(Span::styled(format!("   {}", phases_str), styles::muted())),
                    Line::from(""),
                ])
            })
            .collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                format!("Presets Disponibles ({})", PRESETS.len()),
                styles::title(true),
            ))
            .border_style(styles::border(true));

        let list = List::new(items).block(block);
        frame.render_widget(list, sections[1]);
    }
}
