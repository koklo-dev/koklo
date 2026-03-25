use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{GateDisplay, GateResponse, UserInputDisplay};

#[async_trait]
pub trait UserInputHandler: Send + Sync {
    async fn request_input(&self, display: UserInputDisplay) -> Result<Vec<String>>;
}

#[async_trait]
pub trait ApprovalHandler: Send + Sync {
    async fn request_approval(&self, display: GateDisplay) -> Result<GateResponse>;
}
