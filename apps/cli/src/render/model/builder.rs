use self::accumulators::{CommandAccumulator, FileChangeAccumulator, TextAccumulator};
use super::*;

pub fn build_transcript_render_model<'a>(
    records: impl IntoIterator<Item = &'a TranscriptItemRecord>,
) -> TranscriptRenderModel {
    let mut blocks = Vec::new();
    let mut pending_text: Option<TextAccumulator> = None;
    let mut pending_command: Option<CommandAccumulator> = None;
    let mut pending_file_change: Option<FileChangeAccumulator> = None;
    let mut agent_name = None;

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

fn flush_text(pending: &mut Option<TextAccumulator>, out: &mut Vec<RenderBlock>) {
    if let Some(pending) = pending.take() {
        out.push(pending.into_block());
    }
}

fn flush_command(pending: &mut Option<CommandAccumulator>, out: &mut Vec<RenderBlock>) {
    if let Some(pending) = pending.take() {
        out.push(pending.into_block());
    }
}

fn flush_file_change(pending: &mut Option<FileChangeAccumulator>, out: &mut Vec<RenderBlock>) {
    if let Some(pending) = pending.take() {
        out.push(pending.into_block());
    }
}

pub(super) fn render_record(record: &TranscriptItemRecord) -> RenderBlock {
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

pub(super) fn prefix_lines(prefix: &str, text: &str) -> Vec<String> {
    text.lines()
        .map(|line| format!("{prefix} {line}"))
        .collect()
}

pub(super) fn format_tool_call(payload: &Option<Value>, record: &TranscriptItemRecord) -> String {
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

pub(super) fn format_tool_result(payload: &Option<Value>, record: &TranscriptItemRecord) -> String {
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

pub(super) fn choose_command_label(
    payload: Option<&Value>,
    record: &TranscriptItemRecord,
) -> String {
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

pub(super) fn looks_like_placeholder_command(command: &str, item_key: Option<&str>) -> bool {
    command.is_empty() || item_key.is_some_and(|item_key| item_key == command)
}

pub(super) fn tone_for_kind(kind: &str, status: &str) -> RenderTone {
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
