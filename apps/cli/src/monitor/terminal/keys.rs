use super::*;

pub(crate) async fn handle_key_event(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    if key.kind != KeyEventKind::Press {
        return Ok(false);
    }

    if should_handle_command_input(app, key) {
        return if matches!(key.code, KeyCode::Enter) {
            app.submit_input().await
        } else {
            Ok(false)
        };
    }

    if app.ui.mode == TuiMode::GateOverlay {
        return Ok(handle_gate_overlay_key(app, key));
    }

    handle_live_route_key(app, key).await
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
            app.set_feedback("Gate approved.", FeedbackLevel::Success);
        }
        KeyCode::Char('n') | KeyCode::Char('N') => {
            app.respond_gate(GateResponse::Reject);
            app.set_feedback("Gate rejected. Session will pause.", FeedbackLevel::Info);
        }
        _ => {}
    }
    false
}

async fn handle_live_route_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match app.ui.route {
        Route::Dashboard => handle_dashboard_key(app, key).await,
        Route::Workspace => handle_workspace_key(app, key).await,
        Route::SessionDetail => handle_session_detail_key(app, key).await,
        Route::Summary => handle_summary_key(app, key),
    }
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
        KeyCode::Esc | KeyCode::Backspace => app.go_to_dashboard(),
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
        KeyCode::Tab => app.toggle_focus(),
        KeyCode::Esc | KeyCode::Backspace => app.go_to_dashboard(),
        KeyCode::Char('s') | KeyCode::Char('S') => {
            app.execute_command(CommandAction::Summary).await?;
        }
        KeyCode::Char('r') => {
            app.tick().await?;
        }
        _ => {}
    }

    Ok(false)
}

fn handle_summary_key(app: &mut MonitorApp, key: KeyEvent) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') => Ok(true),
        KeyCode::Esc | KeyCode::Backspace => {
            app.ui.route = Route::SessionDetail;
            Ok(false)
        }
        _ => Ok(false),
    }
}
