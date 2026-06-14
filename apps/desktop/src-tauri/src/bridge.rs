//! EventBus → desktop window bridge (Sprint 007 / US-015, roadmap P2 §1).
//!
//! The pipeline already publishes every transcript line on a [`koklo_events::EventBus`]
//! broadcast channel. The live Transcript view needs those lines pushed into the Tauri
//! window as they happen. This module is the **Interface adapter** that does exactly that
//! and nothing more: it maps a [`PipelineEvent::Transcript`] onto the same
//! [`TranscriptLineDto`] wire shape the snapshot queries return, then hands it to a sink.
//!
//! "The window" is modeled behind the [`TranscriptSink`] port. In production a thin wrapper
//! over `tauri::Window` (`Emitter::emit`) implements it; that wrapper lands with the Tauri
//! command runtime in a later P2 sprint. Modeling the window as a port is what lets the
//! whole bridge — including the EventBus pump — be unit-tested without booting Tauri.

use crate::ipc::TranscriptLineDto;
use koklo_events::{PipelineEvent, TranscriptItem};
use koklo_storage::TranscriptItemRecord;
use tokio::sync::broadcast;

/// Tauri event channel the live transcript subscription listens on. Mirrors
/// `contract.transcript.subscribe.event` on the TS side. One channel carries every
/// session's lines; the client filters by `line.sessionId` (see US-014).
///
/// Tauri event names forbid `.` (only alphanumerics, `-`, `/`, `:`, `_` are allowed),
/// so the separator is `:` — this MUST match the TS contract's `subscribe.event`.
pub const TRANSCRIPT_CHANNEL: &str = "transcript:subscribe";

/// The window the bridge emits into. The production impl forwards to
/// `tauri::Emitter::emit(channel, line)`; tests use a recording sink.
pub trait TranscriptSink {
    /// Push one serialized transcript line onto `channel`.
    fn emit_line(&self, channel: &str, line: &TranscriptLineDto) -> anyhow::Result<()>;
}

/// Snake_case label matching `koklo_storage`'s persistence form, so a line streamed
/// live and the same line later read back from SQLite carry identical
/// `kind`/`source`/`status` strings. Mirrors storage's (private) `enum_label`.
fn enum_label(value: &impl std::fmt::Debug) -> String {
    let debug = format!("{value:?}");
    let mut out = String::with_capacity(debug.len() + 4);
    for (idx, ch) in debug.chars().enumerate() {
        if ch.is_ascii_uppercase() {
            if idx > 0 {
                out.push('_');
            }
            out.push(ch.to_ascii_lowercase());
        } else {
            out.push(ch);
        }
    }
    out
}

/// Project a live [`TranscriptItem`] into the wire DTO.
///
/// `seq` is `0` — a sentinel meaning "live, pre-cursor". Live events have no stable
/// per-session sequence until persisted; the client replays authoritative seqs via
/// `transcript.since` on reconnect (US-014). We rebuild a [`TranscriptItemRecord`]
/// (its fields are public) and reuse the existing `TranscriptLineDto` mapper so the
/// field projection lives in exactly one place.
pub fn line_from_live(item: &TranscriptItem, created_at: String) -> TranscriptLineDto {
    let record = TranscriptItemRecord {
        id: item.id.clone(),
        session_id: item.session_id.clone(),
        phase: item.phase.map(|p| p.to_string()),
        agent_name: item.agent_name.clone(),
        source: enum_label(&item.source),
        kind: enum_label(&item.kind),
        status: enum_label(&item.status),
        item_key: item.item_key.clone(),
        summary: item.summary.clone(),
        payload_json: item.payload.as_ref().map(|p| p.to_string()),
        seq: 0,
        created_at,
    };
    TranscriptLineDto::from(record)
}

