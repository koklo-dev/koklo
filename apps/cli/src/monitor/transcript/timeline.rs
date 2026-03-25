use super::*;

pub(crate) fn transcript_line_count(render_model: &TranscriptRenderModel) -> usize {
    let mut total = 0usize;
    let mut previous_kind = None;
    for block in &render_model.blocks {
        if previous_kind != Some(block.kind) {
            total += 1;
            previous_kind = Some(block.kind);
        }
        total += block_lines(block).len();
    }
    total
}

pub(crate) fn timeline_window(
    total_lines: usize,
    visible_height: usize,
    scroll_lines: usize,
) -> (usize, usize, usize) {
    if total_lines == 0 || visible_height == 0 {
        return (0, 0, 0);
    }

    let max_scroll = total_lines.saturating_sub(visible_height);
    let clamped_scroll = scroll_lines.min(max_scroll);
    let end = total_lines.saturating_sub(clamped_scroll);
    let start = end.saturating_sub(visible_height);
    (start, end, clamped_scroll)
}

pub(crate) fn block_kind_label(kind: RenderBlockKind) -> &'static str {
    match kind {
        RenderBlockKind::Assistant => "Assistant",
        RenderBlockKind::Reasoning => "Reasoning",
        RenderBlockKind::Plan => "Plan",
        RenderBlockKind::Tool => "Tools",
        RenderBlockKind::Command => "Commands",
        RenderBlockKind::FileChange => "Files",
        RenderBlockKind::Approval => "Approval",
        RenderBlockKind::UserInput => "Input",
        RenderBlockKind::Usage => "Usage",
        RenderBlockKind::Lifecycle => "Lifecycle",
        RenderBlockKind::Metadata => "Metadata",
    }
}

pub(crate) fn timeline_section_header(kind: RenderBlockKind) -> Line<'static> {
    Line::from(vec![
        Span::styled(
            format!("── {} ", block_kind_label(kind).to_uppercase()),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "────────────────────────",
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::DIM),
        ),
    ])
}
