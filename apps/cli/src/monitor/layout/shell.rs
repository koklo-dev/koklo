//! App shell: sidebar + main content + optional right panel.

use ratatui::layout::{Constraint, Direction, Layout, Rect};

use super::terminal_layout;
use crate::monitor::types::TerminalLayout;

/// The three zones of the app shell.
pub struct ShellLayout {
    pub sidebar: Rect,
    pub main: Rect,
    pub command_bar: Rect,
    pub status_bar: Rect,
}

/// Sidebar width constants.
const SIDEBAR_EXPANDED: u16 = 22;
const SIDEBAR_COLLAPSED: u16 = 6;

impl ShellLayout {
    /// Split the full terminal area into the shell zones.
    pub fn split(area: Rect, sidebar_collapsed: bool) -> Self {
        let layout_mode = terminal_layout(area);

        // Vertical split: main area + command bar (3 lines) + status bar (1 line)
        let vertical = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(1),
                Constraint::Length(3),
                Constraint::Length(1),
            ])
            .split(area);

        let content_area = vertical[0];
        let command_bar = vertical[1];
        let status_bar = vertical[2];

        // Horizontal split: sidebar + main
        let sidebar_width = match layout_mode {
            TerminalLayout::Compact => {
                if sidebar_collapsed {
                    0
                } else {
                    SIDEBAR_COLLAPSED
                }
            }
            _ => {
                if sidebar_collapsed {
                    SIDEBAR_COLLAPSED
                } else {
                    SIDEBAR_EXPANDED
                }
            }
        };

        let horizontal = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(sidebar_width), Constraint::Min(40)])
            .split(content_area);

        ShellLayout {
            sidebar: horizontal[0],
            main: horizontal[1],
            command_bar,
            status_bar,
        }
    }
}
