use super::*;

impl MonitorApp {
    pub(crate) fn render_live_overview(
        &self,
        frame: &mut Frame,
        area: Rect,
        live_model: &TranscriptLiveModel,
        cards: &[LiveOverviewCardKind],
    ) {
        let constraints = vec![Constraint::Ratio(1, cards.len() as u32); cards.len()];
        let columns = Layout::default()
            .direction(Direction::Horizontal)
            .constraints(constraints)
            .split(area);

        let pending_count = live_model.pending.len();
        for (card, card_area) in cards.iter().copied().zip(columns.iter()) {
            let (title, block, title_style) = match card {
                LiveOverviewCardKind::Waiting => (
                    "WAITING",
                    live_model.pending.last(),
                    Style::default().fg(Color::Magenta),
                ),
                LiveOverviewCardKind::Assistant => (
                    "ASSISTANT",
                    live_model.latest_assistant.as_ref(),
                    Style::default().fg(Color::White),
                ),
                LiveOverviewCardKind::Thinking => (
                    "THINKING",
                    live_model.latest_thinking.as_ref(),
                    Style::default().fg(Color::Cyan),
                ),
                LiveOverviewCardKind::Activity => (
                    "ACTIVITY",
                    live_model.latest_activity.as_ref(),
                    Style::default().fg(Color::Yellow),
                ),
            };

            if card == LiveOverviewCardKind::Activity {
                self.render_live_activity_card(
                    frame,
                    *card_area,
                    live_card_title(title, pending_count, block),
                    &live_model.recent_activity,
                    title_style,
                );
            } else {
                self.render_live_card(
                    frame,
                    *card_area,
                    live_card_title(title, pending_count, block),
                    block,
                    title_style,
                );
            }
        }
    }

    fn render_live_card(
        &self,
        frame: &mut Frame,
        area: Rect,
        title: String,
        block: Option<&RenderBlock>,
        title_style: Style,
    ) {
        let max_lines = area.height.saturating_sub(2) as usize;
        let lines = block
            .map(|block| card_lines(block, max_lines))
            .filter(|lines| !lines.is_empty())
            .unwrap_or_else(|| {
                vec![Line::from(Span::styled(
                    "No activity yet",
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::DIM),
                ))]
            });

        let border_style = block
            .map(|block| tone_style(block.tone))
            .unwrap_or_default();
        let para = Paragraph::new(Text::from(inset_lines(lines, 1)))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(border_style)
                    .title(Span::styled(
                        title,
                        title_style.add_modifier(Modifier::BOLD),
                    )),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }

    fn render_live_activity_card(
        &self,
        frame: &mut Frame,
        area: Rect,
        title: String,
        blocks: &[RenderBlock],
        title_style: Style,
    ) {
        let max_lines = area.height.saturating_sub(2) as usize;
        let lines = if blocks.is_empty() {
            vec![Line::from(Span::styled(
                "No activity yet",
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::DIM),
            ))]
        } else {
            activity_card_lines(blocks, max_lines)
        };

        let border_style = blocks
            .last()
            .map(|block| tone_style(block.tone))
            .unwrap_or_default();
        let para = Paragraph::new(Text::from(inset_lines(lines, 1)))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(border_style)
                    .title(Span::styled(
                        title,
                        title_style.add_modifier(Modifier::BOLD),
                    )),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }
}
