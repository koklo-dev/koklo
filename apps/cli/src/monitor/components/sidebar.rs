//! Vertical navigation sidebar with icons and key hints.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::monitor::theme::{colors, styles};

pub struct SidebarItem {
    pub icon: &'static str,
    pub label: &'static str,
    pub key_hint: char,
}

pub struct Sidebar<'a> {
    pub items: &'a [SidebarItem],
    pub active_index: usize,
    pub collapsed: bool,
    pub focused: bool,
}

impl<'a> Sidebar<'a> {
    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let block = Block::default()
            .borders(Borders::RIGHT)
            .border_style(Style::default().fg(colors::BORDER))
            .style(styles::sidebar_bg());

        if self.collapsed {
            self.render_collapsed(frame, area, block);
        } else {
            self.render_expanded(frame, area, block);
        }
    }

    fn render_collapsed(&self, frame: &mut Frame, area: Rect, block: Block) {
        let items: Vec<ListItem> = self
            .items
            .iter()
            .enumerate()
            .map(|(i, item)| {
                let style = styles::sidebar_item(i == self.active_index);
                ListItem::new(format!(" {} ", item.icon)).style(style)
            })
            .collect();

        let list = List::new(items).block(block);
        frame.render_widget(list, area);
    }

    fn render_expanded(&self, frame: &mut Frame, area: Rect, block: Block) {
        // Logo header (2 lines)
        let mut lines: Vec<Line> = vec![
            Line::from(Span::styled(
                " KOKLO",
                Style::default()
                    .fg(colors::ACCENT)
                    .add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
        ];

        // Navigation items
        for (i, item) in self.items.iter().enumerate() {
            let is_active = i == self.active_index;
            let style = styles::sidebar_item(is_active);
            let marker = if is_active { "▎" } else { " " };
            let key_style = Style::default()
                .fg(colors::TEXT_MUTED)
                .add_modifier(Modifier::DIM);

            lines.push(Line::from(vec![
                Span::styled(marker, Style::default().fg(colors::ACCENT)),
                Span::styled(format!(" {} ", item.icon), style),
                Span::styled(item.label, style),
                Span::raw("  "),
                Span::styled(format!("{}", item.key_hint), key_style),
            ]));
        }

        let para = Paragraph::new(lines).block(block);
        frame.render_widget(para, area);
    }
}

/// Default sidebar navigation items.
pub const NAV_ITEMS: &[SidebarItem] = &[
    SidebarItem {
        icon: "⌂",
        label: "Accueil",
        key_hint: '1',
    },
    SidebarItem {
        icon: "◆",
        label: "Sessions",
        key_hint: '2',
    },
    SidebarItem {
        icon: "☰",
        label: "Historique",
        key_hint: '3',
    },
    SidebarItem {
        icon: "▣",
        label: "Tickets",
        key_hint: '4',
    },
    SidebarItem {
        icon: "⎇",
        label: "Code & Git",
        key_hint: '5',
    },
    SidebarItem {
        icon: "◈",
        label: "Workflows",
        key_hint: '6',
    },
    SidebarItem {
        icon: "◉",
        label: "Agents",
        key_hint: '7',
    },
    SidebarItem {
        icon: "⚙",
        label: "Paramètres",
        key_hint: '8',
    },
];
