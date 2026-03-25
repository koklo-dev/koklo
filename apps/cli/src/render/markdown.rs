//! Markdown -> ratatui `Line`/`Span` renderer.
//!
//! Parses CommonMark via `pulldown-cmark` and maps events to styled ratatui
//! lines suitable for the TUI log panel.

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use ratatui::{
    style::{Color, Modifier, Style},
    text::{Line, Span},
};

/// Convert a markdown string into styled ratatui lines.
pub fn markdown_to_lines(input: &str) -> Vec<Line<'static>> {
    let parser = Parser::new_ext(input, Options::ENABLE_STRIKETHROUGH);

    let mut lines: Vec<Line<'static>> = Vec::new();
    let mut current_spans: Vec<Span<'static>> = Vec::new();
    let mut style_stack: Vec<Style> = Vec::new();
    let mut list_stack: Vec<Option<u64>> = Vec::new();
    let mut in_code_block = false;

    let flush_line = |spans: &mut Vec<Span<'static>>, out: &mut Vec<Line<'static>>| {
        if !spans.is_empty() {
            out.push(Line::from(std::mem::take(spans)));
        }
    };

    let current_style = |stack: &[Style]| -> Style {
        let mut s = Style::default();
        for layer in stack {
            s = s.patch(*layer);
        }
        s
    };

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading { level, .. } => {
                    flush_line(&mut current_spans, &mut lines);
                    let color = match level {
                        pulldown_cmark::HeadingLevel::H1 => Color::Cyan,
                        pulldown_cmark::HeadingLevel::H2 => Color::Blue,
                        pulldown_cmark::HeadingLevel::H3 => Color::Magenta,
                        _ => Color::White,
                    };
                    style_stack.push(Style::default().fg(color).add_modifier(Modifier::BOLD));
                }
                Tag::Emphasis => {
                    style_stack.push(Style::default().add_modifier(Modifier::ITALIC));
                }
                Tag::Strong => {
                    style_stack.push(Style::default().add_modifier(Modifier::BOLD));
                }
                Tag::CodeBlock(_) => {
                    flush_line(&mut current_spans, &mut lines);
                    in_code_block = true;
                    style_stack.push(Style::default().fg(Color::Cyan));
                }
                Tag::BlockQuote(_) => {
                    flush_line(&mut current_spans, &mut lines);
                    current_spans.push(Span::styled(
                        "▎ ",
                        Style::default()
                            .fg(Color::DarkGray)
                            .add_modifier(Modifier::BOLD),
                    ));
                    style_stack.push(
                        Style::default()
                            .fg(Color::DarkGray)
                            .add_modifier(Modifier::ITALIC),
                    );
                }
                Tag::List(start) => {
                    list_stack.push(start);
                }
                Tag::Item => {
                    flush_line(&mut current_spans, &mut lines);
                    let indent = "  ".repeat(list_stack.len().saturating_sub(1));
                    let bullet = match list_stack.last() {
                        Some(Some(n)) => {
                            let s = format!("{}{n}. ", indent);
                            if let Some(Some(ref mut num)) = list_stack.last_mut() {
                                *num += 1;
                            }
                            s
                        }
                        _ => format!("{indent}- "),
                    };
                    current_spans.push(Span::styled(bullet, Style::default().fg(Color::Yellow)));
                }
                Tag::Paragraph => {
                    if !lines.is_empty() {
                        lines.push(Line::from(""));
                    }
                }
                _ => {}
            },
            Event::End(tag_end) => match tag_end {
                TagEnd::Heading(_) => {
                    style_stack.pop();
                    flush_line(&mut current_spans, &mut lines);
                }
                TagEnd::Emphasis | TagEnd::Strong => {
                    style_stack.pop();
                }
                TagEnd::CodeBlock => {
                    style_stack.pop();
                    in_code_block = false;
                    flush_line(&mut current_spans, &mut lines);
                }
                TagEnd::BlockQuote(_) => {
                    style_stack.pop();
                    flush_line(&mut current_spans, &mut lines);
                }
                TagEnd::List(_) => {
                    list_stack.pop();
                }
                TagEnd::Item => {
                    flush_line(&mut current_spans, &mut lines);
                }
                TagEnd::Paragraph => {
                    flush_line(&mut current_spans, &mut lines);
                }
                _ => {}
            },
            Event::Text(text) => {
                let style = current_style(&style_stack);
                if in_code_block {
                    let text_str = text.to_string();
                    let mut sub_lines = text_str.split('\n').peekable();
                    while let Some(sub) = sub_lines.next() {
                        if current_spans.is_empty() {
                            current_spans.push(Span::styled(
                                "│ ",
                                Style::default()
                                    .fg(Color::DarkGray)
                                    .add_modifier(Modifier::BOLD),
                            ));
                        }
                        current_spans.push(Span::styled(sub.to_string(), style));
                        if sub_lines.peek().is_some() {
                            flush_line(&mut current_spans, &mut lines);
                        }
                    }
                } else {
                    current_spans.push(Span::styled(text.to_string(), style));
                }
            }
            Event::Code(code) => {
                let style = Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD);
                current_spans.push(Span::styled(code.to_string(), style));
            }
            Event::SoftBreak => {
                current_spans.push(Span::raw(" "));
            }
            Event::HardBreak => {
                flush_line(&mut current_spans, &mut lines);
            }
            Event::Rule => {
                flush_line(&mut current_spans, &mut lines);
                lines.push(Line::from(Span::styled(
                    "────────────────────────────────────────",
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::DIM),
                )));
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                let style = Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::DIM);
                current_spans.push(Span::styled(html.to_string(), style));
            }
            _ => {}
        }
    }

    if !current_spans.is_empty() {
        lines.push(Line::from(current_spans));
    }

    if lines.is_empty() && !input.is_empty() {
        lines.push(Line::from(""));
    }

    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text() {
        let lines = markdown_to_lines("hello world");
        assert_eq!(lines.len(), 1);
    }

    #[test]
    fn headings_are_bold() {
        let lines = markdown_to_lines("# Title\n## Sub");
        assert!(lines.len() >= 2);
        let h1_style = lines[0].spans[0].style;
        assert!(h1_style.add_modifier.contains(Modifier::BOLD));
        assert_eq!(h1_style.fg, Some(Color::Cyan));
    }

    #[test]
    fn code_block_preserves_lines() {
        let input = "```\nline1\nline2\n```";
        let lines = markdown_to_lines(input);
        let code_lines: Vec<_> = lines
            .iter()
            .filter(|l| l.spans.iter().any(|s| s.style.fg == Some(Color::Cyan)))
            .collect();
        assert!(
            code_lines.len() >= 2,
            "code block should have multiple lines"
        );
    }

    #[test]
    fn inline_code() {
        let lines = markdown_to_lines("use `foo` here");
        let has_code_style = lines[0]
            .spans
            .iter()
            .any(|s| s.style.fg == Some(Color::Cyan));
        assert!(has_code_style);
    }

    #[test]
    fn unordered_list() {
        let lines = markdown_to_lines("- one\n- two");
        let has_yellow = lines
            .iter()
            .any(|l| l.spans.iter().any(|s| s.style.fg == Some(Color::Yellow)));
        assert!(has_yellow, "list bullets should be yellow");
    }

    #[test]
    fn empty_input() {
        let lines = markdown_to_lines("");
        assert!(lines.is_empty());
    }
}
