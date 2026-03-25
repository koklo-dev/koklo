use super::*;

#[derive(Debug, Clone)]
pub struct PlainRenderEngine {
    records: Vec<TranscriptItemRecord>,
    rendered_blocks: Vec<RenderBlock>,
    timestamps: bool,
}

impl PlainRenderEngine {
    pub fn new(timestamps: bool) -> Self {
        Self {
            records: Vec::new(),
            rendered_blocks: Vec::new(),
            timestamps,
        }
    }

    pub fn push_record(&mut self, record: TranscriptItemRecord) -> String {
        self.push_records([record])
    }

    pub fn push_records<I>(&mut self, records: I) -> String
    where
        I: IntoIterator<Item = TranscriptItemRecord>,
    {
        self.records.extend(records);
        let next_model = build_transcript_render_model(self.records.iter());
        let rendered = render_delta(&self.rendered_blocks, &next_model.blocks, self.timestamps);
        self.rendered_blocks = next_model.blocks;
        rendered
    }
}

fn render_delta(previous: &[RenderBlock], next: &[RenderBlock], timestamps: bool) -> String {
    let mut first_changed = 0usize;
    while first_changed < previous.len()
        && first_changed < next.len()
        && previous[first_changed] == next[first_changed]
    {
        first_changed += 1;
    }

    if first_changed == next.len() {
        return String::new();
    }

    let mut output = String::new();
    let mut next_index = first_changed;

    if first_changed < previous.len() {
        if let Some(delta) =
            render_incremental_block(&previous[first_changed], &next[first_changed], timestamps)
        {
            output.push_str(&delta);
            next_index += 1;
        }
    }

    for block in &next[next_index..] {
        output.push_str(&render_block(block, timestamps));
    }

    output
}

pub(super) fn render_incremental_block(
    previous: &RenderBlock,
    next: &RenderBlock,
    timestamps: bool,
) -> Option<String> {
    if !same_block_stream(previous, next) {
        return None;
    }

    match (&previous.body, &next.body) {
        (RenderBlockBody::Markdown(old), RenderBlockBody::Markdown(new))
            if new.starts_with(old) =>
        {
            Some(new[old.len()..].to_string())
        }
        (RenderBlockBody::Lines(old), RenderBlockBody::Lines(new))
            if new.len() >= old.len() && new[..old.len()] == old[..] =>
        {
            Some(render_lines(
                next.created_at.as_deref(),
                &new[old.len()..],
                timestamps,
            ))
        }
        _ => None,
    }
}

pub(super) fn render_block(block: &RenderBlock, timestamps: bool) -> String {
    match &block.body {
        RenderBlockBody::Markdown(text) => text.clone(),
        RenderBlockBody::Lines(lines) => {
            render_lines(block.created_at.as_deref(), lines, timestamps)
        }
    }
}

fn render_lines(created_at: Option<&str>, lines: &[String], timestamps: bool) -> String {
    let mut rendered = String::new();
    let time = created_at
        .and_then(|value| value.get(11..19))
        .unwrap_or("??:??:??");

    for line in lines {
        if timestamps {
            rendered.push_str(&format!("[{time}] {line}\n"));
        } else {
            rendered.push_str(line);
            rendered.push('\n');
        }
    }

    rendered
}

pub(super) fn same_block_stream(previous: &RenderBlock, next: &RenderBlock) -> bool {
    previous.kind == next.kind
        && previous.source_kind == next.source_kind
        && previous.item_key == next.item_key
}
