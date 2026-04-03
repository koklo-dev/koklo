//! Navigable list with selection highlight.

use ratatui::{
    layout::Rect,
    text::Span,
    widgets::{Block, Borders, List, ListItem},
    Frame,
};

use crate::monitor::theme::styles;

pub struct ListNavItem {
    pub label: String,
    pub icon: Option<String>,
    pub secondary: Option<String>,
}

impl ListNavItem {
    pub fn new(label: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            icon: None,
            secondary: None,
        }
    }

    pub fn icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn secondary(mut self, secondary: impl Into<String>) -> Self {
        self.secondary = Some(secondary.into());
        self
    }
}

pub struct ListNav<'a> {
    pub items: &'a [ListNavItem],
    pub selected: Option<usize>,
    pub title: &'a str,
    pub focused: bool,
}

impl<'a> ListNav<'a> {
    pub fn new(title: &'a str, items: &'a [ListNavItem]) -> Self {
        Self {
            items,
            selected: None,
            title,
            focused: false,
        }
    }

    pub fn selected(mut self, index: Option<usize>) -> Self {
        self.selected = index;
        self
    }

    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let list_items: Vec<ListItem> = self
            .items
            .iter()
            .enumerate()
            .map(|(i, item)| {
                let is_selected = self.selected == Some(i);
                let style = if is_selected {
                    styles::selected()
                } else {
                    styles::unselected()
                };

                let mut text = String::new();
                text.push(' ');
                if let Some(icon) = &item.icon {
                    text.push_str(icon);
                    text.push(' ');
                }
                text.push_str(&item.label);
                if let Some(sec) = &item.secondary {
                    text.push_str("  ");
                    text.push_str(sec);
                }

                ListItem::new(text).style(style)
            })
            .collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(self.title, styles::title(self.focused)))
            .border_style(styles::border(self.focused));

        let list = List::new(list_items).block(block);
        frame.render_widget(list, area);
    }
}
