//! `gates.*` IPC wire types (Sprint 007 / US-015, roadmap P2 §1).
//!
//! Pure projections only — the async handlers live in [`crate::handlers`].

use koklo_storage::TranscriptItemRecord;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A pending human gate, derived from a persisted `approval_request` transcript row.
/// `kind` is the provider approval kind read from the row payload (snake_case wire
/// form), defaulting to `"command_execution"` when absent. `request_id` correlates
/// the later decision back to the live provider session.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GateDto {
    pub session_id: String,
    pub phase: String,
    pub kind: String,
    pub description: String,
    pub request_id: Option<String>,
    pub details: Option<Value>,
}

impl GateDto {
    /// Project one persisted `approval_request` row into a pending gate.
    pub fn from_pending(r: TranscriptItemRecord) -> Self {
        let details = r.payload();
        let kind = details
            .as_ref()
            .and_then(|p| p.get("kind"))
            .and_then(Value::as_str)
            .unwrap_or("command_execution")
            .to_string();
        Self {
            session_id: r.session_id,
            phase: r.phase.unwrap_or_default(),
            kind,
            description: r.summary,
            request_id: r.item_key,
            details,
        }
    }
}

/// `gates.pending` — the unresolved approval gates of a session: persisted
/// `approval_request` rows still in `pending` status. Pure projection over the
/// session transcript (no new query path — the caller passes
/// `Storage::get_transcript_items_for_session`).
pub fn gates_pending(rows: Vec<TranscriptItemRecord>) -> Vec<GateDto> {
    rows.into_iter()
        .filter(|r| r.kind == "approval_request" && r.status == "pending")
        .map(GateDto::from_pending)
        .collect()
}

/// Decision input for `gates.decide` (mirrors `GateDecisionInput` in the TS contract).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateDecisionInput {
    pub session_id: String,
    pub action: String,
    #[serde(default)]
    pub note: Option<String>,
    /// Only meaningful when `action == "edit"`.
    #[serde(default)]
    pub edit_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approval(status: &str, payload: Option<&str>) -> TranscriptItemRecord {
        TranscriptItemRecord {
            id: "g1".to_string(),
            session_id: "s1".to_string(),
            phase: Some("implement".to_string()),
            agent_name: Some("developer".to_string()),
            source: "tool".to_string(),
            kind: "approval_request".to_string(),
            status: status.to_string(),
            item_key: Some("req-7".to_string()),
            summary: "Run `cargo build`?".to_string(),
            payload_json: payload.map(str::to_string),
            seq: 4,
            created_at: "2026-06-14T00:00:00Z".to_string(),
        }
    }

    fn message(seq: i64) -> TranscriptItemRecord {
        TranscriptItemRecord {
            id: format!("m{seq}"),
            session_id: "s1".to_string(),
            phase: None,
            agent_name: None,
            source: "agent".to_string(),
            kind: "message".to_string(),
            status: "completed".to_string(),
            item_key: None,
            summary: "hi".to_string(),
            payload_json: None,
            seq,
            created_at: "2026-06-14T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn gates_pending_keeps_only_unresolved_approvals() {
        let rows = vec![
            message(1),
            approval("pending", Some(r#"{"kind":"command_execution"}"#)),
            approval("resolved", None),
        ];
        let gates = gates_pending(rows);
        assert_eq!(gates.len(), 1);
        let g = &gates[0];
        assert_eq!(g.kind, "command_execution");
        assert_eq!(g.phase, "implement");
        assert_eq!(g.request_id.as_deref(), Some("req-7"));
        assert_eq!(g.description, "Run `cargo build`?");
    }

    #[test]
    fn gate_kind_defaults_when_payload_absent() {
        let gates = gates_pending(vec![approval("pending", None)]);
        assert_eq!(gates[0].kind, "command_execution");
    }

    #[test]
    fn gate_dto_serializes_camel_case() {
        let gates = gates_pending(vec![approval("pending", None)]);
        let json = serde_json::to_value(&gates[0]).unwrap();
        assert!(json.get("sessionId").is_some());
        assert!(json.get("requestId").is_some());
        assert!(json.get("session_id").is_none());
    }
}
