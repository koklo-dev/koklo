use super::*;

use crate::monitor::components::{
    breadcrumb::Breadcrumb,
    command_palette::{self, CommandPalette},
    input_field::InputField,
    sidebar::{Sidebar, NAV_ITEMS},
    status_bar::StatusBar,
};
use crate::monitor::layout::shell::ShellLayout;

impl MonitorApp {
    pub fn render(&self, frame: &mut Frame) {
        let area = frame.size();
        let shell = ShellLayout::split(area, self.ui.sidebar_collapsed);

        // ── Sidebar ────────────────────────────────────────────────
        if shell.sidebar.width > 0 {
            let active_index = self.ui.route.sidebar_index().unwrap_or(0);

            Sidebar {
                items: NAV_ITEMS,
                active_index,
                collapsed: self.ui.sidebar_collapsed || shell.sidebar.width < 10,
                focused: self.ui.focus_zone == FocusZone::Sidebar,
            }
            .render(frame, shell.sidebar);
        }

        // ── Main content area ──────────────────────────────────────
        let main_area = shell.main;

        // Breadcrumb (1 line at top of main)
        if main_area.height > 6 {
            let crumbs = self.ui.router.breadcrumbs();
            let crumb_refs: Vec<&str> = crumbs.to_vec();
            let breadcrumb_area = Rect::new(main_area.x, main_area.y, main_area.width, 1);
            Breadcrumb::new(&crumb_refs).render(frame, breadcrumb_area);

            let content_area = Rect::new(
                main_area.x,
                main_area.y + 1,
                main_area.width,
                main_area.height.saturating_sub(1),
            );
            self.render_route(frame, content_area);
        } else {
            self.render_route(frame, main_area);
        }

        // ── Command bar ────────────────────────────────────────────
        self.render_command_bar_v2(frame, shell.command_bar);

        // ── Status bar ─────────────────────────────────────────────
        self.render_statusbar_v2(frame, shell.status_bar);

        // ── Overlays ───────────────────────────────────────────────
        match self.ui.mode {
            TuiMode::GateOverlay => self.render_action_proposal(frame),
            TuiMode::CommandPalette => self.render_command_palette(frame),
            TuiMode::Live => {
                if self.ui.pending_user_input.is_some() {
                    self.render_user_input_overlay(frame);
                }
            }
        }
    }

    fn render_route(&self, frame: &mut Frame, area: Rect) {
        match self.ui.route {
            Route::ProjectHome => self.render_project_home(frame, area),
            Route::Dashboard => self.render_dashboard(frame, area),
            Route::Workspace => self.render_workspace(frame, area),
            Route::SessionDetail => {
                // Compose the old session detail view from its parts
                let chunks = ratatui::layout::Layout::default()
                    .direction(ratatui::layout::Direction::Vertical)
                    .constraints([
                        ratatui::layout::Constraint::Length(6),
                        ratatui::layout::Constraint::Min(8),
                    ])
                    .split(area);
                self.render_session_header(frame, chunks[0]);
                let lower = ratatui::layout::Layout::default()
                    .direction(ratatui::layout::Direction::Horizontal)
                    .constraints([
                        ratatui::layout::Constraint::Percentage(30),
                        ratatui::layout::Constraint::Percentage(70),
                    ])
                    .split(chunks[1]);
                self.render_phases(frame, lower[0]);
                self.render_logs(frame, lower[1]);
            }
            Route::Summary => self.render_summary_v2(frame, area),
            Route::Conversation => self.render_conversation(frame, area),
            Route::ConversationHistory => self.render_conversation_history(frame, area),
            Route::AssistantSelector => self.render_assistant_selector(frame, area),
            Route::ExecutionProgress => self.render_execution_progress(frame, area),
            Route::StructuredResults => self.render_structured_results(frame, area),
            Route::Tasks => self.render_tasks(frame, area),
            Route::Workflows => self.render_workflows(frame, area),
            Route::Settings => self.render_settings(frame, area),
            Route::CodeGit => self.render_code_git(frame, area),
            Route::BmadMode => self.render_bmad_mode(frame, area),
            Route::FileExplorer => self.render_file_explorer(frame, area),
        }
    }

