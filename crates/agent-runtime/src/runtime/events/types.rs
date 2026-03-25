use koklo_events::{EventBus, Phase, UserInputDisplay};
use koklo_providers::{ProviderApprovalKind, ProviderInteractionMode};

pub(crate) struct AgentTurnContext<'a> {
    pub(crate) bus: &'a EventBus,
    pub(crate) phase: Phase,
    pub(crate) session_id: &'a str,
    pub(crate) agent_name: &'a str,
    pub(crate) interaction_mode: ProviderInteractionMode,
}

pub(crate) struct TextBuffers<'a> {
    pub(crate) result: &'a mut String,
    pub(crate) turn_text: &'a mut String,
}

pub(crate) enum RuntimeInterruption {
    UserInput(UserInputDisplay),
    Approval(RuntimeApprovalRequest),
}

pub(crate) struct RuntimeApprovalRequest {
    pub(crate) request_id: String,
    pub(crate) item_id: Option<String>,
    pub(crate) kind: ProviderApprovalKind,
    pub(crate) description: String,
    pub(crate) details: serde_json::Value,
}
