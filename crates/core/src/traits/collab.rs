//! Collaboration provider extension point.

use async_trait::async_trait;

#[async_trait]
pub trait CollabProvider: Send + Sync {
    async fn sync_session(&self, session_id: &str) -> anyhow::Result<()>;
    async fn get_presence(&self, workspace_id: &str) -> anyhow::Result<Vec<String>>;
}

pub struct NoopCollabProvider;

#[async_trait]
impl CollabProvider for NoopCollabProvider {
    async fn sync_session(&self, _session_id: &str) -> anyhow::Result<()> {
        Ok(())
    }

    async fn get_presence(&self, _workspace_id: &str) -> anyhow::Result<Vec<String>> {
        Ok(vec![])
    }
}
