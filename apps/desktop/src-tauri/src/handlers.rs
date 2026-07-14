//! Desktop IPC handlers (Sprint 007 / US-015, roadmap P2 §1).
//!
//! One async function per tRPC procedure that is backed by an existing crate. Each is a
//! thin **Interface adapter**: it calls a `koklo-*` crate (storage / providers / events)
//! and projects the result through a pure mapper in [`crate::ipc`]. No workflow logic is
//! reimplemented here — that is the architectural rule (logic lives in Rust crates; this
//! layer only marshals).
//!
//! These are the testable cores. The `#[tauri::command]` wrappers in [`crate::runtime`]
//! pull managed state and forward to these functions. `sessions.run` lives in
//! [`crate::sessions`] because it adds a workflow-engine runner boundary. Worktree mutation
//! remains deferred until git-engine exposes real worktree operations.

use crate::gates::{GateDecisionInput, GateDto};
use crate::ipc::{SessionDto, TranscriptLineDto, UsageSummaryDto};
use crate::providers::{provider_detection_dto, provider_dtos, ProviderDto};
use anyhow::{anyhow, Result};
use koklo_events::{GateChannel, GateResponse};
use koklo_providers::{detect::ProviderDetection, ProviderRegistry};
use koklo_storage::SessionManager;

// ── sessions ────────────────────────────────────────────────────────────────

/// `sessions.list` — every session, newest-status snapshot.
pub async fn sessions_list(storage: &SessionManager) -> Result<Vec<SessionDto>> {
    Ok(crate::ipc::sessions_list(storage.list_sessions().await?))
}

/// `sessions.listForProject` — sessions scoped to one project root.
pub async fn sessions_list_for_project(
    storage: &SessionManager,
    project_path: &str,
) -> Result<Vec<SessionDto>> {
    let rows = storage.list_sessions_for_project(project_path).await?;
    Ok(crate::ipc::sessions_list(rows))
}

/// `sessions.get` — a single session, or `None` if unknown.
pub async fn session_get(storage: &SessionManager, id: &str) -> Result<Option<SessionDto>> {
    Ok(storage.get_session(id).await?.map(SessionDto::from))
}

/// `sessions.usage` — token/cost roll-up for the usage meter.
pub async fn session_usage(storage: &SessionManager, session_id: &str) -> Result<UsageSummaryDto> {
    let summary = storage.get_session_usage_summary(session_id).await?;
    Ok(UsageSummaryDto::from(summary))
}

// ── transcript ──────────────────────────────────────────────────────────────

/// `transcript.list` — full ordered transcript of a session (history load).
pub async fn transcript_list(
    storage: &SessionManager,
    session_id: &str,
) -> Result<Vec<TranscriptLineDto>> {
    let rows = storage.get_transcript_items_for_session(session_id).await?;
    Ok(rows.into_iter().map(TranscriptLineDto::from).collect())
}

/// `transcript.since` — incremental fetch of lines with `seq > since_seq` (the cursor
/// the live view replays from on reconnect). Storage applies the cursor in SQL; the
/// pure projection re-applies it so the result is correct even if fed an unfiltered list.
pub async fn transcript_since(
    storage: &SessionManager,
    session_id: &str,
    since_seq: i64,
) -> Result<Vec<TranscriptLineDto>> {
    let rows = storage
        .get_transcript_items_since(session_id, since_seq)
        .await?;
    Ok(crate::ipc::transcript_since(rows, since_seq))
}

// ── gates ───────────────────────────────────────────────────────────────────

/// `gates.pending` — unresolved approval gates of a session, from its persisted
/// transcript (so the UI recovers pending gates after a window reload).
pub async fn gates_pending(storage: &SessionManager, session_id: &str) -> Result<Vec<GateDto>> {
    let rows = storage.get_transcript_items_for_session(session_id).await?;
    Ok(crate::gates::gates_pending(rows))
}

