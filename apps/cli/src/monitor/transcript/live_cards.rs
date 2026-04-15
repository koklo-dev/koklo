use super::*;

pub(crate) fn card_lines(block: &RenderBlock, max_lines: usize) -> Vec<Line<'static>> {
    if max_lines == 0 {
        return Vec::new();
    }

    let mut lines = vec![Line::from(vec![
        Span::styled(
            block_time(block),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::DIM),
        ),
        Span::raw("  "),
        Span::styled(
            block_status_label(block),
            tone_style(block.tone).add_modifier(Modifier::BOLD),
        ),
    ])];

    if max_lines == 1 {
        return lines;
    }

    let mut preview = preview_lines(block, max_lines.saturating_sub(1));
    if preview.is_empty() {
        preview.push(Line::from(""));
    }
    lines.extend(preview);
    lines
}

pub(crate) fn activity_card_lines(blocks: &[RenderBlock], max_lines: usize) -> Vec<Line<'static>> {
    if max_lines == 0 {
        return Vec::new();
    }

    let mut lines = Vec::new();
    for block in blocks {
        if lines.len() >= max_lines {
            break;
        }

        let style = tone_style(block.tone);
        let summary = compact_block_summary(block);
        lines.push(Line::from(vec![
            Span::styled(
                block_time(block),
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::DIM),
            ),
            Span::raw("  "),
            Span::styled(
                block_status_label(block),
                style.add_modifier(Modifier::BOLD),
            ),
            Span::raw("  "),
            Span::styled(summary, style),
        ]));
    }

    if lines.is_empty() {
        lines.push(Line::from(""));
    }
    lines
}

pub(crate) fn select_live_overview_cards(
    live_model: &TranscriptLiveModel,
) -> Vec<LiveOverviewCardKind> {
    let mut cards = Vec::new();

    if !live_model.pending.is_empty() {
        cards.push(LiveOverviewCardKind::Waiting);
    }

    if let Some(primary) = select_primary_live_overview_card(live_model) {
        cards.push(primary);
    }

    cards
}

fn select_primary_live_overview_card(
    live_model: &TranscriptLiveModel,
) -> Option<LiveOverviewCardKind> {
    let assistant = live_model.latest_assistant.as_ref().and_then(|block| {
        is_live_block(block).then_some((
            block.seq,
            live_card_priority(LiveOverviewCardKind::Assistant),
            LiveOverviewCardKind::Assistant,
        ))
    });
    let thinking = live_model.latest_thinking.as_ref().and_then(|block| {
        (is_live_block(block) || block_is_newer_than(block, live_model.latest_assistant.as_ref()))
            .then_some((
                block.seq,
                live_card_priority(LiveOverviewCardKind::Thinking),
                LiveOverviewCardKind::Thinking,
            ))
    });
    let activity = live_model.latest_activity.as_ref().and_then(|block| {
        (is_actionable_activity(block)
            && (is_live_block(block)
                || block_is_newer_than(block, live_model.latest_assistant.as_ref())))
        .then_some((
            block.seq,
            live_card_priority(LiveOverviewCardKind::Activity),
            LiveOverviewCardKind::Activity,
        ))
    });

    [assistant, thinking, activity]
        .into_iter()
        .flatten()
        .max_by_key(|(seq, priority, _)| (*seq, *priority))
        .map(|(_, _, card)| card)
}

pub(crate) fn live_overview_height(cards: &[LiveOverviewCardKind]) -> u16 {
    match cards.len() {
        0 => 0,
        1 => 6,
        _ => 7,
    }
}

fn is_live_block(block: &RenderBlock) -> bool {
    matches!(
        block.status.as_deref(),
        Some("pending" | "streaming" | "in_progress" | "updated")
    )
}

fn block_is_newer_than(block: &RenderBlock, other: Option<&RenderBlock>) -> bool {
    other.map(|other| block.seq > other.seq).unwrap_or(true)
}

fn is_actionable_activity(block: &RenderBlock) -> bool {
    matches!(
        block.kind,
        RenderBlockKind::Tool | RenderBlockKind::Command | RenderBlockKind::FileChange
    )
}

fn live_card_priority(kind: LiveOverviewCardKind) -> u8 {
    match kind {
        LiveOverviewCardKind::Waiting => 0,
        LiveOverviewCardKind::Assistant => 1,
        LiveOverviewCardKind::Activity => 2,
        LiveOverviewCardKind::Thinking => 3,
    }
}

pub(crate) fn block_time(block: &RenderBlock) -> String {
    block
        .created_at
        .as_deref()
        .and_then(|value| value.get(11..19))
        .unwrap_or("??:??:??")
        .to_string()
}

pub(crate) fn block_status_label(block: &RenderBlock) -> String {
    match block.status.as_deref() {
        Some("pending") => "● pending".to_string(),
        Some("streaming") => "● streaming".to_string(),
        Some("completed") | Some("resolved") => "✓ done".to_string(),
        Some("failed") => "✗ failed".to_string(),
        Some(other) => format!("· {}", other.replace('_', " ")),
        None => block_kind_label(block.kind).to_ascii_lowercase(),
    }
}

pub(crate) fn compact_block_summary(block: &RenderBlock) -> String {
    match &block.body {
        RenderBlockBody::Markdown(text) => text
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("assistant update")
            .trim()
            .to_string(),
        RenderBlockBody::Lines(lines) => lines
            .iter()
            .find(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .unwrap_or_else(|| block_kind_label(block.kind).to_ascii_lowercase()),
    }
}

pub(crate) fn live_card_title(
    title: &str,
    pending_count: usize,
    block: Option<&RenderBlock>,
) -> String {
    let icon = match title {
        "ASSISTANT" => "●",
        "THINKING" => "●",
        "ACTIVITY" => "●",
        "WAITING" => "◌",
        _ => "●",
    };
    if title == "WAITING" && pending_count > 1 {
        format!("{icon} {title} ({pending_count})")
    } else if let Some(block) = block {
        format!("{icon} {} · {}", title, block_kind_label(block.kind))
    } else {
        format!("{icon} {title}")
    }
}
