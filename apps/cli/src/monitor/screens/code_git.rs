//! Page 17: Code & Git — branch status, file changes, diff view.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem},
    Frame,
};

use crate::monitor::components::{card, empty_state::EmptyState};
use crate::monitor::format::{session_branch_label, short_id, truncate_path};
use crate::monitor::theme::{
    colors, icons,
    styles,
};
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_code_git(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(7), // Branch info card
                Constraint::Min(8),    // Changes list
            ])
            .split(area);

        // Branch info card
        self.render_git_branch_info(frame, sections[0]);

        // Changes / history
        self.render_git_changes(frame, sections[1]);
    }

    fn render_git_branch_info(&self, frame: &mut Frame, area: Rect) {
        let (branch, status, workspace) = if let Some(session) = self.selected_session() {
            (
                session_branch_label(session),
                session.status.clone(),
                truncate_path(&session.workspace_path, 40),
            )
        } else {
            (
                "main".to_string(),
                "—".to_string(),
                truncate_path(&self.state.current_dir, 40),
            )
        };

        let lines = vec![
            format!("Branche active: {}", branch),
            format!("État: {}", status),
            format!("Workspace: {}", workspace),
            String::new(),
            "Les changements sont suivis automatiquement.".to_string(),
        ];

        card::render_card(frame, area, "Code & Git", &lines, true);
    }

    fn render_git_changes(&self, frame: &mut Frame, area: Rect) {
        // Show sessions with their workspace branches
        if self.state.sessions.is_empty() {
            EmptyState::new("Aucun changement en cours")
                .hint("Les modifications apparaîtront lors de l'exécution d'un workflow")
                .render(frame, area);
            return;
        }

        let items: Vec<ListItem> = self
            .state
            .sessions
            .iter()
            .filter(|s| s.status == "running" || s.status == "completed")
            .take(15)
            .map(|s| {
                let branch = session_branch_label(s);
                let icon = icons::status_icon(&s.status);
                let style = styles::status_style(&s.status);

                ListItem::new(vec![
                    Line::from(vec![
                        Span::styled(format!(" {} ", icon), style),
                        Span::styled(
                            short_id(&s.id),
                            Style::default()
                                .fg(colors::TEXT)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(
                            format!("  {}", s.feature_title),
                            Style::default().fg(colors::TEXT_SECONDARY),
                        ),
                    ]),
                    Line::from(Span::styled(
                        format!("     ⎇ {}  ·  {}", branch, s.status),
                        styles::muted(),
                    )),
                ])
            })
            .collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled("Sessions & Branches", styles::title(true)))
            .border_style(styles::border(true));

        let list = List::new(items).block(block);
        frame.render_widget(list, area);
    }
}
