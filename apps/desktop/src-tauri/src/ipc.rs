//! Desktop IPC contract — Rust side (Sprint 006 / US-013, roadmap P2 §1).
//!
//! This module is the **Interface adapter** between the frontend and the
//! `koklo-*` domain crates. It carries no business logic: each procedure is a
//! thin mapping from a domain type (here `koklo_storage`) onto a serializable
//! wire DTO that mirrors `packages/trpc-client/src/contract.ts`.
//!
//! Two representative procedures are prototyped to prove the contract end to end:
//!   - [`sessions_list`]    — a snapshot request/response query.
//!   - [`transcript_since`] — an incremental, cursor-based fetch (the shape the
//!     live transcript subscription replays from).
//!
//! The remaining namespaces (gates, providers, worktrees) are declared in the
//! TypeScript contract; their Rust adapters land when the Tauri command runtime
//! and a DB pool are wired into the desktop shell (later P2 sprint).

use koklo_storage::{Session, SessionUsageSummary, TranscriptItemRecord};
use serde::Serialize;
use serde_json::Value;

/// Wire-contract version. Mirrors `IPC_CONTRACT_VERSION` in the TS contract and
/// follows the same discipline as `koklo_providers::ProviderEvent::CONTRACT_VERSION`.
pub const IPC_CONTRACT_VERSION: &str = "koklo.ipc.v1";

/// A pipeline session row as the frontend consumes it (ProjectHome / Sidebar).
///
/// `Session.feature_title` is surfaced as `title`; everything else is a direct,
/// logic-free projection. `workspace_path` / `workspace_branch` are the session
/// worktree the design system is otherwise blind to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub id: String,
    pub title: String,
    pub status: String,
    pub preset: String,
    pub project_path: String,
    pub workspace_path: String,
    pub workspace_branch: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<Session> for SessionDto {
    fn from(s: Session) -> Self {
        Self {
            id: s.id,
            title: s.feature_title,
            status: s.status,
            preset: s.preset,
            project_path: s.project_path,
            workspace_path: s.workspace_path,
            workspace_branch: s.workspace_branch,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}

/// One typed transcript line. `kind` / `source` / `status` are passed through in
/// the exact snake_case form storage persists (`enum_label`), so no re-casing
/// logic lives in this layer. `payload` is the parsed structured body, when any.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptLineDto {
    pub id: String,
    pub session_id: String,
    pub seq: i64,
    pub phase: Option<String>,
    pub agent_name: Option<String>,
    pub source: String,
    pub kind: String,
    pub status: String,
    pub item_key: Option<String>,
    pub summary: String,
    pub payload: Option<Value>,
    pub created_at: String,
}

impl From<TranscriptItemRecord> for TranscriptLineDto {
    fn from(r: TranscriptItemRecord) -> Self {
        let payload = r.payload();
        Self {
            id: r.id,
            session_id: r.session_id,
            seq: r.seq,
            phase: r.phase,
            agent_name: r.agent_name,
            source: r.source,
            kind: r.kind,
            status: r.status,
            item_key: r.item_key,
            summary: r.summary,
            payload,
            created_at: r.created_at,
        }
    }
}

/// `sessions.list` — project session snapshot.
///
/// Production wiring: `Storage::list_sessions().await` feeds `rows`; this fn is
/// the (pure, testable) projection step the Tauri command performs after the query.
pub fn sessions_list(rows: Vec<Session>) -> Vec<SessionDto> {
    rows.into_iter().map(SessionDto::from).collect()
}

/// `transcript.since` — incremental fetch of lines with `seq > since_seq`.
///
/// Production wiring: `Storage::get_transcript_items_since(session_id, since_seq)`
/// already applies the cursor in SQL; the `seq` guard here keeps the projection
/// correct (and self-contained) even if it is ever fed an unfiltered list.
pub fn transcript_since(rows: Vec<TranscriptItemRecord>, since_seq: i64) -> Vec<TranscriptLineDto> {
    rows.into_iter()
        .filter(|r| r.seq > since_seq)
        .map(TranscriptLineDto::from)
        .collect()
}

/// Session token/cost roll-up (Settings → usage meter). Pure projection of
/// `koklo_storage::SessionUsageSummary`; phase breakdown is dropped (the meter
/// only needs the totals).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummaryDto {
    pub session_id: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cost_usd: Option<f64>,
}

