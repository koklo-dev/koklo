use super::*;

impl MonitorApp {
    pub(crate) fn render_transcript_timeline(
        &self,
        frame: &mut Frame,
        area: Rect,
        render_model: &TranscriptRenderModel,
        title: &str,
        border_style: Style,
        scroll_lines: usize,
    ) {
        let visible_height = area.height.saturating_sub(2) as usize;
        let mut all_styled: Vec<Line> = Vec::new();
        let mut previous_kind = None;
        for block in &render_model.blocks {
            if previous_kind != Some(block.kind) {
                all_styled.push(timeline_section_header(block.kind));
                previous_kind = Some(block.kind);
            }
            all_styled.extend(block_lines(block));
        }

        let (start, end, clamped_scroll) =
            timeline_window(all_styled.len(), visible_height, scroll_lines);
        let display_lines: Vec<Line> = inset_lines(all_styled[start..end].to_vec(), 1);
        let log_title = if clamped_scroll == 0 {
            format!("{title}  ·  LOG · live")
        } else {
            format!("{title}  ·  LOG · -{clamped_scroll} lines")
        };

        let para = Paragraph::new(Text::from(display_lines))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(log_title)
                    .border_style(border_style),
            )
            .wrap(ratatui::widgets::Wrap { trim: false });
        frame.render_widget(para, area);
    }
}
