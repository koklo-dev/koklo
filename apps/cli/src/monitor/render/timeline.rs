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

        // Pre-compute block counts per kind for section headers
        let mut kind_counts: std::collections::HashMap<RenderBlockKind, usize> =
            std::collections::HashMap::new();
        for block in &render_model.blocks {
            *kind_counts.entry(block.kind).or_insert(0) += 1;
        }

        let mut all_styled: Vec<Line> = Vec::new();
        let mut previous_kind = None;
        for block in &render_model.blocks {
            if previous_kind != Some(block.kind) {
                if previous_kind.is_some() {
                    all_styled.push(Line::from(""));
                }
                let count = kind_counts.get(&block.kind).copied().unwrap_or(1);
                all_styled.push(timeline_section_header(block.kind, count));
                previous_kind = Some(block.kind);
            }
            all_styled.extend(block_lines(block));
        }

        // Available content width = area minus borders (1+1) minus inset (2)
        let content_width = area.width.saturating_sub(2 + 2) as usize;
        let wrapped = soft_wrap_lines(all_styled, content_width);

        let (start, end, clamped_scroll) =
            timeline_window(wrapped.len(), visible_height, scroll_lines);
        let display_lines: Vec<Line> = inset_lines(wrapped[start..end].to_vec(), 2);
        let log_title = if clamped_scroll == 0 {
            format!("{title}  ·  LOG · live")
        } else {
            format!("{title}  ·  LOG · -{clamped_scroll} lines")
        };

        let para = Paragraph::new(Text::from(display_lines)).block(
            Block::default()
                .borders(Borders::ALL)
                .title(log_title)
                .border_style(border_style),
        );
        frame.render_widget(para, area);
    }
}
