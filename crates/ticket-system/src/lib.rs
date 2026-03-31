//! Local ticket management backed by SQLite.
//!
//! Provides a simple CRUD ticket store that lives alongside the pipeline
//! sessions in `~/.koklo/koklo.db`.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Ticket status values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TicketStatus {
    Open,
    InProgress,
    Done,
    Closed,
}

impl TicketStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::InProgress => "in-progress",
            Self::Done => "done",
            Self::Closed => "closed",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().replace('_', "-").as_str() {
            "open" => Some(Self::Open),
            "in-progress" | "inprogress" | "wip" => Some(Self::InProgress),
            "done" => Some(Self::Done),
            "closed" => Some(Self::Closed),
            _ => None,
        }
    }
}

impl std::fmt::Display for TicketStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Ticket priority values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TicketPriority {
    Low,
    Medium,
    High,
    Critical,
}

impl TicketPriority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "low" => Some(Self::Low),
            "medium" | "med" => Some(Self::Medium),
            "high" => Some(Self::High),
            "critical" | "crit" => Some(Self::Critical),
            _ => None,
        }
    }
}

impl std::fmt::Display for TicketPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A ticket row.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Ticket {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub tags: String,
    pub session_id: Option<String>,
    pub project_path: String,
    pub created_at: String,
    pub updated_at: String,
}

/// SQLite-backed ticket store.
pub struct TicketStore {
    pool: SqlitePool,
}

impl TicketStore {
    /// Open the store from a database path string (creates if missing).
    pub async fn open(db_path: &str) -> Result<Self> {
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;
        let path = db_path.strip_prefix("sqlite://").unwrap_or(db_path);
        let opts = SqliteConnectOptions::from_str(path)?.create_if_missing(true);
        let pool = SqlitePool::connect_with(opts).await?;
        Self::new(pool).await
    }

