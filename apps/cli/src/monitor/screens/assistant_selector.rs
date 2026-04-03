//! Page 5: Assistant Selector — agent cards with roles.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::monitor::theme::{colors, styles};
use crate::monitor::types::MonitorApp;

/// Built-in agent definitions for display.
struct AgentCard {
    slug: &'static str,
    emoji: &'static str,
    title: &'static str,
    description: &'static str,
}

const BUILTIN_AGENTS: &[AgentCard] = &[
    AgentCard {
        slug: "pm",
        emoji: "📋",
        title: "Product Manager",
        description: "Rédige les spécifications produit",
    },
    AgentCard {
        slug: "architect",
        emoji: "🏗",
        title: "Architecte",
        description: "Conçoit l'architecture technique",
    },
    AgentCard {
        slug: "developer",
        emoji: "💻",
        title: "Développeur",
        description: "Implémente le code",
    },
    AgentCard {
        slug: "qa",
        emoji: "🧪",
        title: "QA Engineer",
        description: "Crée les tests et vérifie la qualité",
    },
    AgentCard {
        slug: "reviewer",
        emoji: "👁",
        title: "Reviewer",
        description: "Revue de code et création PR",
    },
    AgentCard {
        slug: "analyst",
        emoji: "📊",
        title: "Analyste",
        description: "Analyse business et impact",
    },
    AgentCard {
        slug: "security",
        emoji: "🔒",
        title: "Sécurité",
        description: "Audit OWASP et vulnérabilités",
    },
    AgentCard {
        slug: "doc-writer",
        emoji: "📝",
        title: "Rédacteur",
        description: "Documentation et ADRs",
    },
];

impl MonitorApp {
    pub(crate) fn render_assistant_selector(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(3), Constraint::Min(8)])
            .split(area);

        // Title bar
        let title_line = Line::from(vec![
            Span::styled(
                " Sélectionner un assistant ",
                Style::default()
                    .fg(colors::TEXT)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                " — L'IA propose, l'utilisateur décide",
                Style::default().fg(colors::TEXT_SECONDARY),
            ),
        ]);
        let title_para = Paragraph::new(title_line).block(
            Block::default()
                .borders(Borders::BOTTOM)
                .border_style(Style::default().fg(colors::BORDER)),
        );
        frame.render_widget(title_para, sections[0]);

        // Agent cards grid (2 columns)
        let cols = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .split(sections[1]);

        let half = BUILTIN_AGENTS.len() / 2;
        self.render_agent_list(frame, cols[0], &BUILTIN_AGENTS[..half], 0);
        self.render_agent_list(frame, cols[1], &BUILTIN_AGENTS[half..], half);
    }

    fn render_agent_list(
        &self,
        frame: &mut Frame,
        area: Rect,
        agents: &[AgentCard],
        _offset: usize,
    ) {
        let items: Vec<ListItem> = agents
            .iter()
            .enumerate()
            .map(|(_i, agent)| {
                let style = Style::default().fg(colors::TEXT_SECONDARY);
                ListItem::new(vec![
                    Line::from(vec![
                        Span::styled(
                            format!(" {} {} ", agent.emoji, agent.title),
                            Style::default()
                                .fg(colors::TEXT)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(format!("({})", agent.slug), styles::muted()),
                    ]),
                    Line::from(Span::styled(format!("   {}", agent.description), style)),
                    Line::from(""),
                ])
            })
            .collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(colors::BORDER));

        let list = List::new(items).block(block);
        frame.render_widget(list, area);
    }
}
