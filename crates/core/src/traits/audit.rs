//! Audit provider extension point.

use async_trait::async_trait;

#[async_trait]
pub trait AuditProvider: Send + Sync {
    async fn record_event(&self, event: &str) -> anyhow::Result<()>;
}

pub struct NoopAuditProvider;

#[async_trait]
impl AuditProvider for NoopAuditProvider {
    async fn record_event(&self, _event: &str) -> anyhow::Result<()> {
        Ok(())
    }
}
