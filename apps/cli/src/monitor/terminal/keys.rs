use super::*;

pub(crate) async fn handle_key_event(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    if key.kind != KeyEventKind::Press {
        return Ok(false);
    }

    // ── Command palette mode ───────────────────────────────────
    if app.ui.mode == TuiMode::CommandPalette {
        return Ok(handle_command_palette_key(app, key));
    }

    // ── Command input handling ─────────────────────────────────
    if should_handle_command_input(app, key) {
        return if matches!(key.code, KeyCode::Enter) {
            app.submit_input().await
        } else {
            Ok(false)
        };
    }

    // ── Gate overlay mode ──────────────────────────────────────
    if app.ui.mode == TuiMode::GateOverlay {
        return Ok(handle_gate_overlay_key(app, key));
    }

    // ── Global shortcuts (Ctrl+K, Tab, number keys) ────────────
    if let Some(quit) = handle_global_key(app, key).await? {
        return Ok(quit);
    }

    // ── Route-specific keys ────────────────────────────────────
    handle_route_key(app, key).await
}

fn should_handle_command_input(app: &mut MonitorApp, key: KeyEvent) -> bool {
    matches!(
        key.code,
        KeyCode::Enter | KeyCode::Backspace | KeyCode::Char(_)
    ) && app.handle_input_key(key)
}

fn handle_gate_overlay_key(app: &mut MonitorApp, key: KeyEvent) -> bool {
    match key.code {
        KeyCode::Char('y') | KeyCode::Char('Y') => {
            app.respond_gate(GateResponse::Approve);
            app.set_feedback("Action autorisée.", FeedbackLevel::Success);
        }
        KeyCode::Char('n') | KeyCode::Char('N') => {
            app.respond_gate(GateResponse::Reject);
            app.set_feedback("Action refusée. Session en pause.", FeedbackLevel::Info);
        }
        _ => {}
    }
    false
}

fn handle_command_palette_key(app: &mut MonitorApp, key: KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc => {
            app.ui.mode = TuiMode::Live;
            app.ui.palette_query.clear();
            app.ui.palette_selected = 0;
        }
        KeyCode::Up => {
            app.ui.palette_selected = app.ui.palette_selected.saturating_sub(1);
        }
        KeyCode::Down => {
            app.ui.palette_selected += 1;
        }
        KeyCode::Enter => {
            // Execute selected palette command
            let entries = crate::monitor::components::command_palette::default_palette_entries();
            let q = app.ui.palette_query.to_lowercase();
            let filtered: Vec<_> = if q.is_empty() {
                entries.iter().collect()
            } else {
                entries
                    .iter()
                    .filter(|e| e.label.to_lowercase().contains(&q))
                    .collect()
            };

            if let Some(entry) = filtered.get(app.ui.palette_selected) {
                navigate_by_label(app, &entry.label);
            }

            app.ui.mode = TuiMode::Live;
            app.ui.palette_query.clear();
            app.ui.palette_selected = 0;
        }
        KeyCode::Backspace => {
            app.ui.palette_query.pop();
            app.ui.palette_selected = 0;
        }
        KeyCode::Char(c) => {
            app.ui.palette_query.push(c);
            app.ui.palette_selected = 0;
        }
        _ => {}
    }
    false
}

fn navigate_by_label(app: &mut MonitorApp, label: &str) {
    let route = match label {
        "Accueil" => Route::ProjectHome,
        "Sessions" => Route::Dashboard,
        "Historique" => Route::ConversationHistory,
        "Tickets" => Route::Tasks,
        "Code & Git" => Route::CodeGit,
        "Workflows" => Route::Workflows,
        "Agents" => Route::AssistantSelector,
        "Paramètres" => Route::Settings,
        "Quitter" => return, // handled separately
        _ => return,
    };
    app.ui.router.navigate(route.clone());
    app.ui.route = route;
    app.ui.focus_zone = FocusZone::Main;
}