impl From<SessionUsageSummary> for UsageSummaryDto {
    fn from(s: SessionUsageSummary) -> Self {
        Self {
            session_id: s.session_id,
            prompt_tokens: s.total_prompt_tokens,
            completion_tokens: s.total_completion_tokens,
            cost_usd: s.total_cost_usd,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str, seq_branch: &str) -> Session {
        Session {
            id: id.to_string(),
            feature_title: "Auth retry policy".to_string(),
            status: "running".to_string(),
            preset: "sdd".to_string(),
            project_path: "/repo".to_string(),
            workspace_path: format!("/repo/.koklo/worktrees/{id}"),
            workspace_branch: format!("koklo/session/{seq_branch}"),
            created_at: "2026-06-14T00:00:00Z".to_string(),
            updated_at: "2026-06-14T00:01:00Z".to_string(),
        }
    }

    fn item(seq: i64, kind: &str, payload: Option<&str>) -> TranscriptItemRecord {
        TranscriptItemRecord {
            id: format!("item-{seq}"),
            session_id: "s1".to_string(),
            phase: Some("developer".to_string()),
            agent_name: Some("developer".to_string()),
            source: "provider".to_string(),
            kind: kind.to_string(),
            status: "completed".to_string(),
            item_key: None,
            summary: "summary".to_string(),
            payload_json: payload.map(str::to_string),
            seq,
            created_at: "2026-06-14T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn sessions_list_projects_title_and_worktree_fields() {
        let dtos = sessions_list(vec![session("s1", "abc")]);
        assert_eq!(dtos.len(), 1);
        let dto = &dtos[0];
        // feature_title is surfaced as `title`; worktree fields are preserved.
        assert_eq!(dto.title, "Auth retry policy");
        assert_eq!(dto.workspace_branch, "koklo/session/abc");
        assert_eq!(dto.workspace_path, "/repo/.koklo/worktrees/s1");
    }

    #[test]
    fn sessions_list_serializes_camel_case() {
        let dtos = sessions_list(vec![session("s1", "abc")]);
        let json = serde_json::to_value(&dtos[0]).unwrap();
        assert!(json.get("workspaceBranch").is_some());
        assert!(json.get("projectPath").is_some());
        assert!(json.get("workspace_branch").is_none());
    }

    #[test]
    fn transcript_since_applies_cursor_and_parses_payload() {
        let rows = vec![
            item(1, "message", None),
            item(
                2,
                "file_change",
                Some(r#"{"filesChanged":2,"linesAdded":47}"#),
            ),
            item(3, "command", None),
        ];
        let lines = transcript_since(rows, 1);
        // seq 1 is excluded by the cursor; 2 and 3 remain, in order.
        assert_eq!(lines.iter().map(|l| l.seq).collect::<Vec<_>>(), vec![2, 3]);
        // snake_case kind is passed through untouched (no re-casing logic).
        assert_eq!(lines[0].kind, "file_change");
        // payload JSON is parsed into a structured value.
        assert_eq!(lines[0].payload.as_ref().unwrap()["filesChanged"], 2);
    }

    #[test]
    fn contract_version_is_pinned() {
        assert_eq!(IPC_CONTRACT_VERSION, "koklo.ipc.v1");
    }

    #[test]
    fn usage_summary_dto_projects_totals() {
        let summary = SessionUsageSummary {
            session_id: "s1".to_string(),
            phases: vec![],
            total_prompt_tokens: 1200,
            total_completion_tokens: 340,
            total_cost_usd: Some(0.21),
        };
        let dto = UsageSummaryDto::from(summary);
        assert_eq!(dto.prompt_tokens, 1200);
        assert_eq!(dto.completion_tokens, 340);
        assert_eq!(dto.cost_usd, Some(0.21));
        let json = serde_json::to_value(&dto).unwrap();
        assert!(json.get("costUsd").is_some());
    }
}
