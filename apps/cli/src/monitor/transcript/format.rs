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
    let mut result = Vec::new();
    let mut old_line: Option<usize> = None;
    let mut new_line: Option<usize> = None;

    for line in lines {
        let trimmed = line.trim_start();
        if trimmed.starts_with("@@") {
            if !result.is_empty() {
                result.push(Line::from(""));
            }
            // Parse hunk header: @@ -old_start[,old_count] +new_start[,new_count] @@
            if let Some((old_start, new_start)) = parse_hunk_header(trimmed) {
                old_line = Some(old_start);
                new_line = Some(new_start);
            }
            result.push(style_file_change_line(line, None));
        } else if trimmed.starts_with('+') {
            let lineno = new_line;
            if let Some(ref mut n) = new_line {
                *n += 1;
            }
            result.push(style_file_change_line(line, lineno));
        } else if trimmed.starts_with('-') {
            let lineno = old_line;
            if let Some(ref mut n) = old_line {
                *n += 1;
            }
            result.push(style_file_change_line(line, lineno));
        } else {
            // Context line — advance both counters
            if let Some(ref mut n) = old_line {
                *n += 1;
            }
            if let Some(ref mut n) = new_line {
                *n += 1;
            }
            result.push(style_file_change_line(line, None));
        }
    }
    result
}

/// Parse `@@ -old_start[,count] +new_start[,count] @@` into (old_start, new_start).
fn parse_hunk_header(header: &str) -> Option<(usize, usize)> {
    // Example: "@@ -10,5 +12,7 @@"
    let stripped = header.trim_start_matches('@').trim_start();
    let parts: Vec<&str> = stripped.splitn(3, ' ').collect();
    if parts.len() < 2 {
        return None;
    }
    let old_start = parts[0]
        .trim_start_matches('-')
        .split(',')
        .next()?
        .parse::<usize>()
        .ok()?;
    let new_start = parts[1]
        .trim_start_matches('+')
        .split(',')
        .next()?
        .parse::<usize>()
        .ok()?;
    Some((old_start, new_start))
}

fn style_file_change_line(line: &str, lineno: Option<usize>) -> Line<'static> {
    let indent = line
        .chars()
        .take_while(|ch| ch.is_whitespace())
        .collect::<String>();
    let trimmed = line[indent.len()..].to_string();

    let lineno_style = Style::default()
        .fg(Color::DarkGray)
        .add_modifier(Modifier::DIM);

    let (style, accent) = if trimmed.starts_with('+') {
        (
            Style::default().fg(Color::Green).bg(Color::Rgb(20, 56, 28)),
            "+ ",
        )
    } else if trimmed.starts_with('-') {
        (
            Style::default().fg(Color::Red).bg(Color::Rgb(64, 24, 24)),
            "- ",
        )
    } else if trimmed.starts_with("@@") {
        (
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
            "│ ",
        )
    } else if trimmed.starts_with('●') {
        (
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
            "",
        )
    } else if trimmed.starts_with('Δ') {
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
    // Add line number gutter for diff lines
    if let Some(num) = lineno {
        spans.push(Span::styled(format!("{num:>4} "), lineno_style));
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

/// Measure the display width of a Line by summing span content char counts.
fn line_display_width(line: &Line) -> usize {
    line.spans.iter().map(|s| s.content.chars().count()).sum()
}

/// Measure the display width of the "prefix" portion of a line — the leading
/// spans that form the visual indent/icon (non-alphanumeric start).
fn line_prefix_width(line: &Line) -> usize {
    let mut width = 0;
    for span in &line.spans {
        let content = span.content.as_ref();
        let trimmed = content.trim();
        // Whitespace-only or short icon/prefix spans
        if trimmed.is_empty()
            || (!trimmed.chars().next().unwrap_or(' ').is_alphanumeric()
                && content.chars().count() <= 4)
        {
            width += content.chars().count();
        } else {
            break;
        }
    }
    width
}

/// Soft-wrap lines to fit within `max_width`, preserving indentation on
/// continuation lines. Returns new Vec<Line> with wrapped results.
pub(crate) fn soft_wrap_lines(lines: Vec<Line<'static>>, max_width: usize) -> Vec<Line<'static>> {
    if max_width == 0 {
        return lines;
    }

    let mut result = Vec::with_capacity(lines.len());

    for line in lines {
        let width = line_display_width(&line);
        if width <= max_width {
            result.push(line);
            continue;
        }

        // Determine hanging indent for continuation lines
        let prefix_w = line_prefix_width(&line).min(max_width / 2).max(2);
        let hang_pad = " ".repeat(prefix_w);
        let hang_style = Style::default()
            .fg(Color::DarkGray)
            .add_modifier(Modifier::DIM);

        // Flatten all spans into (char, Style) pairs
        let mut chars: Vec<(char, Style)> = Vec::with_capacity(width);
        for span in &line.spans {
            for ch in span.content.chars() {
                chars.push((ch, span.style));
            }
        }

        let mut pos = 0;
        let mut first_line = true;
        while pos < chars.len() {
            let budget = if first_line {
                max_width
            } else {
                max_width.saturating_sub(prefix_w)
            };
            let end = (pos + budget).min(chars.len());

            // Build spans for this segment
            let mut spans: Vec<Span<'static>> = Vec::new();
            if !first_line {
                spans.push(Span::styled(hang_pad.clone(), hang_style));
            }

            let segment = &chars[pos..end];
            if !segment.is_empty() {
                let mut cur_style = segment[0].1;
                let mut cur_text = String::new();
                for &(ch, style) in segment {
                    if style != cur_style {
                        if !cur_text.is_empty() {
                            spans.push(Span::styled(cur_text, cur_style));
                            cur_text = String::new();
                        }
                        cur_style = style;
                    }
                    cur_text.push(ch);
                }
                if !cur_text.is_empty() {
                    spans.push(Span::styled(cur_text, cur_style));
                }
            }

            result.push(Line::from(spans));
            pos = end;
            first_line = false;
        }
    }

    result
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