async fn handle_global_key(app: &mut MonitorApp, key: KeyEvent) -> Result<Option<bool>> {
    // Ctrl+K → command palette
    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('k') {
        app.ui.mode = TuiMode::CommandPalette;
        app.ui.palette_query.clear();
        app.ui.palette_selected = 0;
        return Ok(Some(false));
    }

    // Tab → cycle focus zones
    if key.code == KeyCode::Tab && !key.modifiers.contains(KeyModifiers::SHIFT) {
        // Only cycle zones in screens that have multi-zone layout
        match app.ui.route {
            Route::SessionDetail | Route::Conversation | Route::ExecutionProgress => {
                app.toggle_focus();
            }
            _ => {
                app.ui.focus_zone = match app.ui.focus_zone {
                    FocusZone::Sidebar => FocusZone::Main,
                    FocusZone::Main => FocusZone::Sidebar,
                    FocusZone::RightPanel => FocusZone::Sidebar,
                };
            }
        }
        return Ok(Some(false));
    }

    // Number keys 1-8 → sidebar navigation (only when in sidebar focus or global)
    if app.ui.focus_zone == FocusZone::Sidebar || !app.ui.command_input.is_empty() {
        return Ok(None);
    }

    match key.code {
        KeyCode::Char('1') => {
            navigate_to(app, Route::ProjectHome);
            return Ok(Some(false));
        }
        KeyCode::Char('2') => {
            navigate_to(app, Route::Dashboard);
            return Ok(Some(false));
        }
        KeyCode::Char('3') => {
            navigate_to(app, Route::ConversationHistory);
            return Ok(Some(false));
        }
        KeyCode::Char('4') => {
            navigate_to(app, Route::Tasks);
            return Ok(Some(false));
        }
        KeyCode::Char('5') => {
            navigate_to(app, Route::CodeGit);
            return Ok(Some(false));
        }
        KeyCode::Char('6') => {
            navigate_to(app, Route::Workflows);
            return Ok(Some(false));
        }
        KeyCode::Char('7') => {
            navigate_to(app, Route::AssistantSelector);
            return Ok(Some(false));
        }
        KeyCode::Char('8') => {
            navigate_to(app, Route::Settings);
            return Ok(Some(false));
        }
        _ => {}
    }

    Ok(None) // not a global key
}

fn navigate_to(app: &mut MonitorApp, route: Route) {
    app.ui.router.navigate(route.clone());
    app.ui.route = route;
    app.ui.focus_zone = FocusZone::Main;
}

async fn handle_route_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match app.ui.route {
        Route::ProjectHome => handle_project_home_key(app, key).await,
        Route::Dashboard => handle_dashboard_key(app, key).await,
        Route::Workspace => handle_workspace_key(app, key).await,
        Route::SessionDetail | Route::Conversation | Route::ExecutionProgress => {
            handle_session_detail_key(app, key).await
        }
        Route::Summary => handle_summary_key(app, key),
        Route::ConversationHistory => handle_history_key(app, key).await,
        Route::Tasks => handle_tasks_key(app, key),
        Route::Settings => handle_settings_key(app, key),
        _ => handle_generic_screen_key(app, key),
    }
}

async fn handle_project_home_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Up => app.handle_up(),
        KeyCode::Down => app.handle_down(),
        KeyCode::Enter => app.open_selected_session().await?,
        KeyCode::Char('r') => {
            app.tick().await?;
        }
        _ => {}
    }
    Ok(false)
}

async fn handle_dashboard_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Up => app.handle_up(),
        KeyCode::Down => app.handle_down(),
        KeyCode::Enter => app.open_selected_session().await?,
        KeyCode::Char('w') | KeyCode::Char('W') => app.go_to_workspace(),
        KeyCode::Char('s') | KeyCode::Char('S') => {
            app.execute_command(CommandAction::Summary).await?;
        }
        KeyCode::Char('r') => {
            app.tick().await?;
        }
        KeyCode::Esc => {
            navigate_to(app, Route::ProjectHome);
        }
        _ => {}
    }
    Ok(false)
}

