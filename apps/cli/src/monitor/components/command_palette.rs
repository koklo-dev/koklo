//! Ctrl+K fuzzy command palette.

use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Frame,
};

use super::modal::centered_rect;
use crate::monitor::theme::{colors, styles};

pub struct PaletteEntry {
    pub label: String,
    pub shortcut: Option<String>,
    pub description: String,
}

impl PaletteEntry {
    pub fn new(
        label: impl Into<String>,
        shortcut: Option<String>,
        desc: impl Into<String>,
    ) -> Self {
        Self {
            label: label.into(),
            shortcut,
            description: desc.into(),
        }
    }
}

pub struct CommandPalette<'a> {
    pub query: &'a str,
    pub entries: &'a [PaletteEntry],
    pub selected: usize,
}

impl<'a> CommandPalette<'a> {
    pub fn new(query: &'a str, entries: &'a [PaletteEntry], selected: usize) -> Self {
        Self {
            query,
            entries,
            selected,
        }
    }

    pub fn render(&self, frame: &mut Frame) {
        let area = frame.size();
        let overlay = centered_rect(area, 50, 16, 40);
        frame.render_widget(Clear, overlay);

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                " Commandes ",
                Style::default()
                    .fg(colors::ACCENT)
                    .add_modifier(Modifier::BOLD),
            ))
            .border_style(Style::default().fg(colors::ACCENT));

        // Input line at top
        let inner = block.inner(overlay);
        frame.render_widget(block, overlay);

        if inner.height < 3 {
            return;
        }

        let input_area = Rect::new(inner.x, inner.y, inner.width, 1);
        let input_text = if self.query.is_empty() {
            Span::styled("Rechercher une commande…", styles::muted())
        } else {
            Span::styled(self.query, styles::body())
        };
        frame.render_widget(Paragraph::new(input_text), input_area);

        // Separator
        let sep_area = Rect::new(inner.x, inner.y + 1, inner.width, 1);
        let sep = "─".repeat(inner.width as usize);
        frame.render_widget(
            Paragraph::new(Span::styled(sep, Style::default().fg(colors::BORDER))),
            sep_area,
        );

        // Entries list
        let list_area = Rect::new(
            inner.x,
            inner.y + 2,
            inner.width,
            inner.height.saturating_sub(2),
        );

        let items: Vec<ListItem> = self
            .entries
            .iter()
            .enumerate()
            .map(|(i, entry)| {
                let is_selected = i == self.selected;
                let style = if is_selected {
                    styles::selected()
                } else {
                    styles::body()
                };

                let mut spans = vec![Span::styled(format!(" {} ", entry.label), style)];
                if let Some(shortcut) = &entry.shortcut {
                    spans.push(Span::styled(format!(" [{}]", shortcut), styles::muted()));
                }

                ListItem::new(Line::from(spans))
            })
            .collect();

        let list = List::new(items);
        frame.render_widget(list, list_area);
    }
}

/// Default command palette entries.
pub fn default_palette_entries() -> Vec<PaletteEntry> {
    vec![
        PaletteEntry::new("Accueil", Some("1".into()), "Retour à l'accueil"),
        PaletteEntry::new("Sessions", Some("2".into()), "Voir les sessions"),
        PaletteEntry::new(
            "Historique",
            Some("3".into()),
            "Historique des conversations",
        ),
        PaletteEntry::new("Tickets", Some("4".into()), "Board des tickets"),
        PaletteEntry::new("Code & Git", Some("5".into()), "État Git et diffs"),
        PaletteEntry::new("Workflows", Some("6".into()), "Catalogue des workflows"),
        PaletteEntry::new("Agents", Some("7".into()), "Sélecteur d'assistants"),
        PaletteEntry::new("Paramètres", Some("8".into()), "Configuration"),
        PaletteEntry::new("Quitter", Some("q".into()), "Fermer l'application"),
    ]
}