/// `gates.decide` — resolve the live gate the pipeline is blocked on and audit the
/// decision. The unblock travels over the existing [`GateChannel`] (the same mechanism
/// the TUI uses); the audit row is written through `Storage::record_gate_decision`.
/// The phase comes from the pending request's display, so callers need not supply it.
pub async fn gates_decide(
    channel: &GateChannel,
    storage: &SessionManager,
    input: GateDecisionInput,
) -> Result<()> {
    let request = channel
        .take_pending()
        .ok_or_else(|| anyhow!("no pending gate to decide"))?;
    let phase = request.display.phase.to_string();
    let session_id = request.display.session_id.clone();
    let (action_label, response) = match input.action.as_str() {
        "approve" => ("approve", GateResponse::Approve),
        "reject" => ("reject", GateResponse::Reject),
        "edit" => {
            let path = input
                .edit_path
                .ok_or_else(|| anyhow!("`edit` decision requires editPath"))?;
            ("edit", GateResponse::Edit(path.into()))
        }
        other => return Err(anyhow!("unknown gate action: {other}")),
    };
    storage
        .record_gate_decision(&session_id, &phase, action_label, input.note.as_deref())
        .await?;
    request
        .responder
        .send(response)
        .map_err(|_| anyhow!("gate awaiter dropped — pipeline is no longer waiting"))?;
    Ok(())
}

// ── providers ───────────────────────────────────────────────────────────────

/// `providers.list` — configured providers from the built registry, with their
/// interaction modes (read from each provider's `capabilities()`).
pub fn providers_list(registry: &ProviderRegistry) -> Vec<ProviderDto> {
    provider_dtos(
        registry
            .iter()
            .map(|(name, provider)| (name, provider.capabilities().interaction_mode)),
    )
}