    /// Create a new store from an existing pool, running migrations.
    pub async fn new(pool: SqlitePool) -> Result<Self> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                priority TEXT NOT NULL DEFAULT 'medium',
                tags TEXT NOT NULL DEFAULT '',
                session_id TEXT,
                project_path TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .context("failed to create tickets table")?;
        Ok(Self { pool })
    }

    /// Create a new ticket. Returns the ticket ID.
    pub async fn create(
        &self,
        title: &str,
        description: &str,
        priority: TicketPriority,
        tags: &str,
        project_path: &str,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO tickets (id, title, description, status, priority, tags, project_path, created_at, updated_at)
             VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(title)
        .bind(description)
        .bind(priority.as_str())
        .bind(tags)
        .bind(project_path)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .context("failed to insert ticket")?;
        Ok(id)
    }

    /// List tickets, optionally filtered by status.
    pub async fn list(&self, status_filter: Option<TicketStatus>) -> Result<Vec<Ticket>> {
        let tickets = if let Some(status) = status_filter {
            sqlx::query_as::<_, Ticket>(
                "SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC",
            )
            .bind(status.as_str())
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, Ticket>("SELECT * FROM tickets ORDER BY created_at DESC")
                .fetch_all(&self.pool)
                .await?
        };
        Ok(tickets)
    }

    /// Get a single ticket by ID (prefix match).
    pub async fn get(&self, id_prefix: &str) -> Result<Option<Ticket>> {
        let pattern = format!("{id_prefix}%");
        let ticket = sqlx::query_as::<_, Ticket>("SELECT * FROM tickets WHERE id LIKE ? LIMIT 1")
            .bind(&pattern)
            .fetch_optional(&self.pool)
            .await?;
        Ok(ticket)
    }

    /// Update the status of a ticket.
    pub async fn update_status(&self, id_prefix: &str, status: TicketStatus) -> Result<bool> {
        let pattern = format!("{id_prefix}%");
        let now = Utc::now().to_rfc3339();
        let result = sqlx::query("UPDATE tickets SET status = ?, updated_at = ? WHERE id LIKE ?")
            .bind(status.as_str())
            .bind(&now)
            .bind(&pattern)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Close a ticket (shorthand for update_status with Closed).
    pub async fn close(&self, id_prefix: &str) -> Result<bool> {
        self.update_status(id_prefix, TicketStatus::Closed).await
    }

    /// Link a ticket to a pipeline session.
    pub async fn link_session(&self, id_prefix: &str, session_id: &str) -> Result<bool> {
        let pattern = format!("{id_prefix}%");
        let now = Utc::now().to_rfc3339();
        let result =
            sqlx::query("UPDATE tickets SET session_id = ?, updated_at = ? WHERE id LIKE ?")
                .bind(session_id)
                .bind(&now)
                .bind(&pattern)
                .execute(&self.pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqliteConnectOptions;
    use std::str::FromStr;

    async fn test_store() -> TicketStore {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:").unwrap();
        let pool = SqlitePool::connect_with(opts).await.unwrap();
        TicketStore::new(pool).await.unwrap()
    }

    #[tokio::test]
    async fn create_and_list() {
        let store = test_store().await;
        let id = store
            .create("Fix bug", "Description", TicketPriority::High, "", ".")
            .await
            .unwrap();
        assert!(!id.is_empty());

        let tickets = store.list(None).await.unwrap();
        assert_eq!(tickets.len(), 1);
        assert_eq!(tickets[0].title, "Fix bug");
        assert_eq!(tickets[0].status, "open");
        assert_eq!(tickets[0].priority, "high");
    }

    #[tokio::test]
    async fn get_by_prefix() {
        let store = test_store().await;
        let id = store
            .create("Test", "", TicketPriority::Medium, "", ".")
            .await
            .unwrap();
        let prefix = &id[..8];
        let ticket = store.get(prefix).await.unwrap().unwrap();
        assert_eq!(ticket.id, id);
    }

    #[tokio::test]
    async fn update_status() {
        let store = test_store().await;
        let id = store
            .create("Task", "", TicketPriority::Low, "", ".")
            .await
            .unwrap();
        let updated = store
            .update_status(&id, TicketStatus::InProgress)
            .await
            .unwrap();
        assert!(updated);
        let ticket = store.get(&id).await.unwrap().unwrap();
        assert_eq!(ticket.status, "in-progress");
    }

    #[tokio::test]
    async fn close_ticket() {
        let store = test_store().await;
        let id = store
            .create("Done", "", TicketPriority::Medium, "", ".")
            .await
            .unwrap();
        assert!(store.close(&id).await.unwrap());
        let ticket = store.get(&id).await.unwrap().unwrap();
        assert_eq!(ticket.status, "closed");
    }

    #[tokio::test]
    async fn list_with_status_filter() {
        let store = test_store().await;
        store
            .create("A", "", TicketPriority::Low, "", ".")
            .await
            .unwrap();
        let id_b = store
            .create("B", "", TicketPriority::Low, "", ".")
            .await
            .unwrap();
        store
            .update_status(&id_b, TicketStatus::Done)
            .await
            .unwrap();

        let open = store.list(Some(TicketStatus::Open)).await.unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].title, "A");

        let done = store.list(Some(TicketStatus::Done)).await.unwrap();
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].title, "B");
    }

    #[tokio::test]
    async fn link_session() {
        let store = test_store().await;
        let id = store
            .create("T", "", TicketPriority::Medium, "", ".")
            .await
            .unwrap();
        assert!(store.link_session(&id, "sess-123").await.unwrap());
        let ticket = store.get(&id).await.unwrap().unwrap();
        assert_eq!(ticket.session_id.as_deref(), Some("sess-123"));
    }

    #[test]
    fn status_parse_roundtrip() {
        for s in &["open", "in-progress", "done", "closed"] {
            let parsed = TicketStatus::parse(s).unwrap();
            assert_eq!(parsed.as_str(), *s);
        }
    }

    #[test]
    fn status_parse_aliases() {
        assert_eq!(TicketStatus::parse("wip"), Some(TicketStatus::InProgress));
        assert_eq!(
            TicketStatus::parse("inprogress"),
            Some(TicketStatus::InProgress)
        );
        assert_eq!(
            TicketStatus::parse("in_progress"),
            Some(TicketStatus::InProgress)
        );
    }

    #[test]
    fn priority_parse_roundtrip() {
        for s in &["low", "medium", "high", "critical"] {
            let parsed = TicketPriority::parse(s).unwrap();
            assert_eq!(parsed.as_str(), *s);
        }
    }

    #[test]
    fn priority_parse_aliases() {
        assert_eq!(TicketPriority::parse("med"), Some(TicketPriority::Medium));
        assert_eq!(
            TicketPriority::parse("crit"),
            Some(TicketPriority::Critical)
        );
    }
}
