use super::*;

pub(crate) fn tone_style(tone: RenderTone) -> Style {
    match tone {
        RenderTone::Default => Style::default(),
        RenderTone::Muted => Style::default()
            .fg(Color::DarkGray)
            .add_modifier(Modifier::DIM),
        RenderTone::Info => Style::default().fg(Color::Cyan),
        RenderTone::Success => Style::default().fg(Color::Green),
        RenderTone::Warning => Style::default().fg(Color::Yellow),
        RenderTone::Error => Style::default().fg(Color::Red),
    }
}

pub(crate) fn block_lines(block: &RenderBlock) -> Vec<Line<'static>> {
    match &block.body {
        RenderBlockBody::Markdown(text) => crate::render::markdown::markdown_to_lines(text),
        RenderBlockBody::Lines(lines) if block.kind == RenderBlockKind::FileChange => {
            style_file_change_lines(lines)
        }
        RenderBlockBody::Lines(lines) => {
            let style = tone_style(block.tone);
            lines
                .iter()
                .map(|line| Line::from(Span::styled(line.clone(), style)))
                .collect()
        }
    }
}

pub(crate) fn style_file_change_lines(lines: &[String]) -> Vec<Line<'static>> {
    lines
        .iter()
        .map(|line| style_file_change_line(line))
        .collect()
}

fn style_file_change_line(line: &str) -> Line<'static> {
    let indent = line
        .chars()
        .take_while(|ch| ch.is_whitespace())
        .collect::<String>();
    let trimmed = line[indent.len()..].to_string();

    let (style, accent) = if trimmed.starts_with('+') {
        (
            Style::default().fg(Color::Green).bg(Color::Rgb(16, 48, 24)),
            "+ ",
        )
    } else if trimmed.starts_with('-') {
        (
            Style::default().fg(Color::Red).bg(Color::Rgb(56, 20, 20)),
            "- ",
        )
    } else if trimmed.starts_with("@@") {
        (
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
            "│ ",
        )
    } else if trimmed.starts_with('●') || trimmed.starts_with('Δ') {
        (
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
            "",
        )
    } else {
        (Style::default().fg(Color::White), "")
    };

    let mut spans = Vec::new();
    if !indent.is_empty() {
        spans.push(Span::raw(indent));
    }
    if trimmed.starts_with('+') || trimmed.starts_with('-') {
        spans.push(Span::styled(
            accent.to_string(),
            style.add_modifier(Modifier::BOLD),
        ));
        spans.push(Span::styled(trimmed[1..].to_string(), style));
    } else if trimmed.starts_with("@@") {
        spans.push(Span::styled(accent.to_string(), style));
        spans.push(Span::styled(trimmed, style));
    } else {
        spans.push(Span::styled(trimmed, style));
    }
    Line::from(spans)
}

pub(crate) fn inset_lines(lines: Vec<Line<'static>>, inset: usize) -> Vec<Line<'static>> {
    if inset == 0 {
        return lines;
    }

    let padding = " ".repeat(inset);
    lines
        .into_iter()
        .map(|line| {
            let mut spans = Vec::with_capacity(line.spans.len() + 1);
            spans.push(Span::raw(padding.clone()));
            spans.extend(line.spans);
            Line::from(spans)
        })
        .collect()
}

pub(crate) fn preview_lines(block: &RenderBlock, max_lines: usize) -> Vec<Line<'static>> {
    if max_lines == 0 {
        return Vec::new();
    }

    let mut lines = block_lines(block);
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len().saturating_sub(max_lines));
    }
    lines
}