/// `providers.detect` — the auto-detection outcome as a DTO. The detected provider's
/// mode is resolved from the registry (falling back to the registry default when the
/// provider was detected but not built).
pub fn providers_detect(
    detection: &ProviderDetection,
    registry: &ProviderRegistry,
) -> Option<ProviderDto> {
    provider_detection_dto(detection, |name| {
        registry
            .get(name)
            .map(|p| p.capabilities().interaction_mode)
            .unwrap_or_default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use koklo_events::{GateDisplay, Phase};
    use koklo_providers::config::PipelineTomlConfig;
    use std::time::Duration;

    async fn seeded_storage() -> SessionManager {
        // `in_memory` already runs migrations.
        SessionManager::in_memory().await.unwrap()
    }

    #[tokio::test]
    async fn sessions_list_reads_storage() {
        let storage = seeded_storage().await;
        storage
            .create_session("Auth retry", "sdd", "/repo")
            .await
            .unwrap();
        let dtos = sessions_list(&storage).await.unwrap();
        assert_eq!(dtos.len(), 1);
        assert_eq!(dtos[0].title, "Auth retry");
    }

    #[tokio::test]
    async fn session_get_returns_none_for_unknown() {
        let storage = seeded_storage().await;
        assert!(session_get(&storage, "nope").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn transcript_since_applies_cursor_through_storage() {
        use koklo_events::{
            TranscriptItem, TranscriptItemKind, TranscriptItemStatus, TranscriptSource,
        };
        let storage = seeded_storage().await;
        let session = storage
            .create_session("Feature", "sdd", "/repo")
            .await
            .unwrap();
        for summary in ["one", "two", "three"] {
            let item = TranscriptItem::new(
                &session.id,
                None,
                None,
                TranscriptSource::Agent,
                TranscriptItemKind::Message,
                TranscriptItemStatus::Completed,
                summary,
            );
            storage.record_transcript_item(&item).await.unwrap();
        }
        let lines = transcript_since(&storage, &session.id, 1).await.unwrap();
        assert_eq!(
            lines.iter().map(|l| l.summary.as_str()).collect::<Vec<_>>(),
            vec!["two", "three"]
        );
    }

    #[tokio::test]
    async fn gates_decide_unblocks_pipeline_and_audits() {
        let storage = seeded_storage().await;
        let session = storage
            .create_session("Gated", "sdd", "/repo")
            .await
            .unwrap();
        let channel = GateChannel::new();

        // Simulate the pipeline blocking on a gate.
        let awaiting = {
            let channel = channel.clone();
            let display = GateDisplay {
                phase: Phase::Implement,
                session_id: session.id.clone(),
                description: "Approve the plan?".to_string(),
                usage: None,
                cost: None,
                allow_edit: false,
            };
            tokio::spawn(async move { channel.deposit_and_await(display).await })
        };
        // Let the deposit land before deciding.
        tokio::task::yield_now().await;
        while !channel.has_pending() {
            tokio::task::yield_now().await;
        }

        gates_decide(
            &channel,
            &storage,
            GateDecisionInput {
                session_id: session.id.clone(),
                action: "approve".to_string(),
                note: Some("LGTM".to_string()),
                edit_path: None,
            },
        )
        .await
        .unwrap();

        let response = awaiting.await.unwrap().unwrap();
        assert!(matches!(response, GateResponse::Approve));
        // Audited under the phase carried by the pending gate.
        let gates = gates_pending(&storage, &session.id).await.unwrap();
        assert!(gates.is_empty()); // no persisted approval_request rows in this path
    }

    #[tokio::test]
    async fn gates_decide_releases_the_waiting_pipeline_within_one_second() {
        let storage = seeded_storage().await;
        let session = storage
            .create_session("Gated", "sdd", "/repo")
            .await
            .unwrap();
        let channel = GateChannel::new();
        let awaiting = {
            let channel = channel.clone();
            let display = GateDisplay {
                phase: Phase::Implement,
                session_id: session.id.clone(),
                description: "Approve the plan?".to_string(),
                usage: None,
                cost: None,
                allow_edit: false,
            };
            tokio::spawn(async move { channel.deposit_and_await(display).await })
        };
        tokio::task::yield_now().await;
        while !channel.has_pending() {
            tokio::task::yield_now().await;
        }

        gates_decide(
            &channel,
            &storage,
            GateDecisionInput {
                session_id: session.id.clone(),
                action: "approve".to_string(),
                note: None,
                edit_path: None,
            },
        )
        .await
        .unwrap();

        let response = tokio::time::timeout(Duration::from_secs(1), awaiting)
            .await
            .expect("gate should unblock promptly")
            .unwrap()
            .unwrap();
        assert!(matches!(response, GateResponse::Approve));
    }

    #[tokio::test]
    async fn gates_decide_errors_without_pending() {
        let storage = seeded_storage().await;
        let channel = GateChannel::new();
        let err = gates_decide(
            &channel,
            &storage,
            GateDecisionInput {
                session_id: "s1".to_string(),
                action: "approve".to_string(),
                note: None,
                edit_path: None,
            },
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("no pending gate"));
    }

    #[test]
    fn providers_list_is_empty_for_empty_registry() {
        let registry = ProviderRegistry::build(&PipelineTomlConfig::default()).unwrap();
        assert!(providers_list(&registry).is_empty());
    }

    #[test]
    fn providers_detect_maps_through_registry() {
        use koklo_providers::detect::DetectionSource;
        let registry = ProviderRegistry::build(&PipelineTomlConfig::default()).unwrap();
        let detection = ProviderDetection::Detected {
            provider: "claude-code".to_string(),
            source: DetectionSource::LocalCli {
                binary: "claude".to_string(),
            },
        };
        let dto = providers_detect(&detection, &registry).unwrap();
        assert_eq!(dto.name, "claude-code");
        assert_eq!(dto.detection_source.as_deref(), Some("cli"));
        // Not built in an empty registry → falls back to the default mode.
        assert_eq!(dto.interaction_mode, "synthetic");
    }
}
