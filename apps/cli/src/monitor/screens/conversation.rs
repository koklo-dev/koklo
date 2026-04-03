//! Page 4: Conversation — main chat interface (80% usage).

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::monitor::components::{
    message_bubble::MessageSide,
    phase_progress::{self, PhaseSegment},
};
use crate::monitor::format::short_id;
use crate::monitor::layout::terminal_layout;
use crate::monitor::theme::{colors, icons, styles};
use crate::monitor::types::MonitorApp;
use crate::render::model::{
    build_transcript_render_model, RenderBlockBody, RenderBlockKind, RenderTone,
};

impl MonitorApp {
    pub(crate) fn render_conversation(&self, frame: &mut Frame, area: Rect) {
        let layout_mode = terminal_layout(area);

        // Sidebar (phases) + Main (messages)
        let content = match layout_mode {
            crate::monitor::types::TerminalLayout::Compact => Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(6), Constraint::Min(10)])
                .split(area),
            _ => Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Length(24), Constraint::Min(40)])
                .split(area),
        };

        // Phase sidebar
        let segments: Vec<PhaseSegment> = self
            .state
            .phases
            .iter()
            .map(|p| PhaseSegment::new(&p.phase, &p.status))
            .collect();
        let session_label = self
            .selected_session()
            .map(|s| short_id(&s.id))
            .unwrap_or_else(|| "—".to_string());
        phase_progress::render_phase_list(
            frame,
            content[0],
            &format!("Phases · {session_label}"),
            &segments,
            self.state.selected_phase,
            self.ui.focus == crate::monitor::types::Panel::Phases,
            self.ui.tick_count,
        );

        // Message area
        self.render_conversation_messages(frame, content[1]);
    }

    fn render_conversation_messages(&self, frame: &mut Frame, area: Rect) {
        let (display_phase, is_live) = self.display_phase_info();
        let filtered_logs = self.filtered_logs_for_selected_phase();

        let render_model = build_transcript_render_model(filtered_logs.iter().copied());
        let visible_height = area.height.saturating_sub(2) as usize;

        // Build styled message lines
        let mut all_lines: Vec<Line> = Vec::new();

        for block in &render_model.blocks {
            let (sender, side, sender_style) = match block.kind {
                RenderBlockKind::Assistant => (
                    block.source_kind.as_str(),
                    MessageSide::Left,
                    Style::default()
                        .fg(colors::INFO)
                        .add_modifier(Modifier::BOLD),
                ),
                RenderBlockKind::Approval | RenderBlockKind::UserInput => (
                    "Vous",
                    MessageSide::Right,
                    Style::default()
                        .fg(colors::ACCENT)
                        .add_modifier(Modifier::BOLD),
                ),
                RenderBlockKind::Tool | RenderBlockKind::Command => (
                    "Outil",
                    MessageSide::Left,
                    Style::default()
                        .fg(colors::WARNING)
                        .add_modifier(Modifier::BOLD),
                ),
                RenderBlockKind::Reasoning => (
                    "Réflexion",
                    MessageSide::Left,
                    Style::default()
                        .fg(colors::TEXT_MUTED)
                        .add_modifier(Modifier::ITALIC),
                ),
                _ => (
                    block.source_kind.as_str(),
                    MessageSide::Left,
                    Style::default().fg(colors::TEXT_SECONDARY),
                ),
            };

            let prefix = match side {
                MessageSide::Left => "▎ ",
                MessageSide::Right => "  ",
            };

            // Sender header
            let mut header_spans = vec![
                Span::styled(prefix, Style::default().fg(colors::BORDER)),
                Span::styled(sender, sender_style),
            ];
            if let Some(status) = &block.status {
                header_spans.push(Span::styled(format!("  [{}]", status), styles::muted()));
            }
            all_lines.push(Line::from(header_spans));

            // Body
            let body_style = match block.tone {
                RenderTone::Success => Style::default().fg(colors::SUCCESS),
                RenderTone::Warning => Style::default().fg(colors::WARNING),
                RenderTone::Error => Style::default().fg(colors::DANGER),
                RenderTone::Info => Style::default().fg(colors::INFO),
                RenderTone::Muted => styles::muted(),
                _ => Style::default().fg(colors::TEXT),
            };

            match &block.body {
                RenderBlockBody::Markdown(text) => {
                    for line in text.lines() {
                        all_lines.push(Line::from(vec![
                            Span::styled(prefix, Style::default().fg(colors::BORDER)),
                            Span::styled(format!(" {line}"), body_style),
                        ]));
                    }
                }
                RenderBlockBody::Lines(lines) => {
                    for line in lines {
                        all_lines.push(Line::from(vec![
                            Span::styled(prefix, Style::default().fg(colors::BORDER)),
                            Span::styled(format!(" {line}"), body_style),
                        ]));
                    }
                }
            }

            all_lines.push(Line::from(""));
        }

        // Apply scroll
        let total = all_lines.len();
        let start = total.saturating_sub(visible_height + self.state.log_scroll);
        let end = total.saturating_sub(self.state.log_scroll);
        let visible = &all_lines[start.min(total)..end.min(total)];

        let spinner = if is_live {
            format!(" {} ", icons::spinner_frame(self.ui.tick_count))
        } else {
            String::new()
        };

        let title = format!("Conversation · {display_phase}{spinner}");
        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                title,
                styles::title(self.ui.focus == crate::monitor::types::Panel::Log),
            ))
            .border_style(styles::border(
                self.ui.focus == crate::monitor::types::Panel::Log,
            ));

        let para = Paragraph::new(Text::from(visible.to_vec()))
            .block(block)
            .wrap(Wrap { trim: false });
        frame.render_widget(para, area);
    }
}
