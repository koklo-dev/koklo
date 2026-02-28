//! Deployment provider extension point.

use async_trait::async_trait;

#[async_trait]
pub trait DeployProvider: Send + Sync {
    async fn deploy(&self, target: &str) -> anyhow::Result<()>;
}

pub struct NoopDeployProvider;

#[async_trait]
impl DeployProvider for NoopDeployProvider {
    async fn deploy(&self, _target: &str) -> anyhow::Result<()> {
        Ok(())
    }
}
