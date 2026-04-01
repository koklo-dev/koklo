//! Storage extension point for enterprise features.

use async_trait::async_trait;

/// Extension hooks called by the storage layer at key lifecycle points.
///
/// Community edition uses [`NoopStorageExtension`].  The EE crate provides
/// an implementation that applies additional migrations and records audit events.
#[async_trait]
pub trait StorageExtension: Send + Sync {
    /// Apply extension-specific migrations after the public schema is up to date.
    /// Receives a raw `sqlx::SqlitePool` so the extension can run its own SQL.
    async fn apply_migrations(&self, pool: &sqlx::SqlitePool) -> anyhow::Result<()>;

    /// Hook called after a session is created.
    async fn on_session_created(
        &self,
        session_id: &str,
        owner_scope: &str,
        owner_id: &str,
    ) -> anyhow::Result<()>;

    /// Hook called after a gate decision is recorded.
    async fn on_gate_decision(
        &self,
        session_id: &str,
        phase: &str,
        action: &str,
    ) -> anyhow::Result<()>;
}

/// No-op implementation for Community/Pro tiers.
pub struct NoopStorageExtension;

#[async_trait]
impl StorageExtension for NoopStorageExtension {
    async fn apply_migrations(&self, _pool: &sqlx::SqlitePool) -> anyhow::Result<()> {
        Ok(())
    }

    async fn on_session_created(
        &self,
        _session_id: &str,
        _owner_scope: &str,
        _owner_id: &str,
    ) -> anyhow::Result<()> {
        Ok(())
    }

    async fn on_gate_decision(
        &self,
        _session_id: &str,
        _phase: &str,
        _action: &str,
    ) -> anyhow::Result<()> {
        Ok(())
    }
}
