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

fn section_icon(kind: RenderBlockKind) -> &'static str {
    match kind {
        RenderBlockKind::Assistant => "✦",
        RenderBlockKind::Reasoning => "◆",
        RenderBlockKind::Plan => "☰",
        RenderBlockKind::Tool => "⚙",
        RenderBlockKind::Command => "$",
        RenderBlockKind::FileChange => "△",
        RenderBlockKind::Approval => "⏳",
        RenderBlockKind::UserInput => "❯",
        RenderBlockKind::Usage => "◷",
        RenderBlockKind::Lifecycle => "●",
        RenderBlockKind::Metadata => "·",
    }
}

fn section_color(kind: RenderBlockKind) -> Color {
    match kind {
        RenderBlockKind::Assistant => Color::White,
        RenderBlockKind::Reasoning => Color::Cyan,
        RenderBlockKind::Plan => Color::Cyan,
        RenderBlockKind::Tool => Color::Yellow,
        RenderBlockKind::Command => Color::Yellow,
        RenderBlockKind::FileChange => Color::Blue,
        RenderBlockKind::Approval => Color::Magenta,
        RenderBlockKind::UserInput => Color::Magenta,
        RenderBlockKind::Usage => Color::DarkGray,
        RenderBlockKind::Lifecycle => Color::DarkGray,
        RenderBlockKind::Metadata => Color::DarkGray,
    }
}

pub(crate) fn timeline_section_header(kind: RenderBlockKind, count: usize) -> Line<'static> {
    let icon = section_icon(kind);
    let color = section_color(kind);
    let label = block_kind_label(kind).to_lowercase();
    let count_str = if count > 1 {
        format!(" ({count})")
    } else {
        String::new()
    };

    Line::from(vec![
        Span::styled(format!("  {icon} "), Style::default().fg(color)),
        Span::styled(
            format!("{label}{count_str} "),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "─".repeat(32),
            Style::default()
                .fg(Color::Rgb(50, 50, 50))
                .add_modifier(Modifier::DIM),
        ),
    ])
}
