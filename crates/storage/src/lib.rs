//! SQLite-backed session storage.
use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
}

impl std::fmt::Display for SessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionStatus::Pending => write!(f, "pending"),
            SessionStatus::Running => write!(f, "running"),
            SessionStatus::Paused => write!(f, "paused"),
            SessionStatus::Completed => write!(f, "completed"),
            SessionStatus::Failed => write!(f, "failed"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PhaseStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

/// A pipeline session row.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub feature_title: String,
    pub status: String,
    /// Workflow preset used for this session (e.g. `"sdd"`, `"bmad"`).
    pub preset: String,
    /// Absolute path of the project root at the time the session was created.
    pub project_path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PhaseRecord {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    pub status: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error: Option<String>,
}

/// A pipeline artifact indexed in the database.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ArtifactRecord {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    /// Artifact type tag (e.g. `"spec"`, `"plan"`, `"code"`).
    pub artifact_type: String,
    /// Path to the artifact file on disk.
    pub path: String,
    /// File size in bytes at the time of recording.
    pub size_bytes: i64,
    pub created_at: String,
}

/// A single streamed log line from an agent execution.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentLogRecord {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    pub agent_name: String,
    pub message: String,
    /// Monotonically increasing sequence number per session.
    pub seq: i64,
    pub created_at: String,
}

/// A human gate decision recorded for auditing.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GateDecisionRecord {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    /// Gate action taken: `"approve"`, `"reject"`, or `"edit"`.
    pub action: String,
    /// Optional free-text note from the reviewer.
    pub note: Option<String>,
    pub decided_at: String,
}

/// Manages pipeline sessions in SQLite.
pub struct SessionManager {
    pool: SqlitePool,
}

impl SessionManager {
    /// Open (or create) the database at `db_path`.
    pub async fn open(db_path: &str) -> Result<Self> {
        let path = db_path.strip_prefix("sqlite://").unwrap_or(db_path);
        let opts = SqliteConnectOptions::from_str(path)?.create_if_missing(true);
        let pool = SqlitePool::connect_with(opts).await?;
        let manager = Self { pool };
        manager.migrate().await?;
        Ok(manager)
    }

    /// Open an in-memory database (for tests).
    pub async fn in_memory() -> Result<Self> {
        let pool = SqlitePool::connect("sqlite::memory:").await?;
        let manager = Self { pool };
        manager.migrate().await?;
        Ok(manager)
    }

