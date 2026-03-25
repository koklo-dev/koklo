use super::*;

pub(crate) async fn tui_event_loop(
    terminal: &mut Terminal<CrosstermBackend<std::io::Stdout>>,
    app: &mut MonitorApp,
    tick_rate: Duration,
) -> Result<()> {
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|frame| app.render(frame))?;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or(Duration::ZERO);

        if event::poll(timeout)? && poll_terminal_input(app).await? {
            break;
        }

        if last_tick.elapsed() >= tick_rate {
            app.tick().await?;
            last_tick = Instant::now();
        }
    }

    Ok(())
}

async fn poll_terminal_input(app: &mut MonitorApp) -> Result<bool> {
    let Event::Key(key) = event::read()? else {
        return Ok(false);
    };

    handle_key_event(app, key).await
}
