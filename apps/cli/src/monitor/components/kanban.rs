//! Multi-column kanban board for tickets.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    text::Span,
    widgets::{Block, Borders, List, ListItem},
    Frame,
};

use crate::monitor::theme::styles;

pub struct KanbanCard {
    pub title: String,
    pub subtitle: Option<String>,
    pub priority: Option<String>,
}

impl KanbanCard {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            subtitle: None,
            priority: None,
        }
    }

    pub fn subtitle(mut self, sub: impl Into<String>) -> Self {
        self.subtitle = Some(sub.into());
        self
    }

    pub fn priority(mut self, p: impl Into<String>) -> Self {
        self.priority = Some(p.into());
        self
    }
}

pub struct KanbanColumn {
    pub title: String,
    pub cards: Vec<KanbanCard>,
}

pub struct KanbanBoard<'a> {
    pub columns: &'a [KanbanColumn],
    pub selected_column: usize,
    pub selected_card: usize,
    pub focused: bool,
}

impl<'a> KanbanBoard<'a> {
    pub fn new(columns: &'a [KanbanColumn]) -> Self {
        Self {
            columns,
            selected_column: 0,
            selected_card: 0,
            focused: false,
        }
    }

    pub fn selected(mut self, col: usize, card: usize) -> Self {
        self.selected_column = col;
        self.selected_card = card;
        self
    }

    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        if self.columns.is_empty() {
            return;
        }

        let constraints: Vec<Constraint> = self
            .columns
            .iter()
            .map(|_| Constraint::Ratio(1, self.columns.len() as u32))
            .collect();

        let col_areas = Layout::default()
            .direction(Direction::Horizontal)
            .constraints(constraints)
            .split(area);

        for (ci, (col, col_area)) in self.columns.iter().zip(col_areas.iter()).enumerate() {
            let is_active_col = ci == self.selected_column && self.focused;
            let col_border = if is_active_col {
                styles::border(true)
            } else {
                styles::border(false)
            };

            let count = col.cards.len();
            let title = format!("{} ({})", col.title, count);

            let items: Vec<ListItem> = col
                .cards
                .iter()
                .enumerate()
                .map(|(ri, card)| {
                    let is_selected = is_active_col && ri == self.selected_card;
                    let style = if is_selected {
                        styles::selected()
                    } else {
                        styles::secondary()
                    };

                    let mut text = format!(" {}", card.title);
                    if let Some(p) = &card.priority {
                        text = format!(" [{}] {}", p, card.title);
                    }

                    ListItem::new(text).style(style)
                })
                .collect();

            let block = Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(title, styles::title(is_active_col)))
                .border_style(col_border);

            let list = List::new(items).block(block);
            frame.render_widget(list, *col_area);
        }
    }
}