    /// Run all pending migrations in order.
    ///
    /// Migrations are tracked in a `schema_migrations` table so each
    /// migration runs exactly once, making the function idempotent.
    pub async fn migrate(&self) -> Result<()> {
        // Ensure migration tracking table exists.
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS schema_migrations \
             (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
        )
        .execute(&self.pool)
        .await?;

        // Migration 001 — initial schema.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 1")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/001_initial.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        // Migration 002 — preset column + artifact size + gate note.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 2")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/002_preset.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        // Migration 003 — agent_logs table.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 3")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/003_agent_logs.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        // Migration 004 — project_path column.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 4")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/004_project_path.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    /// Create a new session with the given title, workflow preset, and project path.
    pub async fn create_session(
        &self,
        feature_title: &str,
        preset: &str,
        project_path: &str,
    ) -> Result<Session> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO sessions \
             (id, feature_title, status, preset, project_path, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(feature_title)
        .bind("pending")
        .bind(preset)
        .bind(project_path)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(Session {
            id,
            feature_title: feature_title.to_string(),
            status: "pending".to_string(),
            preset: preset.to_string(),
            project_path: project_path.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<Session>> {
        let row = sqlx::query_as::<_, Session>(
            "SELECT id, feature_title, status, preset, project_path, created_at, updated_at \
             FROM sessions WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        let rows = sqlx::query_as::<_, Session>(
            "SELECT id, feature_title, status, preset, project_path, created_at, updated_at \
             FROM sessions ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// List sessions for a specific project root path, most recent first.
    pub async fn list_sessions_for_project(&self, path: &str) -> Result<Vec<Session>> {
        let rows = sqlx::query_as::<_, Session>(
            "SELECT id, feature_title, status, preset, project_path, created_at, updated_at \
             FROM sessions WHERE project_path = ? ORDER BY created_at DESC",
        )
        .bind(path)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn update_session_status(&self, id: &str, status: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_phase_record(&self, session_id: &str, phase: &str) -> Result<PhaseRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO phases (id, session_id, phase, status, started_at) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(session_id)
        .bind(phase)
        .bind("running")
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(PhaseRecord {
            id,
            session_id: session_id.to_string(),
            phase: phase.to_string(),
            status: "running".to_string(),
            started_at: Some(now),
            completed_at: None,
            error: None,
        })
    }

    pub async fn complete_phase(
        &self,
        phase_id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE phases SET status = ?, completed_at = ?, error = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(error)
            .bind(phase_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_phases_for_session(&self, session_id: &str) -> Result<Vec<PhaseRecord>> {
        let rows = sqlx::query_as::<_, PhaseRecord>(
            "SELECT id, session_id, phase, status, started_at, completed_at, error \
             FROM phases WHERE session_id = ?",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Record a pipeline artifact in the database.
    pub async fn record_artifact(
        &self,
        session_id: &str,
        phase: &str,
        file_path: &str,
        size_bytes: i64,
    ) -> Result<ArtifactRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO artifacts \
             (id, session_id, phase, artifact_type, path, size_bytes, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(session_id)
        .bind(phase)
        .bind(phase) // artifact_type mirrors phase name
        .bind(file_path)
        .bind(size_bytes)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(ArtifactRecord {
            id,
            session_id: session_id.to_string(),
            phase: phase.to_string(),
            artifact_type: phase.to_string(),
            path: file_path.to_string(),
            size_bytes,
            created_at: now,
        })
    }

    /// List all artifacts recorded for a session.
    pub async fn list_artifacts(&self, session_id: &str) -> Result<Vec<ArtifactRecord>> {
        let rows = sqlx::query_as::<_, ArtifactRecord>(
            "SELECT id, session_id, phase, artifact_type, path, size_bytes, created_at \
             FROM artifacts WHERE session_id = ? ORDER BY created_at ASC",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Record a streamed agent log line in the database.
    pub async fn record_agent_log(
        &self,
        session_id: &str,
        phase: &str,
        agent_name: &str,
        message: &str,
    ) -> Result<AgentLogRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        // Determine next seq for this session.
        let (next_seq,): (i64,) =
            sqlx::query_as("SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_logs WHERE session_id = ?")
                .bind(session_id)
                .fetch_one(&self.pool)
                .await?;
        sqlx::query(
            "INSERT INTO agent_logs \
             (id, session_id, phase, agent_name, message, seq, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(session_id)
        .bind(phase)
        .bind(agent_name)
        .bind(message)
        .bind(next_seq)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(AgentLogRecord {
            id,
            session_id: session_id.to_string(),
            phase: phase.to_string(),
            agent_name: agent_name.to_string(),
            message: message.to_string(),
            seq: next_seq,
            created_at: now,
        })
    }

    /// Return all agent log records for a session, ordered by seq.
    pub async fn get_agent_logs_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<AgentLogRecord>> {
        let rows = sqlx::query_as::<_, AgentLogRecord>(
            "SELECT id, session_id, phase, agent_name, message, seq, created_at \
             FROM agent_logs WHERE session_id = ? ORDER BY seq ASC",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Return agent log records with seq > `after_seq` (incremental polling).
    pub async fn get_agent_logs_since(
        &self,
        session_id: &str,
        after_seq: i64,
    ) -> Result<Vec<AgentLogRecord>> {
        let rows = sqlx::query_as::<_, AgentLogRecord>(
            "SELECT id, session_id, phase, agent_name, message, seq, created_at \
             FROM agent_logs WHERE session_id = ? AND seq > ? ORDER BY seq ASC",
        )
        .bind(session_id)
        .bind(after_seq)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Record a gate decision for auditing.
    pub async fn record_gate_decision(
        &self,
        session_id: &str,
        phase: &str,
        action: &str,
        note: Option<&str>,
    ) -> Result<GateDecisionRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO gate_decisions \
             (id, session_id, phase, action, note, decided_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(session_id)
        .bind(phase)
        .bind(action)
        .bind(note)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(GateDecisionRecord {
            id,
            session_id: session_id.to_string(),
            phase: phase.to_string(),
            action: action.to_string(),
            note: note.map(|s| s.to_string()),
            decided_at: now,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_get_session() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("Auth JWT", "sdd", "/home/user/myproject").await.unwrap();
        assert_eq!(session.feature_title, "Auth JWT");
        assert_eq!(session.status, "pending");
        assert_eq!(session.preset, "sdd");
        assert_eq!(session.project_path, "/home/user/myproject");

        let fetched = mgr.get_session(&session.id).await.unwrap().unwrap();
        assert_eq!(fetched.id, session.id);
        assert_eq!(fetched.preset, "sdd");
        assert_eq!(fetched.project_path, "/home/user/myproject");
    }

    #[tokio::test]
    async fn test_create_session_bmad_preset() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("Feature X", "bmad", "").await.unwrap();
        assert_eq!(session.preset, "bmad");
        let fetched = mgr.get_session(&session.id).await.unwrap().unwrap();
        assert_eq!(fetched.preset, "bmad");
    }

    #[tokio::test]
    async fn test_update_status() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("test feature", "sdd", "").await.unwrap();
        mgr.update_session_status(&session.id, "running")
            .await
            .unwrap();

        let fetched = mgr.get_session(&session.id).await.unwrap().unwrap();
        assert_eq!(fetched.status, "running");
    }

    #[tokio::test]
    async fn test_phase_records() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("test feature", "sdd", "").await.unwrap();
        let phase = mgr.create_phase_record(&session.id, "spec").await.unwrap();
        assert_eq!(phase.phase, "spec");

        mgr.complete_phase(&phase.id, "completed", None)
            .await
            .unwrap();
        let phases = mgr.get_phases_for_session(&session.id).await.unwrap();
        assert_eq!(phases.len(), 1);
        assert_eq!(phases[0].status, "completed");
    }

    #[tokio::test]
    async fn test_list_sessions() {
        let mgr = SessionManager::in_memory().await.unwrap();
        mgr.create_session("feature A", "sdd", "/proj/a").await.unwrap();
        mgr.create_session("feature B", "bmad", "/proj/b").await.unwrap();
        let sessions = mgr.list_sessions().await.unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[tokio::test]
    async fn test_list_sessions_for_project() {
        let mgr = SessionManager::in_memory().await.unwrap();
        mgr.create_session("feature A", "sdd", "/proj/alpha").await.unwrap();
        mgr.create_session("feature B", "sdd", "/proj/alpha").await.unwrap();
        mgr.create_session("feature C", "sdd", "/proj/beta").await.unwrap();
        let alpha = mgr.list_sessions_for_project("/proj/alpha").await.unwrap();
        assert_eq!(alpha.len(), 2);
        let beta = mgr.list_sessions_for_project("/proj/beta").await.unwrap();
        assert_eq!(beta.len(), 1);
        let none = mgr.list_sessions_for_project("/proj/gamma").await.unwrap();
        assert!(none.is_empty());
    }

    #[tokio::test]
    async fn test_record_and_list_artifacts() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("Artifact Test", "sdd", "").await.unwrap();
        let artifact = mgr
            .record_artifact(&session.id, "spec", "/tmp/spec.md", 1234)
            .await
            .unwrap();
        assert_eq!(artifact.phase, "spec");
        assert_eq!(artifact.size_bytes, 1234);
        assert_eq!(artifact.path, "/tmp/spec.md");

        let list = mgr.list_artifacts(&session.id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, artifact.id);
    }

    #[tokio::test]
    async fn test_record_gate_decision() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("Gate Test", "sdd", "").await.unwrap();
        let decision = mgr
            .record_gate_decision(&session.id, "spec", "approve", Some("LGTM"))
            .await
            .unwrap();
        assert_eq!(decision.action, "approve");
        assert_eq!(decision.note.as_deref(), Some("LGTM"));

        let reject = mgr
            .record_gate_decision(&session.id, "plan", "reject", None)
            .await
            .unwrap();
        assert_eq!(reject.action, "reject");
        assert!(reject.note.is_none());
    }

    #[tokio::test]
    async fn test_migrate_is_idempotent() {
        let mgr = SessionManager::in_memory().await.unwrap();
        // Second call to migrate should be a no-op.
        mgr.migrate().await.unwrap();
    }

    #[tokio::test]
    async fn test_record_and_get_agent_logs() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("Log Test", "sdd", "").await.unwrap();
        let log1 = mgr
            .record_agent_log(&session.id, "spec", "pm", "Starting spec...")
            .await
            .unwrap();
        assert_eq!(log1.seq, 1);
        assert_eq!(log1.phase, "spec");
        assert_eq!(log1.agent_name, "pm");

        let log2 = mgr
            .record_agent_log(&session.id, "spec", "pm", "Generating user stories...")
            .await
            .unwrap();
        assert_eq!(log2.seq, 2);

        let all = mgr.get_agent_logs_for_session(&session.id).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].seq, 1);
        assert_eq!(all[1].seq, 2);
    }

    #[tokio::test]
    async fn test_get_agent_logs_since() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr.create_session("Incremental Test", "sdd", "").await.unwrap();
        mgr.record_agent_log(&session.id, "spec", "pm", "msg1")
            .await
            .unwrap();
        mgr.record_agent_log(&session.id, "spec", "pm", "msg2")
            .await
            .unwrap();
        mgr.record_agent_log(&session.id, "spec", "pm", "msg3")
            .await
            .unwrap();

        let since = mgr.get_agent_logs_since(&session.id, 1).await.unwrap();
        assert_eq!(since.len(), 2);
        assert_eq!(since[0].message, "msg2");
        assert_eq!(since[1].message, "msg3");
    }

    #[tokio::test]
    async fn test_agent_log_seq_is_per_session() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let s1 = mgr.create_session("Session A", "sdd", "").await.unwrap();
        let s2 = mgr.create_session("Session B", "sdd", "").await.unwrap();
        let l1 = mgr
            .record_agent_log(&s1.id, "spec", "pm", "s1 log")
            .await
            .unwrap();
        let l2 = mgr
            .record_agent_log(&s2.id, "spec", "pm", "s2 log")
            .await
            .unwrap();
        // Each session starts from seq=1 independently.
        assert_eq!(l1.seq, 1);
        assert_eq!(l2.seq, 1);
    }
}