    fn render_command_bar_v2(&self, frame: &mut Frame, area: Rect) {
        let placeholder = match self.ui.route {
            Route::ProjectHome => "Tapez /help, ou choisissez un écran dans la sidebar",
            Route::Dashboard => "Tapez /help, /workspace ou Enter sur une session",
            Route::SessionDetail | Route::Conversation => {
                "Tapez /help, /summary ou Esc pour revenir"
            }
            Route::Tasks => "Tapez /help pour les commandes disponibles",
            _ => "Tapez /help ou naviguez avec la sidebar",
        };

        let title = if self.ui.mode == TuiMode::GateOverlay {
            "COMMANDE — approbation en attente"
        } else if self.ui.pending_user_input.is_some() {
            "RÉPONDRE"
        } else {
            "COMMANDE"
        };

        InputField::new(title)
            .value(&self.ui.command_input)
            .placeholder(placeholder)
            .focused(true)
            .render(frame, area);
    }

    fn render_statusbar_v2(&self, frame: &mut Frame, area: Rect) {
        let badge = if self.ui.mode == TuiMode::GateOverlay {
            "APPROBATION EN ATTENTE"
        } else if self.ui.pending_user_input.is_some() {
            "ENTRÉE REQUISE"
        } else {
            self.ui.route.badge()
        };

        let nav_hints = match self.ui.route {
            Route::ProjectHome | Route::Dashboard => {
                "[q] quitter  [↑↓] sélection  [Enter] ouvrir  [Tab] focus  [Ctrl+K] commandes"
            }
            Route::SessionDetail | Route::Conversation | Route::ExecutionProgress => {
                "[q] quitter  [↑↓] scroll  [Tab] focus  [Esc] retour  [Ctrl+K] commandes"
            }
            Route::Tasks => "[q] quitter  [←→] colonnes  [↑↓] tickets  [Esc] retour",
            _ => "[q] quitter  [↑↓] naviguer  [Esc] retour  [Ctrl+K] commandes",
        };

        let cost_text = if self.ui.has_subscription_cost {
            format!("Tokens: {} | abonnement", self.ui.running_tokens)
        } else if let Some(cost) = self.ui.running_cost {
            format!("Tokens: {} | ${:.4}", self.ui.running_tokens, cost)
        } else if self.ui.running_tokens > 0 {
            format!("Tokens: {}", self.ui.running_tokens)
        } else {
            String::new()
        };

        // Check for active toast/feedback
        if let Some(feedback) = &self.ui.command_feedback {
            if feedback.expires_at > Instant::now() {
                let toast = crate::monitor::components::toast::Toast {
                    message: feedback.text.clone(),
                    level: match feedback.level {
                        FeedbackLevel::Info => crate::monitor::theme::styles::FeedbackLvl::Info,
                        FeedbackLevel::Success => {
                            crate::monitor::theme::styles::FeedbackLvl::Success
                        }
                        FeedbackLevel::Error => crate::monitor::theme::styles::FeedbackLvl::Error,
                    },
                    expires_at: feedback.expires_at,
                };
                let mut sb = StatusBar::new(badge, nav_hints);
                if !cost_text.is_empty() {
                    sb = sb.cost(&cost_text);
                }
                sb = sb.toast(&toast);
                sb.render(frame, area);
                return;
            }
        }

        let mut sb = StatusBar::new(badge, nav_hints);
        if !cost_text.is_empty() {
            sb = sb.cost(&cost_text);
        }
        sb.render(frame, area);
    }

    fn render_command_palette(&self, frame: &mut Frame) {
        let entries = command_palette::default_palette_entries();
        // Filter by query
        let filtered: Vec<_> = if self.ui.palette_query.is_empty() {
            entries.iter().collect()
        } else {
            let q = self.ui.palette_query.to_lowercase();
            entries
                .iter()
                .filter(|e| e.label.to_lowercase().contains(&q))
                .collect()
        };

        // Build a temporary vec for display
        let display_entries: Vec<command_palette::PaletteEntry> = filtered
            .iter()
            .map(|e| {
                command_palette::PaletteEntry::new(&e.label, e.shortcut.clone(), &e.description)
            })
            .collect();

        CommandPalette::new(
            &self.ui.palette_query,
            &display_entries,
            self.ui.palette_selected,
        )
        .render(frame);
    }
}
