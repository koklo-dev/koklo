//! Page 6: Conversation History — search, filter, list past sessions.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    Frame,
};

use crate::monitor::components::{
    data_table::{DataTable, DataTableColumn},
    empty_state::EmptyState,
    search_input::SearchInput,
    tabs::TabBar,
};
use crate::monitor::format::short_id;
use crate::monitor::types::MonitorApp;

const TABS: &[&str] = &["Tous", "En cours", "Terminés", "Échoués"];

impl MonitorApp {
    pub(crate) fn render_conversation_history(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Search
                Constraint::Length(1), // Tabs
                Constraint::Min(8),    // Table
            ])
            .split(area);

        // Search bar
        SearchInput::new()
            .query(&self.ui.search_query)
            .placeholder("Rechercher une session…")
            .result_count(self.state.sessions.len())
            .focused(true)
            .render(frame, sections[0]);

        // Tab bar
        TabBar::new(TABS, self.ui.active_tab).render(frame, sections[1]);

        // Session table
        let filter = match self.ui.active_tab {
            1 => Some("running"),
            2 => Some("completed"),
            3 => Some("failed"),
            _ => None,
        };

        let filtered: Vec<&koklo_storage::Session> = self
            .state
            .sessions
            .iter()
            .filter(|s| {
                if let Some(f) = filter {
                    s.status == f
                } else {
                    true
                }
            })
            .filter(|s| {
                if self.ui.search_query.is_empty() {
                    true
                } else {
                    let q = self.ui.search_query.to_lowercase();
                    s.feature_title.to_lowercase().contains(&q)
                        || s.id.contains(&q)
                        || s.preset.to_lowercase().contains(&q)
                }
            })
            .collect();

        if filtered.is_empty() {
            EmptyState::new("Aucune session trouvée")
                .hint("Modifiez votre recherche ou vos filtres")
                .render(frame, sections[2]);
            return;
        }

        let columns = vec![
            DataTableColumn::new("ID", Constraint::Length(8)),
            DataTableColumn::new("Feature", Constraint::Min(20)),
            DataTableColumn::new("Preset", Constraint::Length(10)),
            DataTableColumn::new("Statut", Constraint::Length(12)),
            DataTableColumn::new("Mis à jour", Constraint::Length(20)),
        ];

        let rows: Vec<Vec<String>> = filtered
            .iter()
            .map(|s| {
                vec![
                    short_id(&s.id),
                    s.feature_title.clone(),
                    s.preset.clone(),
                    s.status.clone(),
                    s.updated_at.clone(),
                ]
            })
            .collect();

        let selected = self.selected_session_index();
        DataTable::new("Sessions", &columns, rows)
            .selected(selected)
            .focused(true)
            .render(frame, sections[2]);
    }
}
