use koklo_events::GateResponse;
use koklo_providers::{ProviderApprovalDecision, ProviderEvent, ProviderInteractionMode};
use serde_json::json;

pub(crate) fn map_gate_response(response: GateResponse) -> ProviderApprovalDecision {
    match response {
        GateResponse::Approve => ProviderApprovalDecision::Approve,
        GateResponse::Reject => ProviderApprovalDecision::Reject,
        GateResponse::Edit(path) => ProviderApprovalDecision::Edit {
            path: Some(path.display().to_string()),
        },
    }
}

pub(crate) fn interaction_mode_label(mode: ProviderInteractionMode) -> &'static str {
    match mode {
        ProviderInteractionMode::Native => "native",
        ProviderInteractionMode::Normalized => "normalized",
        ProviderInteractionMode::Synthetic => "synthetic",
    }
}

pub(crate) fn provider_contract_payload(
    event: ProviderEvent,
    interaction_mode: ProviderInteractionMode,
) -> serde_json::Value {
    let mut payload = event.canonical_payload();
    if let Some(map) = payload.as_object_mut() {
        map.insert(
            "interaction_mode".to_string(),
            json!(interaction_mode_label(interaction_mode)),
        );
    }
    payload
}

pub(crate) fn runtime_contract_payload(
    event_name: &str,
    event_status: &str,
    item_id: Option<&str>,
    mut payload: serde_json::Value,
) -> serde_json::Value {
    if let Some(map) = payload.as_object_mut() {
        map.insert(
            "contract_version".to_string(),
            json!(ProviderEvent::CONTRACT_VERSION),
        );
        map.insert("event_name".to_string(), json!(event_name));
        map.insert("event_status".to_string(), json!(event_status));
        map.insert("item_id".to_string(), json!(item_id));
    }
    payload
}
