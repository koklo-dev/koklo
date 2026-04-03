//! Page 13: Settings — configuration display.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    Frame,
};

use crate::monitor::components::{
    data_table::{DataTable, DataTableColumn},
    tabs::TabBar,
};
use crate::monitor::format::truncate_path;
use crate::monitor::types::MonitorApp;

const SETTINGS_TABS: &[&str] = &["Général", "Agents", "Providers", "À propos"];

impl MonitorApp {
    pub(crate) fn render_settings(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1), // Tabs
                Constraint::Min(8),    // Content
            ])
            .split(area);

        TabBar::new(SETTINGS_TABS, self.ui.active_tab).render(frame, sections[0]);

        match self.ui.active_tab {
            0 => self.render_settings_general(frame, sections[1]),
            3 => self.render_settings_about(frame, sections[1]),
            _ => self.render_settings_general(frame, sections[1]),
        }
    }

    fn render_settings_general(&self, frame: &mut Frame, area: Rect) {
        let columns = vec![
            DataTableColumn::new("Paramètre", Constraint::Length(24)),
            DataTableColumn::new("Valeur", Constraint::Min(30)),
        ];

        let rows = vec![
            vec!["Version".to_string(), env!("CARGO_PKG_VERSION").to_string()],
            vec![
                "Répertoire projet".to_string(),
                truncate_path(
                    self.state
                        .current_project_root
                        .as_deref()
                        .unwrap_or("non détecté"),
                    40,
                ),
            ],
            vec![
                "Répertoire courant".to_string(),
                truncate_path(&self.state.current_dir, 40),
            ],
            vec![
                "Filtre sessions".to_string(),
                self.state
                    .project_filter
                    .as_deref()
                    .unwrap_or("toutes")
                    .to_string(),
            ],
            vec![
                "Sessions suivies".to_string(),
                self.state.sessions.len().to_string(),
            ],
            vec!["Tick rate".to_string(), "500ms".to_string()],
            vec![
                "Données locales".to_string(),
                "Vos données restent sur votre ordinateur.".to_string(),
            ],
        ];

        DataTable::new("Configuration", &columns, rows)
            .focused(true)
            .render(frame, area);
    }

    fn render_settings_about(&self, frame: &mut Frame, area: Rect) {
        let columns = vec![
            DataTableColumn::new("", Constraint::Length(20)),
            DataTableColumn::new("", Constraint::Min(30)),
        ];

        let rows = vec![
            vec!["Application".to_string(), "Koklo".to_string()],
            vec!["Version".to_string(), env!("CARGO_PKG_VERSION").to_string()],
            vec!["Licence".to_string(), "AGPLv3".to_string()],
            vec![
                "Documentation".to_string(),
                "https://koklo.dev/docs".to_string(),
            ],
        ];

        DataTable::new("À propos de Koklo", &columns, rows)
            .focused(true)
            .render(frame, area);
    }
}
