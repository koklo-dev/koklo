/// Rank phase statuses so bus overrides only advance forward, never regress.
use super::*;

pub(crate) fn phase_status_rank(status: &str) -> u8 {
    match status {
        "pending" => 0,
        "running" => 1,
        "completed" => 2,
        "failed" => 2,
        _ => 0,
    }
}

pub(crate) fn transcript_record_from_event(item: TranscriptItem, seq: i64) -> TranscriptItemRecord {
    TranscriptItemRecord {
        id: item.id,
        session_id: item.session_id,
        phase: item.phase.map(|phase| phase.to_string()),
        agent_name: item.agent_name,
        source: format!("{:?}", item.source).to_lowercase(),
        kind: format!("{:?}", item.kind)
            .chars()
            .flat_map(|ch| {
                if ch.is_ascii_uppercase() {
                    vec!['_', ch.to_ascii_lowercase()]
                } else {
                    vec![ch]
                }
            })
            .collect::<String>()
            .trim_start_matches('_')
            .to_string(),
        status: format!("{:?}", item.status)
            .chars()
            .flat_map(|ch| {
                if ch.is_ascii_uppercase() {
                    vec!['_', ch.to_ascii_lowercase()]
                } else {
                    vec![ch]
                }
            })
            .collect::<String>()
            .trim_start_matches('_')
            .to_string(),
        item_key: item.item_key,
        summary: item.summary,
        payload_json: item.payload.map(|payload| payload.to_string()),
        seq,
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

impl PendingUserInput {
    pub(crate) fn from_record(item: &TranscriptItemRecord) -> Option<Self> {
        let payload = item.payload()?;
        let questions =
            serde_json::from_value::<Vec<UserInputQuestion>>(payload.get("questions")?.clone())
                .ok()?;
        if questions.is_empty() {
            return None;
        }
        Some(Self {
            request_id: item.item_key.clone().unwrap_or_else(|| item.id.clone()),
            questions,
            answers: Vec::new(),
        })
    }
}
