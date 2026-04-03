//! Page 11: Tasks — Kanban board with tickets.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::monitor::components::{
    empty_state::EmptyState,
    kanban::{KanbanBoard, KanbanCard, KanbanColumn},
};
use crate::monitor::theme::colors;
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_tasks(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Header
                Constraint::Min(8),    // Board
            ])
            .split(area);

        // Header
        let header = Line::from(vec![
            Span::styled(
                " Tickets ",
                Style::default()
                    .fg(colors::TEXT)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                " — Gérez vos tâches depuis les conversations",
                Style::default().fg(colors::TEXT_SECONDARY),
            ),
        ]);
        let header_para = Paragraph::new(header).block(
            Block::default()
                .borders(Borders::BOTTOM)
                .border_style(Style::default().fg(colors::BORDER)),
        );
        frame.render_widget(header_para, sections[0]);

        // Build kanban from ticket system (stub data for now)
        // In production, this reads from TicketStore via self.storage
        let columns = vec![
            KanbanColumn {
                title: "À faire".to_string(),
                cards: vec![
                    KanbanCard::new("Implémenter l'authentification").priority("HIGH"),
                    KanbanCard::new("Ajouter les tests d'intégration").priority("MED"),
                ],
            },
            KanbanColumn {
                title: "En cours".to_string(),
                cards: vec![KanbanCard::new("Refactoring du module providers").priority("MED")],
            },
            KanbanColumn {
                title: "En revue".to_string(),
                cards: vec![],
            },
            KanbanColumn {
                title: "Terminé".to_string(),
                cards: vec![KanbanCard::new("Setup CI/CD pipeline").priority("HIGH")],
            },
        ];

        if columns.iter().all(|c| c.cards.is_empty()) {
            EmptyState::new("Aucun ticket pour le moment")
                .hint("Les tickets sont créés depuis vos conversations. Lancez-vous !")
                .render(frame, sections[1]);
        } else {
            KanbanBoard::new(&columns)
                .selected(self.ui.kanban_col, self.ui.kanban_row)
                .focused(true)
                .render(frame, sections[1]);
        }
    }
}