async fn handle_workspace_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Up => app.handle_up(),
        KeyCode::Down => app.handle_down(),
        KeyCode::Enter => app.open_selected_session().await?,
        KeyCode::Esc | KeyCode::Backspace => {
            if !app.ui.router.pop() {
                navigate_to(app, Route::ProjectHome);
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
        }
        KeyCode::Char('r') => {
            app.tick().await?;
        }
        _ => {}
    }
    Ok(false)
}

async fn handle_session_detail_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Up => app.handle_up(),
        KeyCode::Down => app.handle_down(),
        KeyCode::PageUp => app.handle_page_up(),
        KeyCode::PageDown => app.handle_page_down(),
        KeyCode::Home => app.handle_home(),
        KeyCode::End => app.handle_end(),
        KeyCode::Char('s') | KeyCode::Char('S') => {
            app.execute_command(CommandAction::Summary).await?;
        }
        KeyCode::Char('r') => {
            app.tick().await?;
        }
        KeyCode::Esc | KeyCode::Backspace => {
            if !app.ui.router.pop() {
                navigate_to(app, Route::ProjectHome);
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
            app.ui.focus = Panel::Sessions;
            app.state.selected_phase = None;
            app.state.log_scroll = 0;
        }
        _ => {}
    }
    Ok(false)
}

fn handle_summary_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => Ok(true),
        KeyCode::Esc | KeyCode::Backspace => {
            if !app.ui.router.pop() {
                app.ui.route = Route::SessionDetail;
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
            Ok(false)
        }
        _ => Ok(false),
    }
}

async fn handle_history_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Up => app.handle_up(),
        KeyCode::Down => app.handle_down(),
        KeyCode::Enter => app.open_selected_session().await?,
        KeyCode::Esc => {
            if !app.ui.router.pop() {
                navigate_to(app, Route::ProjectHome);
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
        }
        KeyCode::Left => {
            app.ui.active_tab = app.ui.active_tab.saturating_sub(1);
        }
        KeyCode::Right => {
            app.ui.active_tab = (app.ui.active_tab + 1).min(3);
        }
        _ => {}
    }
    Ok(false)
}

fn handle_tasks_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Left => {
            app.ui.kanban_col = app.ui.kanban_col.saturating_sub(1);
            app.ui.kanban_row = 0;
        }
        KeyCode::Right => {
            app.ui.kanban_col = (app.ui.kanban_col + 1).min(3);
            app.ui.kanban_row = 0;
        }
        KeyCode::Up => {
            app.ui.kanban_row = app.ui.kanban_row.saturating_sub(1);
        }
        KeyCode::Down => {
            app.ui.kanban_row += 1;
        }
        KeyCode::Esc => {
            if !app.ui.router.pop() {
                navigate_to(app, Route::ProjectHome);
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
        }
        _ => {}
    }
    Ok(false)
}

fn handle_settings_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Left => {
            app.ui.active_tab = app.ui.active_tab.saturating_sub(1);
        }
        KeyCode::Right => {
            app.ui.active_tab = (app.ui.active_tab + 1).min(3);
        }
        KeyCode::Esc => {
            if !app.ui.router.pop() {
                navigate_to(app, Route::ProjectHome);
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
        }
        _ => {}
    }
    Ok(false)
}

fn handle_generic_screen_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(true),
        KeyCode::Up => app.handle_up(),
        KeyCode::Down => app.handle_down(),
        KeyCode::Esc | KeyCode::Backspace => {
            if !app.ui.router.pop() {
                navigate_to(app, Route::ProjectHome);
            } else {
                app.ui.route = app.ui.router.current().clone();
            }
        }
        _ => {}
    }
    Ok(false)
}
