//! Collapsible tree view for file explorer.

use std::collections::HashSet;

use ratatui::{
    layout::Rect,
    text::Span,
    widgets::{Block, Borders, List, ListItem},
    Frame,
};

use crate::monitor::theme::{icons, styles};

#[derive(Debug, Clone)]
pub struct TreeNode {
    pub label: String,
    pub icon: Option<&'static str>,
    pub children: Vec<TreeNode>,
    pub path: String,
}

impl TreeNode {
    pub fn leaf(label: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            icon: None,
            children: vec![],
            path: path.into(),
        }
    }

    pub fn dir(label: impl Into<String>, path: impl Into<String>, children: Vec<TreeNode>) -> Self {
        Self {
            label: label.into(),
            icon: None,
            children,
            path: path.into(),
        }
    }

    pub fn is_dir(&self) -> bool {
        !self.children.is_empty()
    }
}

pub struct TreeViewState {
    pub expanded: HashSet<String>,
    pub selected_path: Option<String>,
    pub scroll_offset: usize,
}

impl TreeViewState {
    pub fn new() -> Self {
        Self {
            expanded: HashSet::new(),
            selected_path: None,
            scroll_offset: 0,
        }
    }

    pub fn toggle_expand(&mut self, path: &str) {
        if self.expanded.contains(path) {
            self.expanded.remove(path);
        } else {
            self.expanded.insert(path.to_string());
        }
    }
}

/// Flatten the tree into a list of visible items.
fn flatten_tree<'a>(
    nodes: &'a [TreeNode],
    expanded: &HashSet<String>,
    depth: usize,
    out: &mut Vec<(usize, &'a TreeNode)>,
) {
    for node in nodes {
        out.push((depth, node));
        if node.is_dir() && expanded.contains(&node.path) {
            flatten_tree(&node.children, expanded, depth + 1, out);
        }
    }
}

pub fn render_tree(
    frame: &mut Frame,
    area: Rect,
    title: &str,
    roots: &[TreeNode],
    state: &TreeViewState,
    focused: bool,
) {
    let mut flat: Vec<(usize, &TreeNode)> = Vec::new();
    flatten_tree(roots, &state.expanded, 0, &mut flat);

    let visible_height = area.height.saturating_sub(2) as usize;
    let start = state.scroll_offset;
    let end = (start + visible_height).min(flat.len());

    let items: Vec<ListItem> = flat[start..end]
        .iter()
        .map(|(depth, node)| {
            let indent = "  ".repeat(*depth);
            let is_selected = state
                .selected_path
                .as_deref()
                .map(|p| p == node.path)
                .unwrap_or(false);

            let expand_icon = if node.is_dir() {
                if state.expanded.contains(&node.path) {
                    icons::ICON_COLLAPSE
                } else {
                    icons::ICON_EXPAND
                }
            } else {
                " "
            };

            let icon = node.icon.unwrap_or(if node.is_dir() { "▤" } else { " " });
            let style = if is_selected {
                styles::selected()
            } else {
                styles::secondary()
            };

            ListItem::new(format!("{indent}{expand_icon} {icon} {}", node.label)).style(style)
        })
        .collect();

    let block = Block::default()
        .borders(Borders::ALL)
        .title(Span::styled(title, styles::title(focused)))
        .border_style(styles::border(focused));

    let list = List::new(items).block(block);
    frame.render_widget(list, area);
}
