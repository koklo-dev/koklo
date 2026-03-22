//! Provider-agnostic transcript render model.
//!
//! This module converts persisted transcript items into a small display model
//! that does not depend on ratatui. The TUI and plain-text follow mode both
//! render from this same model.

use koklo_storage::TranscriptItemRecord;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderTone {
    Default,
    Muted,
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderBlockKind {
    Assistant,
    Reasoning,
    Plan,
    Tool,
    Command,
    FileChange,
    Approval,
    UserInput,
    Usage,
    Lifecycle,
    Metadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RenderBlockBody {
    Markdown(String),
    Lines(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderBlock {
    pub kind: RenderBlockKind,
    pub tone: RenderTone,
    pub source_kind: String,
    pub status: Option<String>,
    pub item_key: Option<String>,
    pub seq: i64,
    pub created_at: Option<String>,
    pub body: RenderBlockBody,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TranscriptRenderModel {
    pub agent_name: Option<String>,
    pub blocks: Vec<RenderBlock>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TranscriptLiveModel {
    pub agent_name: Option<String>,
    pub latest_assistant: Option<RenderBlock>,
    pub latest_thinking: Option<RenderBlock>,
    pub latest_activity: Option<RenderBlock>,
    pub recent_activity: Vec<RenderBlock>,
    pub pending: Vec<RenderBlock>,
}

impl TranscriptRenderModel {
    pub fn live_model(&self) -> TranscriptLiveModel {
        let latest_assistant = self
            .blocks
            .iter()
            .rev()
            .find(|block| block.kind == RenderBlockKind::Assistant)
            .cloned();
        let latest_thinking = self
            .blocks
            .iter()
            .rev()
            .find(|block| {
                matches!(
                    block.kind,
                    RenderBlockKind::Reasoning | RenderBlockKind::Plan
                )
            })
            .cloned();
        let mut recent_activity = self
            .blocks
            .iter()
            .rev()
            .filter(|block| {
                matches!(
                    block.kind,
                    RenderBlockKind::Tool | RenderBlockKind::Command | RenderBlockKind::FileChange
                )
            })
            .take(3)
            .cloned()
            .collect::<Vec<_>>();
        recent_activity.reverse();

        if recent_activity.is_empty() {
            recent_activity = self
                .blocks
                .iter()
                .rev()
                .filter(|block| {
                    matches!(
                        block.kind,
                        RenderBlockKind::Usage
                            | RenderBlockKind::Lifecycle
                            | RenderBlockKind::Metadata
                    )
                })
                .take(2)
                .cloned()
                .collect::<Vec<_>>();
            recent_activity.reverse();
        }

        let latest_activity = recent_activity.last().cloned();

        let mut resolved_approvals = HashSet::new();
        let mut resolved_user_inputs = HashSet::new();
        let mut pending = Vec::new();

        for block in self.blocks.iter().rev() {
            match block.source_kind.as_str() {
                "approval_decision" => {
                    if let Some(item_key) = &block.item_key {
                        resolved_approvals.insert(item_key.clone());
                    }
                }
                "user_input_response" => {
                    if let Some(item_key) = &block.item_key {
                        resolved_user_inputs.insert(item_key.clone());
                    }
                }
                "approval_request" => {
                    let unresolved = block
                        .item_key
                        .as_ref()
                        .map(|item_key| !resolved_approvals.contains(item_key))
                        .unwrap_or(true);
                    if unresolved {
                        pending.push(block.clone());
                    }
                }
                "user_input_request" => {
                    let unresolved = block
                        .item_key
                        .as_ref()
                        .map(|item_key| !resolved_user_inputs.contains(item_key))
                        .unwrap_or(true);
                    if unresolved {
                        pending.push(block.clone());
                    }
                }
                _ => {}
            }
        }

        pending.reverse();

        TranscriptLiveModel {
            agent_name: self.agent_name.clone(),
            latest_assistant,
            latest_thinking,
            latest_activity,
            recent_activity,
            pending,
        }
    }
}

pub fn build_transcript_render_model<'a>(
    records: impl IntoIterator<Item = &'a TranscriptItemRecord>,
) -> TranscriptRenderModel {
    let mut blocks = Vec::new();
    let mut pending_text: Option<TextAccumulator> = None;
    let mut pending_command: Option<CommandAccumulator> = None;
    let mut pending_file_change: Option<FileChangeAccumulator> = None;
    let mut agent_name = None;

    let flush_text = |pending: &mut Option<TextAccumulator>, out: &mut Vec<RenderBlock>| {
        if let Some(pending) = pending.take() {
            let body = if pending.markdown {
                RenderBlockBody::Markdown(pending.text)
            } else {
                RenderBlockBody::Lines(
                    pending
                        .text
                        .lines()
                        .map(|line| format!("{} {}", pending.prefix, line))
                        .collect(),
                )
            };
            out.push(RenderBlock {
                kind: pending.kind,
                tone: pending.tone,
                source_kind: pending.source_kind,
                status: pending.status,
                item_key: pending.item_key,
                seq: pending.seq,
                created_at: pending.created_at,
                body,
            });
        }
    };

    let flush_command = |pending: &mut Option<CommandAccumulator>, out: &mut Vec<RenderBlock>| {
        if let Some(pending) = pending.take() {
            let mut lines = vec![format!("$ {}", pending.command)];
            if !pending.output.is_empty() {
                lines.extend(
                    pending
                        .output
                        .lines()
                        .filter(|line| !line.is_empty())
                        .map(|line| format!("│ {}", line)),
                );
            }
            out.push(RenderBlock {
                kind: RenderBlockKind::Command,
                tone: pending.tone,
                source_kind: "command".to_string(),
                status: pending.status,
                item_key: pending.item_key,
                seq: pending.seq,
                created_at: pending.created_at,
                body: RenderBlockBody::Lines(lines),
            });
        }
    };

    let flush_file_change = |pending: &mut Option<FileChangeAccumulator>,
                             out: &mut Vec<RenderBlock>| {
        if let Some(pending) = pending.take() {
            out.push(RenderBlock {
                kind: RenderBlockKind::FileChange,
                tone: pending.tone,
                source_kind: "file_change".to_string(),
                status: pending.status,
                item_key: pending.item_key,
                seq: pending.seq,
                created_at: pending.created_at,
                body: RenderBlockBody::Lines(pending.lines),
            });
        }
    };

    for record in records {
        if agent_name.is_none() {
            agent_name = record.agent_name.clone();
        } else if let Some(name) = &record.agent_name {
            agent_name = Some(name.clone());
        }

        if record.kind == "message" && record.summary == "message completed" {
            continue;
        }

        if let Some(next) = TextAccumulator::from_record(record) {
            flush_file_change(&mut pending_file_change, &mut blocks);
            flush_command(&mut pending_command, &mut blocks);
            if pending_text
                .as_ref()
                .map(|current| current.can_merge(&next))
                .unwrap_or(false)
            {
                if let Some(current) = pending_text.as_mut() {
                    current.text.push_str(&next.text);
                }
            } else {
                flush_text(&mut pending_text, &mut blocks);
                pending_text = Some(next);
            }
            continue;
        }

        if let Some(next) = FileChangeAccumulator::from_record(record) {
            flush_text(&mut pending_text, &mut blocks);
            flush_command(&mut pending_command, &mut blocks);
            if pending_file_change
                .as_ref()
                .map(|current| current.can_merge(&next))
                .unwrap_or(false)
            {
                if let Some(current) = pending_file_change.as_mut() {
                    current.merge(next);
                }
            } else {
                flush_file_change(&mut pending_file_change, &mut blocks);
                pending_file_change = Some(next);
            }
            continue;
        }

        if let Some(next) = CommandAccumulator::from_record(record) {
            flush_text(&mut pending_text, &mut blocks);
            flush_file_change(&mut pending_file_change, &mut blocks);
            if pending_command
                .as_ref()
                .map(|current| current.can_merge(&next))
                .unwrap_or(false)
            {
                if let Some(current) = pending_command.as_mut() {
                    current.merge(next);
                }
            } else {
                flush_command(&mut pending_command, &mut blocks);
                pending_command = Some(next);
            }
            continue;
        }

        flush_text(&mut pending_text, &mut blocks);
        flush_command(&mut pending_command, &mut blocks);
        flush_file_change(&mut pending_file_change, &mut blocks);
        blocks.push(render_record(record));
    }

    flush_text(&mut pending_text, &mut blocks);
    flush_command(&mut pending_command, &mut blocks);
    flush_file_change(&mut pending_file_change, &mut blocks);

    TranscriptRenderModel { agent_name, blocks }
}

#[derive(Debug, Clone)]
struct TextAccumulator {
    kind: RenderBlockKind,
    tone: RenderTone,
    source_kind: String,
    status: Option<String>,
    markdown: bool,
    prefix: &'static str,
    item_key: Option<String>,
    seq: i64,
    created_at: Option<String>,
    text: String,
}

impl TextAccumulator {
    fn from_record(record: &TranscriptItemRecord) -> Option<Self> {
        match record.kind.as_str() {
            "message_delta" => Some(Self {
                kind: RenderBlockKind::Assistant,
                tone: RenderTone::Default,
                source_kind: record.kind.clone(),
                status: Some(record.status.clone()),
                markdown: true,
                prefix: "",
                item_key: record.item_key.clone(),
                seq: record.seq,
                created_at: Some(record.created_at.clone()),
                text: record.summary.clone(),
            }),
            "reasoning" => Some(Self {
                kind: RenderBlockKind::Reasoning,
                tone: RenderTone::Info,
                source_kind: record.kind.clone(),
                status: Some(record.status.clone()),
                markdown: false,
                prefix: "⋯",
                item_key: record.item_key.clone(),
                seq: record.seq,
                created_at: Some(record.created_at.clone()),
                text: record.summary.clone(),
            }),
            "plan" => Some(Self {
                kind: RenderBlockKind::Plan,
                tone: RenderTone::Info,
                source_kind: record.kind.clone(),
                status: Some(record.status.clone()),
                markdown: false,
                prefix: "☰",
                item_key: record.item_key.clone(),
                seq: record.seq,
                created_at: Some(record.created_at.clone()),
                text: record.summary.clone(),
            }),
            _ => None,
        }
    }

    fn can_merge(&self, next: &Self) -> bool {
        self.kind == next.kind && self.item_key == next.item_key
    }
}

#[derive(Debug, Clone)]
struct CommandAccumulator {
    item_key: Option<String>,
    seq: i64,
    created_at: Option<String>,
    command: String,
    output: String,
    tone: RenderTone,
    status: Option<String>,
}

impl CommandAccumulator {
    fn from_record(record: &TranscriptItemRecord) -> Option<Self> {
        if record.kind != "command" {
            return None;
        }
        let payload = record.payload();
        let command = choose_command_label(payload.as_ref(), record);
        let output = payload
            .as_ref()
            .and_then(|payload| payload.get("output"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        Some(Self {
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            command,
            output,
            tone: tone_for_kind(&record.kind, &record.status),
            status: Some(record.status.clone()),
        })
    }

    fn can_merge(&self, next: &Self) -> bool {
        self.item_key.is_some() && self.item_key == next.item_key
    }

    fn merge(&mut self, next: Self) {
        if !looks_like_placeholder_command(&next.command, next.item_key.as_deref()) {
            self.command = next.command;
        }
        if !next.output.is_empty() {
            self.output.push_str(&next.output);
        }
        self.seq = next.seq;
        self.tone = next.tone;
        self.status = next.status;
    }
}

#[derive(Debug, Clone)]
struct FileChangeAccumulator {
    item_key: Option<String>,
    seq: i64,
    created_at: Option<String>,
    lines: Vec<String>,
    tone: RenderTone,
    status: Option<String>,
}

impl FileChangeAccumulator {
    fn from_record(record: &TranscriptItemRecord) -> Option<Self> {
        if record.kind != "file_change" {
            return None;
        }

        Some(Self {
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            lines: format_file_change(&record.payload(), record),
            tone: tone_for_kind(&record.kind, &record.status),
            status: Some(record.status.clone()),
        })
    }

    fn can_merge(&self, next: &Self) -> bool {
        self.item_key.is_some() && self.item_key == next.item_key
    }

    fn merge(&mut self, next: Self) {
        if self.lines.is_empty() || should_prefer_file_change_lines(&self.lines, &next.lines) {
            self.lines = next.lines;
        }
        self.seq = next.seq;
        self.tone = next.tone;
        self.status = next.status;
    }
}

fn should_prefer_file_change_lines(current: &[String], next: &[String]) -> bool {
    let current_signal = file_change_line_score(current);
    let next_signal = file_change_line_score(next);
    next_signal > current_signal || (next_signal == current_signal && next.len() >= current.len())
}

fn file_change_line_score(lines: &[String]) -> usize {
    lines.iter().fold(0, |score, line| {
        score
            + if looks_like_diff_line(line) {
                4
            } else if line.starts_with("● ") {
                2
            } else if !line.trim().is_empty() {
                1
            } else {
                0
            }
    })
}

fn render_record(record: &TranscriptItemRecord) -> RenderBlock {
    let payload = record.payload();
    let tone = tone_for_kind(&record.kind, &record.status);

    match record.kind.as_str() {
        "tool_call" => RenderBlock {
            kind: RenderBlockKind::Tool,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(vec![format!("⚙ {}", format_tool_call(&payload, record))]),
        },
        "tool_result" => RenderBlock {
            kind: RenderBlockKind::Tool,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(vec![format!(
                "↳ {}",
                format_tool_result(&payload, record)
            )]),
        },
        "file_change" => RenderBlock {
            kind: RenderBlockKind::FileChange,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(format_file_change(&payload, record)),
        },
        "approval_request" | "approval_decision" => RenderBlock {
            kind: RenderBlockKind::Approval,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(
                record
                    .summary
                    .lines()
                    .map(|line| {
                        format!(
                            "{} {}",
                            if record.kind == "approval_request" {
                                "?"
                            } else {
                                "✓"
                            },
                            line
                        )
                    })
                    .collect(),
            ),
        },
        "user_input_request" | "user_input_response" => RenderBlock {
            kind: RenderBlockKind::UserInput,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(
                record
                    .summary
                    .lines()
                    .map(|line| {
                        format!(
                            "{} {}",
                            if record.kind == "user_input_request" {
                                "?"
                            } else {
                                "✓"
                            },
                            line
                        )
                    })
                    .collect(),
            ),
        },
        "usage" => RenderBlock {
            kind: RenderBlockKind::Usage,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(prefix_lines("◷", &record.summary)),
        },
        "phase_lifecycle" | "session_lifecycle" => RenderBlock {
            kind: RenderBlockKind::Lifecycle,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(prefix_lines(
                if record.kind == "session_lifecycle" {
                    "■"
                } else {
                    "•"
                },
                &record.summary,
            )),
        },
        "message" => RenderBlock {
            kind: RenderBlockKind::Metadata,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(prefix_lines("·", &record.summary)),
        },
        _ => RenderBlock {
            kind: RenderBlockKind::Metadata,
            tone,
            source_kind: record.kind.clone(),
            status: Some(record.status.clone()),
            item_key: record.item_key.clone(),
            seq: record.seq,
            created_at: Some(record.created_at.clone()),
            body: RenderBlockBody::Lines(prefix_lines("·", &record.summary)),
        },
    }
}

fn prefix_lines(prefix: &str, text: &str) -> Vec<String> {
    text.lines()
        .map(|line| format!("{prefix} {line}"))
        .collect()
}

fn format_tool_call(payload: &Option<Value>, record: &TranscriptItemRecord) -> String {
    let tool_name = payload
        .as_ref()
        .and_then(|payload| payload.get("tool_name"))
        .and_then(Value::as_str)
        .unwrap_or("tool");
    let input_summary = payload
        .as_ref()
        .and_then(|payload| payload.get("input_summary"))
        .and_then(Value::as_str)
        .unwrap_or(record.summary.as_str());
    let tool_kind = payload
        .as_ref()
        .and_then(|payload| payload.get("tool_kind"))
        .and_then(Value::as_str)
        .unwrap_or("other");

    match tool_kind {
        "read" => format!("Read {}", input_summary),
        "search" => format!("Search {}", input_summary),
        "edit" => format!("Edit {}", input_summary),
        "write" => format!("Write {}", input_summary),
        "command" => format!("Run {}", input_summary),
        "user_input" => format!("Ask user {}", input_summary),
        "mcp" => format!("Call {} {}", tool_name, input_summary),
        _ => {
            if input_summary.is_empty() {
                format!("Call {}", tool_name)
            } else {
                format!("Call {} {}", tool_name, input_summary)
            }
        }
    }
}

fn format_tool_result(payload: &Option<Value>, record: &TranscriptItemRecord) -> String {
    let tool_name = payload
        .as_ref()
        .and_then(|payload| payload.get("tool_name"))
        .and_then(Value::as_str)
        .unwrap_or("tool");
    let output_summary = payload
        .as_ref()
        .and_then(|payload| payload.get("output_summary"))
        .and_then(Value::as_str)
        .unwrap_or(record.summary.as_str());

    if record.status == "failed" {
        format!("{tool_name} failed: {output_summary}")
    } else {
        format!("{tool_name} {output_summary}")
    }
}

fn format_file_change(payload: &Option<Value>, record: &TranscriptItemRecord) -> Vec<String> {
    if let Some(lines) = payload
        .as_ref()
        .map(extract_file_change_details)
        .filter(|lines| !lines.is_empty())
    {
        return lines;
    }

    if let Some(files) = payload
        .as_ref()
        .and_then(|payload| payload.get("files"))
        .and_then(Value::as_array)
    {
        let file_lines: Vec<String> = files
            .iter()
            .filter_map(Value::as_str)
            .map(|path| format!("Δ {}", path))
            .collect();
        if !file_lines.is_empty() {
            let mut lines = if file_change_summary_has_signal(&record.summary) {
                format_file_change_summary(&record.summary)
            } else {
                Vec::new()
            };
            lines.extend(file_lines);
            return lines;
        }
    }
    format_file_change_summary(&record.summary)
}

fn format_file_change_summary(summary: &str) -> Vec<String> {
    let lines = summary
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return vec!["Δ file changes".to_string()];
    }

    if lines.iter().any(|line| looks_like_diff_line(line)) {
        return lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| {
                if idx == 0 && !looks_like_diff_line(line) {
                    format!("● {line}")
                } else {
                    line.to_string()
                }
            })
            .collect();
    }

    lines.into_iter().map(|line| format!("Δ {line}")).collect()
}

fn extract_file_change_details(payload: &Value) -> Vec<String> {
    let mut lines = Vec::new();
    let mut saw_detail = false;

    if let Some(delta) = payload
        .get("details")
        .and_then(|details| details.get("delta"))
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        lines.extend(format_file_change_summary(delta));
        saw_detail = true;
    }

    let changes = payload
        .get("changes")
        .or_else(|| {
            payload
                .get("details")
                .and_then(|details| details.get("changes"))
        })
        .and_then(Value::as_array);

    if let Some(changes) = changes {
        for change in changes {
            let mut change_lines = extract_change_entry_lines(change);
            if !change_lines.is_empty() {
                saw_detail = true;
                lines.append(&mut change_lines);
            }
        }
    }

    if saw_detail {
        dedupe_adjacent_lines(lines)
    } else {
        Vec::new()
    }
}

fn extract_change_entry_lines(change: &Value) -> Vec<String> {
    let mut lines = Vec::new();

    if let Some(path) = change
        .get("path")
        .or_else(|| change.get("filePath"))
        .and_then(Value::as_str)
        .filter(|path| !path.trim().is_empty())
    {
        let verb = change
            .get("kind")
            .or_else(|| change.get("status"))
            .or_else(|| change.get("action"))
            .and_then(Value::as_str)
            .unwrap_or("Update");
        lines.push(format!("● {}({})", title_case_word(verb), path));
    }

    if let Some(diff) = change
        .get("patch")
        .or_else(|| change.get("diff"))
        .or_else(|| change.get("unifiedDiff"))
        .and_then(Value::as_str)
    {
        lines.extend(diff.lines().map(str::to_string));
    }

    if let Some(snippet_lines) = change
        .get("lines")
        .or_else(|| change.get("preview"))
        .and_then(Value::as_array)
    {
        for line in snippet_lines {
            if let Some(text) = line.as_str().filter(|text| !text.trim().is_empty()) {
                lines.push(text.to_string());
            } else if let Some(text) = line
                .get("text")
                .or_else(|| line.get("line"))
                .and_then(Value::as_str)
                .filter(|text| !text.trim().is_empty())
            {
                lines.push(text.to_string());
            }
        }
    }

    if let Some(removed) = change.get("removed").and_then(Value::as_array) {
        for line in removed.iter().filter_map(Value::as_str) {
            lines.push(format!("- {}", line));
        }
    }

    if let Some(added) = change.get("added").and_then(Value::as_array) {
        for line in added.iter().filter_map(Value::as_str) {
            lines.push(format!("+ {}", line));
        }
    }

    lines
}

fn dedupe_adjacent_lines(lines: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::with_capacity(lines.len());
    for line in lines {
        if deduped.last() != Some(&line) {
            deduped.push(line);
        }
    }
    deduped
}

fn title_case_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => {
            let mut out = String::new();
            out.extend(first.to_uppercase());
            out.push_str(&chars.as_str().to_ascii_lowercase());
            out
        }
        None => "Update".to_string(),
    }
}

fn file_change_summary_has_signal(summary: &str) -> bool {
    summary
        .lines()
        .any(|line| !line.trim().is_empty() && !looks_like_file_path(line.trim()))
}

fn looks_like_diff_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with('+')
        || trimmed.starts_with('-')
        || trimmed.starts_with("@@")
        || trimmed.starts_with("…")
        || trimmed.starts_with("⎿")
}

fn looks_like_file_path(line: &str) -> bool {
    line.contains('/') || line.ends_with(".rs") || line.ends_with(".toml") || line.ends_with(".md")
}

fn choose_command_label(payload: Option<&Value>, record: &TranscriptItemRecord) -> String {
    let payload_command = payload
        .and_then(|payload| payload.get("command"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if looks_like_placeholder_command(payload_command, record.item_key.as_deref()) {
        if record.summary.is_empty() {
            "command".to_string()
        } else {
            record.summary.clone()
        }
    } else {
        payload_command.to_string()
    }
}

fn looks_like_placeholder_command(command: &str, item_key: Option<&str>) -> bool {
    command.is_empty() || item_key.is_some_and(|item_key| item_key == command)
}

fn tone_for_kind(kind: &str, status: &str) -> RenderTone {
    match kind {
        "tool_call" => RenderTone::Warning,
        "tool_result" => {
            if status == "failed" {
                RenderTone::Error
            } else {
                RenderTone::Success
            }
        }
        "reasoning" | "plan" => RenderTone::Info,
        "command" => {
            if status == "failed" {
                RenderTone::Error
            } else {
                RenderTone::Warning
            }
        }
        "file_change" => {
            if status == "failed" {
                RenderTone::Error
            } else {
                RenderTone::Info
            }
        }
        "approval_request" | "user_input_request" => RenderTone::Warning,
        "approval_decision" | "user_input_response" => RenderTone::Success,
        "usage" | "phase_lifecycle" | "session_lifecycle" => RenderTone::Muted,
        _ => RenderTone::Default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(kind: &str, summary: &str) -> TranscriptItemRecord {
        TranscriptItemRecord {
            id: "id-1".to_string(),
            session_id: "session-1".to_string(),
            phase: Some("implement".to_string()),
            agent_name: Some("developer".to_string()),
            source: "agent".to_string(),
            kind: kind.to_string(),
            status: "streaming".to_string(),
            item_key: None,
            summary: summary.to_string(),
            payload_json: None,
            seq: 1,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn merges_assistant_message_deltas_into_one_markdown_block() {
        let first = record("message_delta", "Hello ");
        let second = record("message_delta", "world");

        let model = build_transcript_render_model([&first, &second]);

        assert_eq!(model.blocks.len(), 1);
        assert!(matches!(
            &model.blocks[0].body,
            RenderBlockBody::Markdown(text) if text == "Hello world"
        ));
    }

    #[test]
    fn renders_tool_call_from_canonical_payload() {
        let mut tool = record("tool_call", "Read Cargo.toml");
        tool.status = "pending".to_string();
        tool.payload_json = Some(
            serde_json::json!({
                "tool_name": "Read",
                "tool_kind": "read",
                "input_summary": "Cargo.toml",
            })
            .to_string(),
        );

        let model = build_transcript_render_model([&tool]);

        assert_eq!(model.blocks.len(), 1);
        assert!(matches!(
            &model.blocks[0].body,
            RenderBlockBody::Lines(lines) if lines == &vec!["⚙ Read Cargo.toml".to_string()]
        ));
    }

    #[test]
    fn merges_command_updates_by_item_key() {
        let mut first = record("command", "cmd-1");
        first.item_key = Some("cmd-1".to_string());
        first.payload_json = Some(
            serde_json::json!({
                "command": "cmd-1",
                "output": "line 1\n",
            })
            .to_string(),
        );

        let mut second = record("command", "cargo test");
        second.item_key = Some("cmd-1".to_string());
        second.status = "completed".to_string();
        second.payload_json = Some(
            serde_json::json!({
                "command": "cargo test",
                "output": "line 2\n",
            })
            .to_string(),
        );

        let model = build_transcript_render_model([&first, &second]);

        assert_eq!(model.blocks.len(), 1);
        assert!(matches!(
            &model.blocks[0].body,
            RenderBlockBody::Lines(lines)
                if lines == &vec![
                    "$ cargo test".to_string(),
                    "│ line 1".to_string(),
                    "│ line 2".to_string(),
                ]
        ));
    }

    #[test]
    fn merges_file_change_updates_by_item_key() {
        let mut first = record("file_change", "src/lib.rs");
        first.item_key = Some("edit-1".to_string());
        first.payload_json = Some(
            serde_json::json!({
                "summary": "src/lib.rs",
                "changes": [{
                    "path": "src/lib.rs",
                    "kind": "update",
                    "removed": ["old line"],
                    "added": ["new line"]
                }]
            })
            .to_string(),
        );

        let mut second = record("file_change", "ok");
        second.item_key = Some("edit-1".to_string());
        second.status = "completed".to_string();
        second.payload_json = Some(
            serde_json::json!({
                "summary": "ok",
                "files": ["src/lib.rs"]
            })
            .to_string(),
        );

        let model = build_transcript_render_model([&first, &second]);

        assert_eq!(model.blocks.len(), 1);
        assert!(matches!(
            &model.blocks[0].body,
            RenderBlockBody::Lines(lines)
                if lines.iter().any(|line| line == "● Update(src/lib.rs)")
                    && lines.iter().any(|line| line == "- old line")
                    && lines.iter().any(|line| line == "+ new line")
        ));
    }

    #[test]
    fn live_model_exposes_latest_assistant_thinking_and_activity() {
        let assistant = record("message_delta", "Final answer");
        let reasoning = record("reasoning", "Inspecting files");
        let mut tool = record("tool_call", "Read Cargo.toml");
        tool.payload_json = Some(
            serde_json::json!({
                "tool_name": "Read",
                "tool_kind": "read",
                "input_summary": "Cargo.toml",
            })
            .to_string(),
        );

        let model = build_transcript_render_model([&reasoning, &tool, &assistant]);
        let live = model.live_model();

        assert!(matches!(
            live.latest_assistant
                .as_ref()
                .and_then(|block| match &block.body {
                    RenderBlockBody::Markdown(text) => Some(text.as_str()),
                    _ => None,
                }),
            Some("Final answer")
        ));
        assert_eq!(
            live.latest_thinking.as_ref().map(|block| block.kind),
            Some(RenderBlockKind::Reasoning)
        );
        assert_eq!(
            live.latest_activity.as_ref().map(|block| block.kind),
            Some(RenderBlockKind::Tool)
        );
        assert_eq!(live.recent_activity.len(), 1);
        assert_eq!(live.recent_activity[0].kind, RenderBlockKind::Tool);
    }

    #[test]
    fn live_model_prioritizes_recent_actionable_activity_over_lifecycle() {
        let mut command = record("command", "cargo test -p koklo-cli");
        command.item_key = Some("cmd-1".to_string());
        command.status = "completed".to_string();
        command.payload_json = Some(
            serde_json::json!({
                "command": "cargo test -p koklo-cli",
                "output": "ok\n",
            })
            .to_string(),
        );

        let mut lifecycle = record("phase_lifecycle", "phase implement completed");
        lifecycle.status = "completed".to_string();

        let model = build_transcript_render_model([&command, &lifecycle]);
        let live = model.live_model();

        assert_eq!(live.recent_activity.len(), 1);
        assert_eq!(live.recent_activity[0].kind, RenderBlockKind::Command);
        assert_eq!(
            live.latest_activity.as_ref().map(|block| block.kind),
            Some(RenderBlockKind::Command)
        );
    }

    #[test]
    fn live_model_keeps_only_unresolved_pending_requests() {
        let mut approval_request = record("approval_request", "Approve command");
        approval_request.item_key = Some("approval-1".to_string());

        let mut approval_decision = record("approval_decision", "Approved");
        approval_decision.item_key = Some("approval-1".to_string());

        let mut user_input_request = record("user_input_request", "Need API key");
        user_input_request.item_key = Some("input-1".to_string());

        let model = build_transcript_render_model([
            &approval_request,
            &approval_decision,
            &user_input_request,
        ]);
        let live = model.live_model();

        assert_eq!(live.pending.len(), 1);
        assert_eq!(live.pending[0].source_kind, "user_input_request");
        assert_eq!(live.pending[0].item_key.as_deref(), Some("input-1"));
    }

    #[test]
    fn file_change_payload_preserves_structured_diff_details() {
        let mut file_change = record("file_change", "updated renderer");
        file_change.status = "completed".to_string();
        file_change.payload_json = Some(
            serde_json::json!({
                "summary": "updated renderer",
                "files": ["apps/cli/src/monitor.rs"],
                "changes": [{
                    "path": "apps/cli/src/monitor.rs",
                    "kind": "update",
                    "patch": "@@ -1,2 +1,2 @@\n-old line\n+new line"
                }]
            })
            .to_string(),
        );

        let model = build_transcript_render_model([&file_change]);

        assert!(matches!(
            &model.blocks[0].body,
            RenderBlockBody::Lines(lines)
                if lines.iter().any(|line| line == "● Update(apps/cli/src/monitor.rs)")
                    && lines.iter().any(|line| line == "-old line")
                    && lines.iter().any(|line| line == "+new line")
        ));
    }
}
