//! Page 3: Project Home — quick summary, quick actions, activity feed.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::monitor::components::{empty_state::EmptyState, info_card::InfoCard};
use crate::monitor::format::{short_id, truncate_path};
use crate::monitor::layout::terminal_layout;
use crate::monitor::theme::{colors, icons, styles};
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_project_home(&self, frame: &mut Frame, area: Rect) {
        let layout_mode = terminal_layout(area);
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Quick stats
                Constraint::Length(9), // Info cards
                Constraint::Min(8),    // Recent activity
            ])
            .split(area);

        // Quick stats bar
        self.render_home_stats_bar(frame, sections[0]);

        // Info cards row
        self.render_home_cards(frame, sections[1], layout_mode);

        // Recent sessions list
        self.render_home_activity(frame, sections[2]);
    }

    fn render_home_stats_bar(&self, frame: &mut Frame, area: Rect) {
        let (running, paused, completed) = self.session_counts();
        let total = self.state.sessions.len();

        let spans = vec![
            Span::styled(
                format!("  {} sessions", total),
                Style::default().fg(colors::TEXT_SECONDARY),
            ),
            Span::raw("   "),
            Span::styled(
                format!("● {} en cours", running),
                Style::default().fg(colors::ACCENT),
            ),
            Span::raw("   "),
            Span::styled(
                format!("● {} terminées", completed),
                Style::default().fg(colors::SUCCESS),
            ),
            Span::raw("   "),
            Span::styled(
                format!("● {} en pause", paused),
                Style::default().fg(colors::WARNING),
            ),
        ];

        let para = Paragraph::new(Line::from(spans)).block(
            Block::default()
                .borders(Borders::BOTTOM)
                .border_style(Style::default().fg(colors::BORDER)),
        );
        frame.render_widget(para, area);
    }

    fn render_home_cards(
        &self,
        frame: &mut Frame,
        area: Rect,
        layout_mode: crate::monitor::types::TerminalLayout,
    ) {
        let cards = match layout_mode {
            crate::monitor::types::TerminalLayout::Compact => Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(3),
                    Constraint::Length(3),
                    Constraint::Length(3),
                ])
                .split(area),
            _ => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(34),
                    Constraint::Percentage(33),
                    Constraint::Percentage(33),
                ])
                .split(area),
        };

        let version = env!("CARGO_PKG_VERSION");
        InfoCard::new(
            "Koklo",
            &[
                format!("Version {version}"),
                format!("{} sessions", self.state.sessions.len()),
            ],
        )
        .render(frame, cards[0]);

        InfoCard::new(
            "Projet",
            &[
                format!(
                    "Racine {}",
                    truncate_path(
                        self.state
                            .current_project_root
                            .as_deref()
                            .unwrap_or("non détecté"),
                        28
                    )
                ),
                format!("Répertoire {}", truncate_path(&self.state.current_dir, 28)),
            ],
        )
        .render(frame, cards[1]);

        InfoCard::new(
            "Actions Rapides",
            &[
                "Enter  ouvrir la session".to_string(),
                "2      voir les sessions".to_string(),
                "4      board tickets".to_string(),
            ],
        )
        .render(frame, cards[2]);
    }

    fn render_home_activity(&self, frame: &mut Frame, area: Rect) {
        if self.state.sessions.is_empty() {
            EmptyState::new("Aucune session pour le moment")
                .icon("○")
                .hint("Lancez `koklo run` pour créer une session")
                .render(frame, area);
            return;
        }

        let selected_index = self.selected_session_index();
        let items: Vec<ListItem> = self
            .state
            .sessions
            .iter()
            .take(20)
            .enumerate()
            .map(|(i, s)| {
                let icon = icons::status_icon(&s.status);
                let sid = short_id(&s.id);
                let is_selected = selected_index == Some(i);
                let style = if is_selected {
                    styles::selected()
                } else {
                    styles::status_style(&s.status)
                };

                let max_title = area.width.saturating_sub(30) as usize;
                let title = crate::monitor::format::truncate(&s.feature_title, max_title.max(10));
                ListItem::new(format!(
                    " {} {}  {}  [{}] {}",
                    icon, sid, title, s.preset, s.status
                ))
                .style(style)
            })
            .collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled("Activité Récente", styles::title(true)))
            .border_style(styles::border(true));

        let list = List::new(items).block(block);
        frame.render_widget(list, area);
    }
}
