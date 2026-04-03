//! Page 7: File Explorer — tree view with file preview.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::monitor::components::empty_state::EmptyState;
use crate::monitor::format::truncate_path;
use crate::monitor::theme::{colors, styles};
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_file_explorer(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
            .split(area);

        // Tree view (left)
        self.render_file_tree(frame, sections[0]);

        // Preview (right)
        self.render_file_preview(frame, sections[1]);
    }

    fn render_file_tree(&self, frame: &mut Frame, area: Rect) {
        let project_root = self
            .state
            .current_project_root
            .as_deref()
            .unwrap_or(&self.state.current_dir);

        // Static tree representation for V1
        let lines = vec![
            Line::from(vec![
                Span::styled(" ▾ ", Style::default().fg(colors::TEXT_MUTED)),
                Span::styled(
                    truncate_path(project_root, 30),
                    Style::default()
                        .fg(colors::TEXT)
                        .add_modifier(Modifier::BOLD),
                ),
            ]),
            Line::from(Span::styled(
                "   ▸ src/",
                Style::default().fg(colors::TEXT_SECONDARY),
            )),
            Line::from(Span::styled(
                "   ▸ tests/",
                Style::default().fg(colors::TEXT_SECONDARY),
            )),
            Line::from(Span::styled(
                "     .koklo/",
                Style::default().fg(colors::TEXT_MUTED),
            )),
            Line::from(Span::styled(
                "     Cargo.toml",
                Style::default().fg(colors::TEXT_SECONDARY),
            )),
            Line::from(Span::styled(
                "     README.md",
                Style::default().fg(colors::TEXT_SECONDARY),
            )),
        ];

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled("Fichiers", styles::title(true)))
            .border_style(styles::border(true));

        let para = Paragraph::new(lines).block(block);
        frame.render_widget(para, area);
    }

    fn render_file_preview(&self, frame: &mut Frame, area: Rect) {
        EmptyState::new("Sélectionnez un fichier pour le prévisualiser")
            .icon("▤")
            .hint("Naviguez dans l'arbre à gauche avec ↑↓ et Enter")
            .render(frame, area);
    }
}