/// Forward one pipeline event to the window sink. Only `Transcript` events carry a
/// per-line body the live view renders; other variants (phase lifecycle, usage, …)
/// surface as their own transcript items and are ignored here. Returns whether a line
/// was emitted.
pub fn forward_event(event: &PipelineEvent, sink: &impl TranscriptSink) -> anyhow::Result<bool> {
    match event {
        PipelineEvent::Transcript { item } => {
            let line = line_from_live(item, chrono::Utc::now().to_rfc3339());
            sink.emit_line(TRANSCRIPT_CHANNEL, &line)?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// Drain an EventBus subscription into the window sink until the channel closes.
/// This is the long-running task the desktop spawns once the shell owns an
/// `EventBus`. A lagged receiver (slow window) skips the dropped events rather than
/// tearing down the stream — the client recovers the gap via `transcript.since`.
pub async fn pump_transcript(
    mut rx: broadcast::Receiver<PipelineEvent>,
    sink: impl TranscriptSink,
) {
    loop {
        match rx.recv().await {
            Ok(event) => {
                let _ = forward_event(&event, &sink);
            }
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use koklo_events::{EventBus, TranscriptItemKind, TranscriptItemStatus, TranscriptSource};
    use std::sync::{Arc, Mutex};

    /// Recording sink — captures every (channel, line) the bridge emits.
    #[derive(Clone, Default)]
    struct RecordingSink {
        lines: Arc<Mutex<Vec<(String, TranscriptLineDto)>>>,
    }

    impl TranscriptSink for RecordingSink {
        fn emit_line(&self, channel: &str, line: &TranscriptLineDto) -> anyhow::Result<()> {
            self.lines
                .lock()
                .unwrap()
                .push((channel.to_string(), line.clone()));
            Ok(())
        }
    }

    fn transcript_event(summary: &str) -> PipelineEvent {
        let item = TranscriptItem::new(
            "s1",
            None,
            Some("developer".to_string()),
            TranscriptSource::Provider,
            TranscriptItemKind::FileChange,
            TranscriptItemStatus::Completed,
            summary,
        );
        PipelineEvent::Transcript { item }
    }

    #[test]
    fn live_line_uses_storage_snake_case_labels() {
        let line = line_from_live(
            &TranscriptItem::new(
                "s1",
                None,
                None,
                TranscriptSource::Provider,
                TranscriptItemKind::MessageDelta,
                TranscriptItemStatus::Streaming,
                "hi",
            ),
            "2026-06-14T00:00:00Z".to_string(),
        );
        // Same wire labels storage persists, so live and replayed lines agree.
        assert_eq!(line.kind, "message_delta");
        assert_eq!(line.source, "provider");
        assert_eq!(line.status, "streaming");
        // seq 0 is the "live, pre-cursor" sentinel.
        assert_eq!(line.seq, 0);
    }

    #[test]
    fn forward_event_emits_transcript_on_contract_channel() {
        let sink = RecordingSink::default();
        let emitted = forward_event(&transcript_event("edited lib.rs"), &sink).unwrap();
        assert!(emitted);
        let recorded = sink.lines.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].0, TRANSCRIPT_CHANNEL);
        assert_eq!(recorded[0].1.summary, "edited lib.rs");
    }

    #[test]
    fn forward_event_ignores_non_transcript_variants() {
        let sink = RecordingSink::default();
        let emitted = forward_event(
            &PipelineEvent::SessionCompleted {
                session_id: "s1".to_string(),
            },
            &sink,
        )
        .unwrap();
        assert!(!emitted);
        assert!(sink.lines.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn pump_streams_eventbus_into_the_window_sink() {
        let bus = EventBus::new(16);
        let sink = RecordingSink::default();
        let lines = sink.lines.clone();
        let rx = bus.subscribe();
        let handle = tokio::spawn(pump_transcript(rx, sink));

        bus.send(transcript_event("line A"));
        bus.send(transcript_event("line B"));
        drop(bus); // closes the channel → pump exits
        handle.await.unwrap();

        let recorded = lines.lock().unwrap();
        let summaries: Vec<_> = recorded.iter().map(|(_, l)| l.summary.as_str()).collect();
        assert_eq!(summaries, vec!["line A", "line B"]);
    }
}
