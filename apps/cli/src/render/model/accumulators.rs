use super::*;

#[derive(Debug, Clone)]
pub(super) struct TextAccumulator {
    kind: RenderBlockKind,
    tone: RenderTone,
    source_kind: String,
    status: Option<String>,
    markdown: bool,
    prefix: &'static str,
    item_key: Option<String>,
    seq: i64,
    created_at: Option<String>,
    pub(super) text: String,
}

impl TextAccumulator {
    pub(super) fn from_record(record: &TranscriptItemRecord) -> Option<Self> {
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

    pub(super) fn can_merge(&self, next: &Self) -> bool {
        self.kind == next.kind && self.item_key == next.item_key
    }

    pub(super) fn into_block(self) -> RenderBlock {
        let body = if self.markdown {
            RenderBlockBody::Markdown(self.text)
        } else {
            RenderBlockBody::Lines(
                self.text
                    .lines()
                    .map(|line| format!("{} {}", self.prefix, line))
                    .collect(),
            )
        };
        RenderBlock {
            kind: self.kind,
            tone: self.tone,
            source_kind: self.source_kind,
            status: self.status,
            item_key: self.item_key,
            seq: self.seq,
            created_at: self.created_at,
            body,
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct CommandAccumulator {
    item_key: Option<String>,
    seq: i64,
    created_at: Option<String>,
    command: String,
    output: String,
    tone: RenderTone,
    status: Option<String>,
}

impl CommandAccumulator {
    pub(super) fn from_record(record: &TranscriptItemRecord) -> Option<Self> {
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

    pub(super) fn can_merge(&self, next: &Self) -> bool {
        self.item_key.is_some() && self.item_key == next.item_key
    }

    pub(super) fn merge(&mut self, next: Self) {
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

    pub(super) fn into_block(self) -> RenderBlock {
        let mut lines = vec![format!("$ {}", self.command)];
        if !self.output.is_empty() {
            lines.extend(
                self.output
                    .lines()
                    .filter(|line| !line.is_empty())
                    .map(|line| format!("│ {}", line)),
            );
        }
        RenderBlock {
            kind: RenderBlockKind::Command,
            tone: self.tone,
            source_kind: "command".to_string(),
            status: self.status,
            item_key: self.item_key,
            seq: self.seq,
            created_at: self.created_at,
            body: RenderBlockBody::Lines(lines),
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct FileChangeAccumulator {
    item_key: Option<String>,
    seq: i64,
    created_at: Option<String>,
    lines: Vec<String>,
    tone: RenderTone,
    status: Option<String>,
}

impl FileChangeAccumulator {
    pub(super) fn from_record(record: &TranscriptItemRecord) -> Option<Self> {
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

    pub(super) fn can_merge(&self, next: &Self) -> bool {
        self.item_key.is_some() && self.item_key == next.item_key
    }

    pub(super) fn merge(&mut self, next: Self) {
        if self.lines.is_empty() || should_prefer_file_change_lines(&self.lines, &next.lines) {
            self.lines = next.lines;
        }
        self.seq = next.seq;
        self.tone = next.tone;
        self.status = next.status;
    }

    pub(super) fn into_block(self) -> RenderBlock {
        RenderBlock {
            kind: RenderBlockKind::FileChange,
            tone: self.tone,
            source_kind: "file_change".to_string(),
            status: self.status,
            item_key: self.item_key,
            seq: self.seq,
            created_at: self.created_at,
            body: RenderBlockBody::Lines(self.lines),
        }
    }
}
