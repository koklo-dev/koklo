use super::*;

/// Run the integrated TUI for `koklo run` with a live event bus and gate channel.
pub async fn run_integrated_tui(
    storage: Arc<SessionManager>,
    event_rx: Option<broadcast::Receiver<PipelineEvent>>,
    gate_channel: Option<GateChannel>,
    user_input_channel: Option<UserInputChannel>,
    preset_phases: Vec<String>,
) -> Result<()> {
    let app = MonitorApp::new_integrated(
        storage,
        event_rx,
        gate_channel,
        user_input_channel,
        None,
        None,
        preset_phases,
    )
    .await?;
    run_terminal_session(app, Duration::from_millis(50)).await
}

pub(crate) async fn run_follow_mode(
    session_filter: Option<String>,
    project_filter: Option<String>,
    storage: Arc<SessionManager>,
) -> Result<()> {
    let sessions = MonitorApp::load_sessions(&storage, project_filter.as_deref()).await?;
    let session = if let Some(ref filter) = session_filter {
        sessions
            .iter()
            .find(|session| session.id.starts_with(filter.as_str()))
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", filter))?
            .clone()
    } else {
        sessions
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No sessions found"))?
    };

    println!(
        "Following session: {} ({})",
        session.id, session.feature_title
    );

    let mut last_seq: i64 = 0;
    let mut render_engine = PlainRenderEngine::new(true);
    let tick = Duration::from_millis(500);

    loop {
        tokio::time::sleep(tick).await;

        let items = storage
            .get_transcript_items_since(&session.id, last_seq)
            .await?;
        let rendered = render_engine.push_records(items.clone());
        if !rendered.is_empty() {
            print!("{rendered}");
            let _ = std::io::stdout().flush();
        }
        if let Some(last) = items.last() {
            last_seq = last.seq;
        }

        if let Some(session) = storage.get_session(&session.id).await? {
            if session.status == "completed" || session.status == "failed" {
                println!("\nSession {} — {}", short_id(&session.id), session.status);
                break;
            }
        }
    }

    Ok(())
}

pub(crate) async fn run_tui_mode(
    session_filter: Option<String>,
    project_filter: Option<String>,
    storage: Arc<SessionManager>,
) -> Result<()> {
    let app = MonitorApp::new(session_filter.as_deref(), project_filter, storage).await?;
    run_terminal_session(app, Duration::from_millis(500)).await
}

pub(crate) async fn run_terminal_session(app: MonitorApp, tick_rate: Duration) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = std::io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    let mut app = app;
    let result = tui_event_loop(&mut terminal, &mut app, tick_rate).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}
