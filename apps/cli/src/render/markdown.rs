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
    let mut code_block_lang: Option<String> = None;

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
                Tag::CodeBlock(kind) => {
                    flush_line(&mut current_spans, &mut lines);
                    in_code_block = true;
                    code_block_lang = match &kind {
                        pulldown_cmark::CodeBlockKind::Fenced(lang) => {
                            let l = lang.split_whitespace().next().unwrap_or("").to_lowercase();
                            if l.is_empty() {
                                None
                            } else {
                                Some(l)
                            }
                        }
                        _ => None,
                    };
                    style_stack.push(Style::default().fg(Color::Rgb(180, 190, 200)));
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
                    let depth = list_stack.len().saturating_sub(1);
                    let indent = "  ".repeat(depth);
                    let bullet = match list_stack.last() {
                        Some(Some(n)) => {
                            let s = format!("{}{n}. ", indent);
                            if let Some(Some(ref mut num)) = list_stack.last_mut() {
                                *num += 1;
                            }
                            s
                        }
                        _ => {
                            let bullet_char = match depth {
                                0 => "•",
                                1 => "◦",
                                _ => "▪",
                            };
                            format!("{indent}{bullet_char} ")
                        }
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
                TagEnd::Heading(level) => {
                    style_stack.pop();
                    flush_line(&mut current_spans, &mut lines);
                    if matches!(level, pulldown_cmark::HeadingLevel::H1) {
                        lines.push(Line::from(Span::styled(
                            "─".repeat(40),
                            Style::default()
                                .fg(Color::DarkGray)
                                .add_modifier(Modifier::DIM),
                        )));
                    }
                }
                TagEnd::Emphasis | TagEnd::Strong => {
                    style_stack.pop();
                }
                TagEnd::CodeBlock => {
                    style_stack.pop();
                    in_code_block = false;
                    code_block_lang = None;
                    flush_line(&mut current_spans, &mut lines);
                    lines.push(Line::from(""));
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
                if in_code_block {
                    let text_str = text.to_string();
                    let mut sub_lines = text_str.split('\n').peekable();
                    while let Some(sub) = sub_lines.next() {
                        if current_spans.is_empty() {
                            current_spans.push(Span::styled(
                                "▎ ",
                                Style::default().fg(Color::Rgb(80, 80, 120)),
                            ));
                        }
                        highlight_code_line(sub, code_block_lang.as_deref(), &mut current_spans);
                        if sub_lines.peek().is_some() {
                            flush_line(&mut current_spans, &mut lines);
                        }
                    }
                } else {
                    let style = current_style(&style_stack);
                    current_spans.push(Span::styled(text.to_string(), style));
                }
            }
            Event::Code(code) => {
                current_spans.push(Span::styled("`", Style::default().fg(Color::DarkGray)));
                current_spans.push(Span::styled(
                    code.to_string(),
                    Style::default().fg(Color::Cyan),
                ));
                current_spans.push(Span::styled("`", Style::default().fg(Color::DarkGray)));
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

// ---------------------------------------------------------------------------
// Lightweight syntax highlighting for code blocks
// ---------------------------------------------------------------------------

const CODE_BASE: Color = Color::Rgb(180, 190, 200);
const CODE_KEYWORD: Color = Color::Rgb(198, 120, 221); // purple
const CODE_STRING: Color = Color::Rgb(152, 195, 121); // green
const CODE_COMMENT: Color = Color::Rgb(92, 99, 112); // gray
const CODE_NUMBER: Color = Color::Rgb(209, 154, 102); // orange
const CODE_TYPE: Color = Color::Rgb(97, 175, 239); // blue
const CODE_PUNCTUATION: Color = Color::Rgb(130, 137, 151); // dim

/// Keywords by language family.
fn is_keyword(word: &str, lang: Option<&str>) -> bool {
    // Common across many languages
    const UNIVERSAL: &[&str] = &[
        "if", "else", "for", "while", "return", "break", "continue", "match", "switch", "case",
        "default", "true", "false", "null", "nil", "None", "import", "from", "as", "in", "try",
        "catch", "finally", "throw", "async", "await", "yield",
    ];

    const RUST: &[&str] = &[
        "fn",
        "let",
        "mut",
        "pub",
        "use",
        "mod",
        "struct",
        "enum",
        "impl",
        "trait",
        "where",
        "self",
        "Self",
        "super",
        "crate",
        "const",
        "static",
        "type",
        "move",
        "ref",
        "unsafe",
        "extern",
        "loop",
        "dyn",
        "macro_rules",
    ];

    const JS_TS: &[&str] = &[
        "function",
        "var",
        "let",
        "const",
        "class",
        "extends",
        "new",
        "this",
        "typeof",
        "instanceof",
        "export",
        "interface",
        "type",
        "enum",
        "implements",
        "declare",
        "abstract",
        "readonly",
        "private",
        "public",
        "protected",
        "static",
        "override",
    ];

    const PYTHON: &[&str] = &[
        "def", "class", "self", "with", "as", "lambda", "pass", "raise", "except", "elif", "and",
        "or", "not", "is", "del", "global", "nonlocal",
    ];

    const PHP: &[&str] = &[
        "function",
        "class",
        "new",
        "public",
        "private",
        "protected",
        "static",
        "final",
        "abstract",
        "interface",
        "extends",
        "implements",
        "namespace",
        "use",
        "throw",
        "instanceof",
        "readonly",
        "enum",
        "match",
        "fn",
    ];

    if UNIVERSAL.contains(&word) {
        return true;
    }

    match lang {
        Some("rust" | "rs") => RUST.contains(&word),
        Some("javascript" | "js" | "typescript" | "ts" | "tsx" | "jsx") => JS_TS.contains(&word),
        Some("python" | "py") => PYTHON.contains(&word),
        Some("php") => PHP.contains(&word),
        // For unknown languages, check all keyword sets
        _ => {
            RUST.contains(&word)
                || JS_TS.contains(&word)
                || PYTHON.contains(&word)
                || PHP.contains(&word)
        }
    }
}

fn is_type_name(word: &str) -> bool {
    // PascalCase heuristic: starts with uppercase, has at least one lowercase
    let mut chars = word.chars();
    match chars.next() {
        Some(c) if c.is_ascii_uppercase() => chars.any(|c| c.is_ascii_lowercase()),
        _ => false,
    }
}

/// Tokenize a code line and push colored Span's into `out`.
fn highlight_code_line(line: &str, lang: Option<&str>, out: &mut Vec<Span<'static>>) {
    if line.is_empty() {
        return;
    }

    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    // Check for line comments
    let comment_start = detect_line_comment(line, lang);
    if let Some(comment_pos) = comment_start {
        if comment_pos == 0 {
            out.push(Span::styled(
                line.to_string(),
                Style::default()
                    .fg(CODE_COMMENT)
                    .add_modifier(Modifier::ITALIC),
            ));
            return;
        }
        // Highlight before comment, then the comment
        highlight_code_segment(&line[..comment_pos], lang, out);
        out.push(Span::styled(
            line[comment_pos..].to_string(),
            Style::default()
                .fg(CODE_COMMENT)
                .add_modifier(Modifier::ITALIC),
        ));
        return;
    }

    while i < len {
        let ch = bytes[i];

        // String literals (single or double quote)
        if ch == b'"' || ch == b'\'' {
            let quote = ch;
            let start = i;
            i += 1;
            while i < len && bytes[i] != quote {
                if bytes[i] == b'\\' {
                    i += 1; // skip escaped char
                }
                i += 1;
            }
            if i < len {
                i += 1; // closing quote
            }
            out.push(Span::styled(
                line[start..i].to_string(),
                Style::default().fg(CODE_STRING),
            ));
            continue;
        }

        // Numbers
        if ch.is_ascii_digit() || (ch == b'.' && i + 1 < len && bytes[i + 1].is_ascii_digit()) {
            let start = i;
            while i < len
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'.' || bytes[i] == b'_')
            {
                i += 1;
            }
            out.push(Span::styled(
                line[start..i].to_string(),
                Style::default().fg(CODE_NUMBER),
            ));
            continue;
        }

        // Words (identifiers / keywords)
        if ch.is_ascii_alphabetic() || ch == b'_' {
            let start = i;
            while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            let word = &line[start..i];
            let color = if is_keyword(word, lang) {
                CODE_KEYWORD
            } else if is_type_name(word) {
                CODE_TYPE
            } else {
                CODE_BASE
            };
            out.push(Span::styled(word.to_string(), Style::default().fg(color)));
            continue;
        }

        // Punctuation and operators
        if b"(){}[]<>;:,.=+-*/%&|!^~?@#$\\".contains(&ch) {
            let start = i;
            while i < len && b"(){}[]<>;:,.=+-*/%&|!^~?@#$\\".contains(&bytes[i]) && i - start < 3 {
                i += 1;
            }
            out.push(Span::styled(
                line[start..i].to_string(),
                Style::default().fg(CODE_PUNCTUATION),
            ));
            continue;
        }

        // Whitespace and other characters
        let start = i;
        while i < len
            && !bytes[i].is_ascii_alphanumeric()
            && bytes[i] != b'_'
            && bytes[i] != b'"'
            && bytes[i] != b'\''
            && !b"(){}[]<>;:,.=+-*/%&|!^~?@#$\\".contains(&bytes[i])
        {
            i += 1;
        }
        out.push(Span::styled(
            line[start..i].to_string(),
            Style::default().fg(CODE_BASE),
        ));
    }
}

fn highlight_code_segment(line: &str, lang: Option<&str>, out: &mut Vec<Span<'static>>) {
    highlight_code_line(line, lang, out);
}

/// Detect position of a line comment start, or None.
fn detect_line_comment(line: &str, lang: Option<&str>) -> Option<usize> {
    let trimmed = line.trim_start();
    let offset = line.len() - trimmed.len();

    match lang {
        Some("python" | "py" | "bash" | "sh" | "zsh" | "yaml" | "yml" | "toml" | "ruby" | "rb") => {
            if trimmed.starts_with('#') {
                Some(offset)
            } else {
                None
            }
        }
        Some("html" | "xml") => None, // HTML uses <!-- --> not line comments
        _ => {
            // C-style: // or # for shell-like languages
            if trimmed.starts_with("//") || trimmed.starts_with('#') {
                Some(offset)
            } else {
                // Check for // mid-line (not inside a string - simplified)
                find_line_comment_pos(line)
            }
        }
    }
}

/// Simple scan for `//` that's not inside a string literal.
fn find_line_comment_pos(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut in_string = false;
    let mut quote_char = b'"';
    let mut i = 0;
    while i < bytes.len() {
        if in_string {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == quote_char {
                in_string = false;
            }
        } else {
            if bytes[i] == b'"' || bytes[i] == b'\'' {
                in_string = true;
                quote_char = bytes[i];
            } else if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'/' {
                return Some(i);
            }
        }
        i += 1;
    }
    None
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
            .filter(|l| {
                l.spans
                    .iter()
                    .any(|s| s.style.fg == Some(Color::Rgb(180, 190, 200)))
            })
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
