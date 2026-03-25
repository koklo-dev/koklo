use super::*;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TranscriptLiveModel {
    pub agent_name: Option<String>,
    pub latest_assistant: Option<RenderBlock>,
    pub latest_thinking: Option<RenderBlock>,
    pub latest_activity: Option<RenderBlock>,
    pub recent_activity: Vec<RenderBlock>,
    pub pending: Vec<RenderBlock>,
}

impl TranscriptRenderModel {
    pub fn live_model(&self) -> TranscriptLiveModel {
        let latest_assistant = self
            .blocks
            .iter()
            .rev()
            .find(|block| block.kind == RenderBlockKind::Assistant)
            .cloned();
        let latest_thinking = self
            .blocks
            .iter()
            .rev()
            .find(|block| {
                matches!(
                    block.kind,
                    RenderBlockKind::Reasoning | RenderBlockKind::Plan
                )
            })
            .cloned();
        let mut recent_activity = self
            .blocks
            .iter()
            .rev()
            .filter(|block| {
                matches!(
                    block.kind,
                    RenderBlockKind::Tool | RenderBlockKind::Command | RenderBlockKind::FileChange
                )
            })
            .take(3)
            .cloned()
            .collect::<Vec<_>>();
        recent_activity.reverse();

        if recent_activity.is_empty() {
            recent_activity = self
                .blocks
                .iter()
                .rev()
                .filter(|block| {
                    matches!(
                        block.kind,
                        RenderBlockKind::Usage
                            | RenderBlockKind::Lifecycle
                            | RenderBlockKind::Metadata
                    )
                })
                .take(2)
                .cloned()
                .collect::<Vec<_>>();
            recent_activity.reverse();
        }

        let latest_activity = recent_activity.last().cloned();

        let mut resolved_approvals = HashSet::new();
        let mut resolved_user_inputs = HashSet::new();
        let mut pending = Vec::new();

        for block in self.blocks.iter().rev() {
            match block.source_kind.as_str() {
                "approval_decision" => {
                    if let Some(item_key) = &block.item_key {
                        resolved_approvals.insert(item_key.clone());
                    }
                }
                "user_input_response" => {
                    if let Some(item_key) = &block.item_key {
                        resolved_user_inputs.insert(item_key.clone());
                    }
                }
                "approval_request" => {
                    let unresolved = block
                        .item_key
                        .as_ref()
                        .map(|item_key| !resolved_approvals.contains(item_key))
                        .unwrap_or(true);
                    if unresolved {
                        pending.push(block.clone());
                    }
                }
                "user_input_request" => {
                    let unresolved = block
                        .item_key
                        .as_ref()
                        .map(|item_key| !resolved_user_inputs.contains(item_key))
                        .unwrap_or(true);
                    if unresolved {
                        pending.push(block.clone());
                    }
                }
                _ => {}
            }
        }

        pending.reverse();

        TranscriptLiveModel {
            agent_name: self.agent_name.clone(),
            latest_assistant,
            latest_thinking,
            latest_activity,
            recent_activity,
            pending,
        }
    }
}
