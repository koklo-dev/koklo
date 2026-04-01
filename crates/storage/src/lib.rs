//! SQLite-backed session storage.
use anyhow::Result;
use chrono::Utc;
use koklo_events::TranscriptItem;
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
    /// Absolute path of the isolated session workspace. Falls back to `project_path`.
    pub workspace_path: String,
    /// Dedicated branch attached to the session workspace when Git isolation is available.
    pub workspace_branch: String,
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

/// A typed transcript item recorded for a session.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TranscriptItemRecord {
    pub id: String,
    pub session_id: String,
    pub phase: Option<String>,
    pub agent_name: Option<String>,
    pub source: String,
    pub kind: String,
    pub status: String,
    pub item_key: Option<String>,
    pub summary: String,
    pub payload_json: Option<String>,
    /// Monotonically increasing sequence number per session.
    pub seq: i64,
    pub created_at: String,
}

impl TranscriptItemRecord {
    pub fn payload(&self) -> Option<serde_json::Value> {
        self.payload_json
            .as_deref()
            .and_then(|value| serde_json::from_str(value).ok())
    }
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

/// A usage record for a single agent call.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UsageRecord {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    pub agent_name: String,
    pub provider: String,
    pub model: Option<String>,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cost_usd: Option<f64>,
    /// 'usd' | 'subscription' | 'free'
    pub cost_kind: String,
    pub recorded_at: String,
}

/// Input payload for recording a single usage row.
#[derive(Debug, Clone)]
pub struct UsageRecordInput<'a> {
    pub session_id: &'a str,
    pub phase: &'a str,
    pub agent_name: &'a str,
    pub provider: &'a str,
    pub model: Option<&'a str>,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cost_usd: Option<f64>,
    pub cost_kind: &'a str,
}

/// A full agent output stored for long-term memory + FTS.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentOutputRecord {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    pub agent_name: String,
    pub content: String,
    pub created_at: String,
}

/// Result from an FTS5 search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputSearchResult {
    pub id: String,
    pub session_id: String,
    pub phase: String,
    pub agent_name: String,
    pub snippet: String,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Preset, Agent, Memory, MCP record types
// ---------------------------------------------------------------------------

/// A persisted workflow preset.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PresetRecord {
    pub id: String,
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub reference_url: Option<String>,
    pub owner_scope: String,
    pub owner_id: String,
    pub is_builtin: bool,
    pub version: i64,
    pub sync_id: Option<String>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// A single phase entry within a preset.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PresetPhaseRecord {
    pub id: String,
    pub preset_id: String,
    pub seq: i64,
    pub phase: String,
    pub agent_slug: String,
    pub created_at: String,
}

/// A persisted agent definition.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentRecord {
    pub id: String,
    pub slug: String,
    pub display_name: String,
    pub title: String,
    pub emoji: String,
    pub owner_scope: String,
    pub owner_id: String,
    pub is_builtin: bool,
    pub version: i64,
    pub sync_id: Option<String>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// A scalar profile field for an agent (e.g. theme, vibe, mission).
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentProfileFieldRecord {
    pub id: String,
    pub agent_id: String,
    pub field: String,
    pub value: String,
}

/// A markdown fragment attached to an agent.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentFragmentRecord {
    pub id: String,
    pub agent_id: String,
    pub filename: String,
    pub content: String,
    pub sort_rank: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// A persisted memory entry.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MemoryRecord {
    pub id: String,
    pub scope: String,
    pub agent_slug: Option<String>,
    pub project_path: Option<String>,
    pub memory_key: String,
    pub content: String,
    pub version: i64,
    pub sync_id: Option<String>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// A persisted MCP server configuration.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct McpServerRecord {
    pub id: String,
    pub name: String,
    pub scope: String,
    pub project_path: Option<String>,
    pub transport: String,
    pub command: Option<String>,
    pub args_json: Option<String>,
    pub url: Option<String>,
    pub env_json: Option<String>,
    pub headers_json: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A persisted MCP skill/tool entry.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct McpSkillRecord {
    pub id: String,
    pub server_id: String,
    pub tool_name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub config_json: Option<String>,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Seed input types (generic, no dependency on agent-runtime)
// ---------------------------------------------------------------------------

/// Input data for seeding a built-in preset.
#[derive(Debug, Clone)]
pub struct SeedPreset {
    pub slug: String,
    pub display_name: String,
    pub description: String,
    pub reference_url: Option<String>,
    /// Ordered list of `(phase_name, agent_slug)` pairs.
    pub phases: Vec<(String, String)>,
}

/// Input data for seeding a built-in agent.
#[derive(Debug, Clone)]
pub struct SeedAgent {
    pub slug: String,
    pub display_name: String,
    pub title: String,
    pub emoji: String,
    /// Scalar profile fields: `(field_name, value)`.
    pub scalar_fields: Vec<(String, String)>,
    /// List profile fields: `(field_name, ordered_items)`.
    pub list_fields: Vec<(String, Vec<String>)>,
    /// Markdown fragments: `(filename, content, sort_rank)`.
    pub fragments: Vec<(String, String, i32)>,
}

/// Per-phase usage summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseUsageSummary {
    pub phase: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cost_usd: Option<f64>,
}

/// Session-level usage summary (grouped by phase).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUsageSummary {
    pub session_id: String,
    pub phases: Vec<PhaseUsageSummary>,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub total_cost_usd: Option<f64>,
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

        // Migration 005 — workspace metadata for isolated session execution.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 5")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/005_workspace.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        // Migration 006 — usage_records table.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 6")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/006_usage_records.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        // Migration 007 — agent_outputs + FTS5.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 7")
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(include_str!("../migrations/007_agent_outputs_fts.sql"))
                .execute(&self.pool)
                .await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (7, ?)")
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }

        // Migration 008 — typed transcript items.
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = 8")
                .fetch_one(&self.pool)
                .await?;
        let transcript_items_exists = self.table_exists("transcript_items").await?;
        if count == 0 || !transcript_items_exists {
            sqlx::query(include_str!("../migrations/008_transcript_items.sql"))
                .execute(&self.pool)
                .await?;
            if count == 0 {
                let now = Utc::now().to_rfc3339();
                sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (8, ?)")
                    .bind(&now)
                    .execute(&self.pool)
                    .await?;
            }
        }

        // Migration 009 — custom presets persistence.
        self.apply_migration(9, include_str!("../migrations/009_presets.sql"))
            .await?;

        // Migration 010 — agent definitions persistence.
        self.apply_migration(10, include_str!("../migrations/010_agents.sql"))
            .await?;

        // Migration 011 — agent memories.
        self.apply_migration(11, include_str!("../migrations/011_agent_memories.sql"))
            .await?;

        // Migration 012 — MCP servers and skills.
        self.apply_migration(12, include_str!("../migrations/012_mcp_servers.sql"))
            .await?;

        // Migration 013 — organizations (EE foundation tables).
        self.apply_migration(13, include_str!("../migrations/013_organizations.sql"))
            .await?;

        Ok(())
    }

    /// Apply a single migration if not yet applied.
    async fn apply_migration(&self, version: i64, sql: &str) -> Result<()> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM schema_migrations WHERE version = ?")
                .bind(version)
                .fetch_one(&self.pool)
                .await?;
        if count == 0 {
            sqlx::query(sql).execute(&self.pool).await?;
            let now = Utc::now().to_rfc3339();
            sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
                .bind(version)
                .bind(&now)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn table_exists(&self, table_name: &str) -> Result<bool> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
                .bind(table_name)
                .fetch_one(&self.pool)
                .await?;
        Ok(count > 0)
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
             (id, feature_title, status, preset, project_path, workspace_path, workspace_branch, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(feature_title)
        .bind("pending")
        .bind(preset)
        .bind(project_path)
        .bind(project_path)
        .bind("")
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
            workspace_path: project_path.to_string(),
            workspace_branch: String::new(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn update_session_workspace(
        &self,
        id: &str,
        workspace_path: &str,
        workspace_branch: &str,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE sessions \
             SET workspace_path = ?, workspace_branch = ?, updated_at = ? \
             WHERE id = ?",
        )
        .bind(workspace_path)
        .bind(workspace_branch)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<Session>> {
        let row = sqlx::query_as::<_, Session>(
            "SELECT id, feature_title, status, preset, project_path, workspace_path, workspace_branch, created_at, updated_at \
             FROM sessions WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        let rows = sqlx::query_as::<_, Session>(
            "SELECT id, feature_title, status, preset, project_path, workspace_path, workspace_branch, created_at, updated_at \
             FROM sessions ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// List sessions for a specific project root path, most recent first.
    pub async fn list_sessions_for_project(&self, path: &str) -> Result<Vec<Session>> {
        let rows = sqlx::query_as::<_, Session>(
            "SELECT id, feature_title, status, preset, project_path, workspace_path, workspace_branch, created_at, updated_at \
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

    /// Record a typed transcript item for a session.
    pub async fn record_transcript_item(
        &self,
        item: &TranscriptItem,
    ) -> Result<TranscriptItemRecord> {
        let now = Utc::now().to_rfc3339();
        let (next_seq,): (i64,) = sqlx::query_as(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM transcript_items WHERE session_id = ?",
        )
        .bind(&item.session_id)
        .fetch_one(&self.pool)
        .await?;
        let payload_json = item
            .payload
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let phase = item.phase.map(|phase| phase.to_string());
        let source = enum_label(&item.source);
        let kind = enum_label(&item.kind);
        let status = enum_label(&item.status);
        sqlx::query(
            "INSERT INTO transcript_items \
             (id, session_id, phase, agent_name, source, kind, status, item_key, summary, payload_json, seq, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&item.session_id)
        .bind(&phase)
        .bind(&item.agent_name)
        .bind(&source)
        .bind(&kind)
        .bind(&status)
        .bind(&item.item_key)
        .bind(&item.summary)
        .bind(&payload_json)
        .bind(next_seq)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(TranscriptItemRecord {
            id: item.id.clone(),
            session_id: item.session_id.clone(),
            phase,
            agent_name: item.agent_name.clone(),
            source,
            kind,
            status,
            item_key: item.item_key.clone(),
            summary: item.summary.clone(),
            payload_json,
            seq: next_seq,
            created_at: now,
        })
    }

    /// Return all transcript items for a session, ordered by seq.
    pub async fn get_transcript_items_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<TranscriptItemRecord>> {
        let rows = sqlx::query_as::<_, TranscriptItemRecord>(
            "SELECT id, session_id, phase, agent_name, source, kind, status, item_key, summary, payload_json, seq, created_at \
             FROM transcript_items WHERE session_id = ? ORDER BY seq ASC",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Return transcript items with seq > `after_seq` (incremental polling).
    pub async fn get_transcript_items_since(
        &self,
        session_id: &str,
        after_seq: i64,
    ) -> Result<Vec<TranscriptItemRecord>> {
        let rows = sqlx::query_as::<_, TranscriptItemRecord>(
            "SELECT id, session_id, phase, agent_name, source, kind, status, item_key, summary, payload_json, seq, created_at \
             FROM transcript_items WHERE session_id = ? AND seq > ? ORDER BY seq ASC",
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

    /// Record LLM usage for a phase/agent call.
    pub async fn record_usage(&self, usage: UsageRecordInput<'_>) -> Result<UsageRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO usage_records \
             (id, session_id, phase, agent_name, provider, model, prompt_tokens, completion_tokens, cost_usd, cost_kind, recorded_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(usage.session_id)
        .bind(usage.phase)
        .bind(usage.agent_name)
        .bind(usage.provider)
        .bind(usage.model)
        .bind(usage.prompt_tokens as i64)
        .bind(usage.completion_tokens as i64)
        .bind(usage.cost_usd)
        .bind(usage.cost_kind)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(UsageRecord {
            id,
            session_id: usage.session_id.to_string(),
            phase: usage.phase.to_string(),
            agent_name: usage.agent_name.to_string(),
            provider: usage.provider.to_string(),
            model: usage.model.map(|s| s.to_string()),
            prompt_tokens: usage.prompt_tokens as i64,
            completion_tokens: usage.completion_tokens as i64,
            cost_usd: usage.cost_usd,
            cost_kind: usage.cost_kind.to_string(),
            recorded_at: now,
        })
    }

    /// Get usage summary grouped by phase for a session.
    pub async fn get_session_usage_summary(&self, session_id: &str) -> Result<SessionUsageSummary> {
        let rows: Vec<(String, i64, i64, Option<f64>)> = sqlx::query_as(
            "SELECT phase, SUM(prompt_tokens), SUM(completion_tokens), SUM(cost_usd) \
             FROM usage_records WHERE session_id = ? GROUP BY phase",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await?;

        let phases: Vec<PhaseUsageSummary> = rows
            .iter()
            .map(|(phase, pt, ct, cost)| PhaseUsageSummary {
                phase: phase.clone(),
                prompt_tokens: *pt,
                completion_tokens: *ct,
                cost_usd: *cost,
            })
            .collect();

        let total_prompt: i64 = phases.iter().map(|p| p.prompt_tokens).sum();
        let total_completion: i64 = phases.iter().map(|p| p.completion_tokens).sum();
        let total_cost: Option<f64> = {
            let costs: Vec<f64> = phases.iter().filter_map(|p| p.cost_usd).collect();
            if costs.is_empty() {
                None
            } else {
                Some(costs.iter().sum())
            }
        };

        Ok(SessionUsageSummary {
            session_id: session_id.to_string(),
            phases,
            total_prompt_tokens: total_prompt,
            total_completion_tokens: total_completion,
            total_cost_usd: total_cost,
        })
    }

    /// Record a full agent output for long-term memory + FTS.
    pub async fn record_agent_output(
        &self,
        session_id: &str,
        phase: &str,
        agent_name: &str,
        content: &str,
    ) -> Result<AgentOutputRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO agent_outputs \
             (id, session_id, phase, agent_name, content, created_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(session_id)
        .bind(phase)
        .bind(agent_name)
        .bind(content)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(AgentOutputRecord {
            id,
            session_id: session_id.to_string(),
            phase: phase.to_string(),
            agent_name: agent_name.to_string(),
            content: content.to_string(),
            created_at: now,
        })
    }

    /// Full-text search across agent outputs using FTS5.
    pub async fn search_outputs(&self, query: &str) -> Result<Vec<OutputSearchResult>> {
        // Use FTS5 MATCH with snippet() function
        let rows: Vec<(String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT ao.id, ao.session_id, ao.phase, ao.agent_name, \
             snippet(agent_outputs_fts, 0, '[', ']', '...', 20), ao.created_at \
             FROM agent_outputs ao \
             JOIN agent_outputs_fts ON agent_outputs_fts.rowid = ao.rowid \
             WHERE agent_outputs_fts MATCH ? \
             ORDER BY ao.created_at DESC LIMIT 50",
        )
        .bind(query)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(
                |(id, session_id, phase, agent_name, snippet, created_at)| OutputSearchResult {
                    id,
                    session_id,
                    phase,
                    agent_name,
                    snippet,
                    created_at,
                },
            )
            .collect())
    }

    // -----------------------------------------------------------------------
    // Preset CRUD
    // -----------------------------------------------------------------------

    /// Seed built-in presets (idempotent).
    pub async fn seed_presets(&self, presets: &[SeedPreset]) -> Result<()> {
        for p in presets {
            let now = Utc::now().to_rfc3339();
            let existing: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM presets WHERE slug = ? AND owner_scope = 'product' AND owner_id = 'default'",
            )
            .bind(&p.slug)
            .fetch_optional(&self.pool)
            .await?;

            let preset_id = if let Some((id,)) = existing {
                // Update existing built-in preset.
                sqlx::query(
                    "UPDATE presets SET display_name = ?, description = ?, reference_url = ?, updated_at = ? WHERE id = ?",
                )
                .bind(&p.display_name)
                .bind(&p.description)
                .bind(&p.reference_url)
                .bind(&now)
                .bind(&id)
                .execute(&self.pool)
                .await?;
                // Clear old phases.
                sqlx::query("DELETE FROM preset_phases WHERE preset_id = ?")
                    .bind(&id)
                    .execute(&self.pool)
                    .await?;
                id
            } else {
                let id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO presets (id, slug, display_name, description, reference_url, owner_scope, owner_id, is_builtin, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, 'product', 'default', 1, ?, ?)",
                )
                .bind(&id)
                .bind(&p.slug)
                .bind(&p.display_name)
                .bind(&p.description)
                .bind(&p.reference_url)
                .bind(&now)
                .bind(&now)
                .execute(&self.pool)
                .await?;
                id
            };

            // Insert phases.
            for (seq, (phase, agent_slug)) in p.phases.iter().enumerate() {
                let phase_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO preset_phases (id, preset_id, seq, phase, agent_slug, created_at) \
                     VALUES (?, ?, ?, ?, ?, ?)",
                )
                .bind(&phase_id)
                .bind(&preset_id)
                .bind(seq as i64)
                .bind(phase)
                .bind(agent_slug)
                .bind(&now)
                .execute(&self.pool)
                .await?;
            }
        }
        Ok(())
    }

    /// Create a custom preset.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_preset(
        &self,
        owner_scope: &str,
        owner_id: &str,
        slug: &str,
        display_name: &str,
        description: &str,
        reference_url: Option<&str>,
        phases: &[(String, String)],
    ) -> Result<PresetRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO presets (id, slug, display_name, description, reference_url, owner_scope, owner_id, is_builtin, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&id)
        .bind(slug)
        .bind(display_name)
        .bind(description)
        .bind(reference_url)
        .bind(owner_scope)
        .bind(owner_id)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        for (seq, (phase, agent_slug)) in phases.iter().enumerate() {
            let phase_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO preset_phases (id, preset_id, seq, phase, agent_slug, created_at) \
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&phase_id)
            .bind(&id)
            .bind(seq as i64)
            .bind(phase)
            .bind(agent_slug)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }

        Ok(PresetRecord {
            id,
            slug: slug.to_string(),
            display_name: display_name.to_string(),
            description: description.to_string(),
            reference_url: reference_url.map(|s| s.to_string()),
            owner_scope: owner_scope.to_string(),
            owner_id: owner_id.to_string(),
            is_builtin: false,
            version: 1,
            sync_id: None,
            last_synced_at: None,
            created_at: now.clone(),
            updated_at: now,
            deleted_at: None,
        })
    }

    /// Resolve a preset by slug using scope precedence: project > user > org > product.
    pub async fn resolve_preset(
        &self,
        slug: &str,
        project_id: &str,
        user_id: &str,
        org_id: &str,
    ) -> Result<Option<PresetRecord>> {
        let row = sqlx::query_as::<_, PresetRecord>(
            "SELECT * FROM presets \
             WHERE slug = ? AND deleted_at IS NULL \
               AND ( \
                 (owner_scope = 'project' AND owner_id = ?) \
                 OR (owner_scope = 'user' AND owner_id = ?) \
                 OR (owner_scope = 'org' AND owner_id = ?) \
                 OR (owner_scope = 'product') \
               ) \
             ORDER BY CASE owner_scope \
               WHEN 'project' THEN 0 \
               WHEN 'user' THEN 1 \
               WHEN 'org' THEN 2 \
               WHEN 'product' THEN 3 \
             END \
             LIMIT 1",
        )
        .bind(slug)
        .bind(project_id)
        .bind(user_id)
        .bind(org_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// Get the ordered phases for a preset.
    pub async fn get_preset_phases(&self, preset_id: &str) -> Result<Vec<PresetPhaseRecord>> {
        let rows = sqlx::query_as::<_, PresetPhaseRecord>(
            "SELECT id, preset_id, seq, phase, agent_slug, created_at \
             FROM preset_phases WHERE preset_id = ? ORDER BY seq ASC",
        )
        .bind(preset_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// List all non-deleted presets visible to the given scopes.
    pub async fn list_presets(
        &self,
        owner_scope: Option<&str>,
        owner_id: Option<&str>,
    ) -> Result<Vec<PresetRecord>> {
        let rows = if let (Some(scope), Some(id)) = (owner_scope, owner_id) {
            sqlx::query_as::<_, PresetRecord>(
                "SELECT * FROM presets WHERE owner_scope = ? AND owner_id = ? AND deleted_at IS NULL \
                 ORDER BY slug ASC",
            )
            .bind(scope)
            .bind(id)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, PresetRecord>(
                "SELECT * FROM presets WHERE deleted_at IS NULL ORDER BY slug ASC",
            )
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows)
    }

    /// Soft-delete a preset.
    pub async fn delete_preset(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE presets SET deleted_at = ?, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Count custom (non-builtin) presets for a given owner.
    pub async fn count_custom_presets(&self, owner_scope: &str, owner_id: &str) -> Result<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM presets WHERE owner_scope = ? AND owner_id = ? AND is_builtin = 0 AND deleted_at IS NULL",
        )
        .bind(owner_scope)
        .bind(owner_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    // -----------------------------------------------------------------------
    // Agent CRUD
    // -----------------------------------------------------------------------

    /// Seed built-in agents (idempotent).
    pub async fn seed_agents(&self, agents: &[SeedAgent]) -> Result<()> {
        for a in agents {
            let now = Utc::now().to_rfc3339();
            let existing: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM agents WHERE slug = ? AND owner_scope = 'product' AND owner_id = 'default'",
            )
            .bind(&a.slug)
            .fetch_optional(&self.pool)
            .await?;

            let agent_id = if let Some((id,)) = existing {
                sqlx::query(
                    "UPDATE agents SET display_name = ?, title = ?, emoji = ?, updated_at = ? WHERE id = ?",
                )
                .bind(&a.display_name)
                .bind(&a.title)
                .bind(&a.emoji)
                .bind(&now)
                .bind(&id)
                .execute(&self.pool)
                .await?;
                // Clear old profile data.
                sqlx::query("DELETE FROM agent_profile_fields WHERE agent_id = ?")
                    .bind(&id)
                    .execute(&self.pool)
                    .await?;
                sqlx::query("DELETE FROM agent_profile_list_items WHERE agent_id = ?")
                    .bind(&id)
                    .execute(&self.pool)
                    .await?;
                sqlx::query("DELETE FROM agent_fragments WHERE agent_id = ?")
                    .bind(&id)
                    .execute(&self.pool)
                    .await?;
                id
            } else {
                let id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO agents (id, slug, display_name, title, emoji, owner_scope, owner_id, is_builtin, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, 'product', 'default', 1, ?, ?)",
                )
                .bind(&id)
                .bind(&a.slug)
                .bind(&a.display_name)
                .bind(&a.title)
                .bind(&a.emoji)
                .bind(&now)
                .bind(&now)
                .execute(&self.pool)
                .await?;
                id
            };

            // Scalar fields.
            for (field, value) in &a.scalar_fields {
                let fid = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO agent_profile_fields (id, agent_id, field, value) VALUES (?, ?, ?, ?)",
                )
                .bind(&fid)
                .bind(&agent_id)
                .bind(field)
                .bind(value)
                .execute(&self.pool)
                .await?;
            }

            // List fields.
            for (field, items) in &a.list_fields {
                for (seq, value) in items.iter().enumerate() {
                    let lid = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO agent_profile_list_items (id, agent_id, field, seq, value) VALUES (?, ?, ?, ?, ?)",
                    )
                    .bind(&lid)
                    .bind(&agent_id)
                    .bind(field)
                    .bind(seq as i64)
                    .bind(value)
                    .execute(&self.pool)
                    .await?;
                }
            }

            // Fragments.
            for (filename, content, sort_rank) in &a.fragments {
                let fid = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO agent_fragments (id, agent_id, filename, content, sort_rank, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&fid)
                .bind(&agent_id)
                .bind(filename)
                .bind(content)
                .bind(*sort_rank as i64)
                .bind(&now)
                .bind(&now)
                .execute(&self.pool)
                .await?;
            }
        }
        Ok(())
    }

    /// Create a custom agent.
    pub async fn create_agent(
        &self,
        owner_scope: &str,
        owner_id: &str,
        slug: &str,
        display_name: &str,
        title: &str,
        emoji: &str,
    ) -> Result<AgentRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO agents (id, slug, display_name, title, emoji, owner_scope, owner_id, is_builtin, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&id)
        .bind(slug)
        .bind(display_name)
        .bind(title)
        .bind(emoji)
        .bind(owner_scope)
        .bind(owner_id)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(AgentRecord {
            id,
            slug: slug.to_string(),
            display_name: display_name.to_string(),
            title: title.to_string(),
            emoji: emoji.to_string(),
            owner_scope: owner_scope.to_string(),
            owner_id: owner_id.to_string(),
            is_builtin: false,
            version: 1,
            sync_id: None,
            last_synced_at: None,
            created_at: now.clone(),
            updated_at: now,
            deleted_at: None,
        })
    }

    /// Resolve an agent by slug using scope precedence.
    pub async fn resolve_agent(
        &self,
        slug: &str,
        project_id: &str,
        user_id: &str,
        org_id: &str,
    ) -> Result<Option<AgentRecord>> {
        let row = sqlx::query_as::<_, AgentRecord>(
            "SELECT * FROM agents \
             WHERE slug = ? AND deleted_at IS NULL \
               AND ( \
                 (owner_scope = 'project' AND owner_id = ?) \
                 OR (owner_scope = 'user' AND owner_id = ?) \
                 OR (owner_scope = 'org' AND owner_id = ?) \
                 OR (owner_scope = 'product') \
               ) \
             ORDER BY CASE owner_scope \
               WHEN 'project' THEN 0 \
               WHEN 'user' THEN 1 \
               WHEN 'org' THEN 2 \
               WHEN 'product' THEN 3 \
             END \
             LIMIT 1",
        )
        .bind(slug)
        .bind(project_id)
        .bind(user_id)
        .bind(org_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// Get all fragments for an agent, ordered by sort_rank.
    pub async fn get_agent_fragments(&self, agent_id: &str) -> Result<Vec<AgentFragmentRecord>> {
        let rows = sqlx::query_as::<_, AgentFragmentRecord>(
            "SELECT id, agent_id, filename, content, sort_rank, created_at, updated_at \
             FROM agent_fragments WHERE agent_id = ? ORDER BY sort_rank ASC, filename ASC",
        )
        .bind(agent_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Get scalar profile fields for an agent.
    pub async fn get_agent_profile_fields(
        &self,
        agent_id: &str,
    ) -> Result<Vec<AgentProfileFieldRecord>> {
        let rows = sqlx::query_as::<_, AgentProfileFieldRecord>(
            "SELECT id, agent_id, field, value FROM agent_profile_fields WHERE agent_id = ?",
        )
        .bind(agent_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// List all non-deleted agents, optionally filtered by scope.
    pub async fn list_agents(
        &self,
        owner_scope: Option<&str>,
        owner_id: Option<&str>,
    ) -> Result<Vec<AgentRecord>> {
        let rows = if let (Some(scope), Some(id)) = (owner_scope, owner_id) {
            sqlx::query_as::<_, AgentRecord>(
                "SELECT * FROM agents WHERE owner_scope = ? AND owner_id = ? AND deleted_at IS NULL \
                 ORDER BY slug ASC",
            )
            .bind(scope)
            .bind(id)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, AgentRecord>(
                "SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY slug ASC",
            )
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows)
    }

    /// Soft-delete an agent.
    pub async fn delete_agent(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE agents SET deleted_at = ?, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Count custom (non-builtin) agents for a given owner.
    pub async fn count_custom_agents(&self, owner_scope: &str, owner_id: &str) -> Result<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM agents WHERE owner_scope = ? AND owner_id = ? AND is_builtin = 0 AND deleted_at IS NULL",
        )
        .bind(owner_scope)
        .bind(owner_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    // -----------------------------------------------------------------------
    // Memory CRUD
    // -----------------------------------------------------------------------

    /// Insert or update a memory entry.
    pub async fn upsert_memory(
        &self,
        scope: &str,
        agent_slug: Option<&str>,
        project_path: Option<&str>,
        key: &str,
        content: &str,
    ) -> Result<MemoryRecord> {
        let now = Utc::now().to_rfc3339();
        let existing: Option<(String, i64)> = sqlx::query_as(
            "SELECT id, version FROM agent_memories \
             WHERE scope = ? AND COALESCE(agent_slug, '') = ? AND COALESCE(project_path, '') = ? AND memory_key = ?",
        )
        .bind(scope)
        .bind(agent_slug.unwrap_or(""))
        .bind(project_path.unwrap_or(""))
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;

        if let Some((id, version)) = existing {
            let new_version = version + 1;
            sqlx::query(
                "UPDATE agent_memories SET content = ?, version = ?, updated_at = ?, deleted_at = NULL WHERE id = ?",
            )
            .bind(content)
            .bind(new_version)
            .bind(&now)
            .bind(&id)
            .execute(&self.pool)
            .await?;

            Ok(MemoryRecord {
                id,
                scope: scope.to_string(),
                agent_slug: agent_slug.map(|s| s.to_string()),
                project_path: project_path.map(|s| s.to_string()),
                memory_key: key.to_string(),
                content: content.to_string(),
                version: new_version,
                sync_id: None,
                last_synced_at: None,
                created_at: now.clone(),
                updated_at: now,
                deleted_at: None,
            })
        } else {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO agent_memories (id, scope, agent_slug, project_path, memory_key, content, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(scope)
            .bind(agent_slug)
            .bind(project_path)
            .bind(key)
            .bind(content)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;

            Ok(MemoryRecord {
                id,
                scope: scope.to_string(),
                agent_slug: agent_slug.map(|s| s.to_string()),
                project_path: project_path.map(|s| s.to_string()),
                memory_key: key.to_string(),
                content: content.to_string(),
                version: 1,
                sync_id: None,
                last_synced_at: None,
                created_at: now.clone(),
                updated_at: now,
                deleted_at: None,
            })
        }
    }

    /// Get all memories for a given scope.
    pub async fn get_memories(
        &self,
        scope: &str,
        agent_slug: Option<&str>,
        project_path: Option<&str>,
    ) -> Result<Vec<MemoryRecord>> {
        let rows = sqlx::query_as::<_, MemoryRecord>(
            "SELECT * FROM agent_memories \
             WHERE scope = ? AND COALESCE(agent_slug, '') = ? AND COALESCE(project_path, '') = ? \
               AND deleted_at IS NULL \
             ORDER BY memory_key ASC",
        )
        .bind(scope)
        .bind(agent_slug.unwrap_or(""))
        .bind(project_path.unwrap_or(""))
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Soft-delete a memory.
    pub async fn delete_memory(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE agent_memories SET deleted_at = ?, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // MCP Server CRUD
    // -----------------------------------------------------------------------

    /// Insert or update an MCP server.
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_mcp_server(
        &self,
        name: &str,
        scope: &str,
        project_path: Option<&str>,
        transport: &str,
        command: Option<&str>,
        args_json: Option<&str>,
        url: Option<&str>,
        env_json: Option<&str>,
        headers_json: Option<&str>,
    ) -> Result<McpServerRecord> {
        let now = Utc::now().to_rfc3339();
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM mcp_servers \
             WHERE name = ? AND scope = ? AND COALESCE(project_path, '') = ?",
        )
        .bind(name)
        .bind(scope)
        .bind(project_path.unwrap_or(""))
        .fetch_optional(&self.pool)
        .await?;

        if let Some((id,)) = existing {
            sqlx::query(
                "UPDATE mcp_servers SET transport = ?, command = ?, args_json = ?, url = ?, \
                 env_json = ?, headers_json = ?, updated_at = ? WHERE id = ?",
            )
            .bind(transport)
            .bind(command)
            .bind(args_json)
            .bind(url)
            .bind(env_json)
            .bind(headers_json)
            .bind(&now)
            .bind(&id)
            .execute(&self.pool)
            .await?;

            Ok(McpServerRecord {
                id,
                name: name.to_string(),
                scope: scope.to_string(),
                project_path: project_path.map(|s| s.to_string()),
                transport: transport.to_string(),
                command: command.map(|s| s.to_string()),
                args_json: args_json.map(|s| s.to_string()),
                url: url.map(|s| s.to_string()),
                env_json: env_json.map(|s| s.to_string()),
                headers_json: headers_json.map(|s| s.to_string()),
                enabled: true,
                created_at: now.clone(),
                updated_at: now,
            })
        } else {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO mcp_servers (id, name, scope, project_path, transport, command, args_json, url, env_json, headers_json, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(name)
            .bind(scope)
            .bind(project_path)
            .bind(transport)
            .bind(command)
            .bind(args_json)
            .bind(url)
            .bind(env_json)
            .bind(headers_json)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;

            Ok(McpServerRecord {
                id,
                name: name.to_string(),
                scope: scope.to_string(),
                project_path: project_path.map(|s| s.to_string()),
                transport: transport.to_string(),
                command: command.map(|s| s.to_string()),
                args_json: args_json.map(|s| s.to_string()),
                url: url.map(|s| s.to_string()),
                env_json: env_json.map(|s| s.to_string()),
                headers_json: headers_json.map(|s| s.to_string()),
                enabled: true,
                created_at: now.clone(),
                updated_at: now,
            })
        }
    }

    /// List MCP servers, merging global + project (project overrides global by name).
    pub async fn resolve_mcp_servers(
        &self,
        project_path: Option<&str>,
    ) -> Result<Vec<McpServerRecord>> {
        let rows = if let Some(pp) = project_path {
            sqlx::query_as::<_, McpServerRecord>(
                "SELECT * FROM mcp_servers WHERE (scope = 'global' OR (scope = 'project' AND project_path = ?)) AND enabled = 1 \
                 ORDER BY CASE scope WHEN 'project' THEN 0 ELSE 1 END, name ASC",
            )
            .bind(pp)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, McpServerRecord>(
                "SELECT * FROM mcp_servers WHERE scope = 'global' AND enabled = 1 ORDER BY name ASC",
            )
            .fetch_all(&self.pool)
            .await?
        };

        // Deduplicate: project-scoped wins over global for same name.
        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        for row in rows {
            if seen.insert(row.name.clone()) {
                result.push(row);
            }
        }
        Ok(result)
    }

    /// List MCP skills for a server.
    pub async fn list_mcp_skills(&self, server_id: &str) -> Result<Vec<McpSkillRecord>> {
        let rows = sqlx::query_as::<_, McpSkillRecord>(
            "SELECT id, server_id, tool_name, description, enabled, config_json, created_at \
             FROM mcp_skills WHERE server_id = ? ORDER BY tool_name ASC",
        )
        .bind(server_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    // -----------------------------------------------------------------------
    // Import helpers
    // -----------------------------------------------------------------------

    /// Import existing markdown memory files from disk into the database.
    ///
    /// Reads files from `global_home` (`~/.koklo/`) and optionally a project
    /// `.koklo/` directory.  Returns the number of records imported.
    pub async fn import_markdown_memories(
        &self,
        global_home: &std::path::Path,
        project_path: Option<&str>,
        project_context: Option<&std::path::Path>,
    ) -> Result<u32> {
        let mut count = 0u32;

        // Global MEMORY.md
        let global_memory = global_home.join("MEMORY.md");
        if global_memory.exists() {
            let content = std::fs::read_to_string(&global_memory)?;
            if !content.trim().is_empty() {
                self.upsert_memory("global", None, None, "MEMORY.md", content.trim())
                    .await?;
                count += 1;
            }
        }

        // Global daily memories
        let global_memories_dir = global_home.join("memories");
        if global_memories_dir.is_dir() {
            for entry in std::fs::read_dir(&global_memories_dir)? {
                let entry = entry?;
                if entry.file_type()?.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".md") {
                        let content = std::fs::read_to_string(entry.path())?;
                        if !content.trim().is_empty() {
                            self.upsert_memory("global", None, None, &name, content.trim())
                                .await?;
                            count += 1;
                        }
                    }
                }
            }
        }

        // Project memories
        if let Some(ctx) = project_context {
            let proj_memory = ctx.join("MEMORY.md");
            if proj_memory.exists() {
                let content = std::fs::read_to_string(&proj_memory)?;
                if !content.trim().is_empty() {
                    self.upsert_memory("project", None, project_path, "MEMORY.md", content.trim())
                        .await?;
                    count += 1;
                }
            }

            let proj_memories_dir = ctx.join("memories");
            if proj_memories_dir.is_dir() {
                for entry in std::fs::read_dir(&proj_memories_dir)? {
                    let entry = entry?;
                    if entry.file_type()?.is_file() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.ends_with(".md") {
                            let content = std::fs::read_to_string(entry.path())?;
                            if !content.trim().is_empty() {
                                self.upsert_memory(
                                    "project",
                                    None,
                                    project_path,
                                    &name,
                                    content.trim(),
                                )
                                .await?;
                                count += 1;
                            }
                        }
                    }
                }
            }
        }

        Ok(count)
    }

    /// Import MCP server configuration from a `.mcp.json` file.
    ///
    /// Parses the JSON and upserts each server entry.  Returns the number
    /// of servers imported.
    pub async fn import_mcp_json(
        &self,
        path: &std::path::Path,
        scope: &str,
        project_path: Option<&str>,
    ) -> Result<u32> {
        let content = std::fs::read_to_string(path)?;
        let json: serde_json::Value = serde_json::from_str(&content)?;

        let servers = json
            .get("mcpServers")
            .or_else(|| json.get("servers"))
            .and_then(|v| v.as_object());

        let Some(servers) = servers else {
            return Ok(0);
        };

        let mut count = 0u32;
        for (name, config) in servers {
            let transport = config
                .get("type")
                .or_else(|| config.get("transport"))
                .and_then(|v| v.as_str())
                .unwrap_or("stdio");

            let command = config.get("command").and_then(|v| v.as_str());
            let args_json = config
                .get("args")
                .map(serde_json::to_string)
                .transpose()?;
            let url = config.get("url").and_then(|v| v.as_str());
            let env_json = config
                .get("env")
                .map(serde_json::to_string)
                .transpose()?;
            let headers_json = config
                .get("headers")
                .map(serde_json::to_string)
                .transpose()?;

            self.upsert_mcp_server(
                name,
                scope,
                project_path,
                transport,
                command,
                args_json.as_deref(),
                url,
                env_json.as_deref(),
                headers_json.as_deref(),
            )
            .await?;
            count += 1;
        }

        Ok(count)
    }

    /// Expose the pool for extension migrations.
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

fn enum_label(value: &impl std::fmt::Debug) -> String {
    let debug = format!("{:?}", value);
    let mut out = String::with_capacity(debug.len() + 4);
    for (idx, ch) in debug.chars().enumerate() {
        if ch.is_ascii_uppercase() {
            if idx > 0 {
                out.push('_');
            }
            out.push(ch.to_ascii_lowercase());
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_get_session() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr
            .create_session("Auth JWT", "sdd", "/home/user/myproject")
            .await
            .unwrap();
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
        mgr.create_session("feature A", "sdd", "/proj/a")
            .await
            .unwrap();
        mgr.create_session("feature B", "bmad", "/proj/b")
            .await
            .unwrap();
        let sessions = mgr.list_sessions().await.unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[tokio::test]
    async fn test_list_sessions_for_project() {
        let mgr = SessionManager::in_memory().await.unwrap();
        mgr.create_session("feature A", "sdd", "/proj/alpha")
            .await
            .unwrap();
        mgr.create_session("feature B", "sdd", "/proj/alpha")
            .await
            .unwrap();
        mgr.create_session("feature C", "sdd", "/proj/beta")
            .await
            .unwrap();
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
        let session = mgr
            .create_session("Artifact Test", "sdd", "")
            .await
            .unwrap();
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
    async fn test_migrate_repairs_missing_transcript_items_table_when_version_marker_exists() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE schema_migrations \
             (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO schema_migrations (version, applied_at) VALUES (8, ?)")
            .bind(Utc::now().to_rfc3339())
            .execute(&pool)
            .await
            .unwrap();

        let mgr = SessionManager { pool };
        mgr.migrate().await.unwrap();

        let exists = mgr.table_exists("transcript_items").await.unwrap();
        assert!(exists);
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
        let session = mgr
            .create_session("Incremental Test", "sdd", "")
            .await
            .unwrap();
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

    #[tokio::test]
    async fn test_record_and_get_transcript_items() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let session = mgr
            .create_session("Transcript Test", "sdd", "")
            .await
            .unwrap();
        let first = TranscriptItem::new(
            session.id.clone(),
            None,
            Some("developer".to_string()),
            koklo_events::TranscriptSource::Agent,
            koklo_events::TranscriptItemKind::MessageDelta,
            koklo_events::TranscriptItemStatus::Streaming,
            "hello",
        );
        let second = TranscriptItem::new(
            session.id.clone(),
            Some(koklo_events::Phase::Implement),
            Some("developer".to_string()),
            koklo_events::TranscriptSource::Tool,
            koklo_events::TranscriptItemKind::ToolCall,
            koklo_events::TranscriptItemStatus::Pending,
            "rg src",
        )
        .with_payload(serde_json::json!({ "tool_name": "bash" }));

        let rec1 = mgr.record_transcript_item(&first).await.unwrap();
        let rec2 = mgr.record_transcript_item(&second).await.unwrap();

        assert_eq!(rec1.seq, 1);
        assert_eq!(rec2.seq, 2);
        assert_eq!(rec2.kind, "tool_call");
        assert!(rec2.payload().is_some());

        let all = mgr
            .get_transcript_items_for_session(&session.id)
            .await
            .unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].summary, "hello");
        assert_eq!(all[1].phase.as_deref(), Some("implement"));

        let since = mgr
            .get_transcript_items_since(&session.id, 1)
            .await
            .unwrap();
        assert_eq!(since.len(), 1);
        assert_eq!(since[0].summary, "rg src");
    }

    // -------------------------------------------------------------------
    // Preset tests
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn test_seed_presets_idempotent() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let seed = vec![SeedPreset {
            slug: "sdd".into(),
            display_name: "Spec-Driven Development".into(),
            description: "5-phase pipeline".into(),
            reference_url: None,
            phases: vec![
                ("spec".into(), "pm".into()),
                ("plan".into(), "architect".into()),
                ("implement".into(), "developer".into()),
            ],
        }];
        mgr.seed_presets(&seed).await.unwrap();
        // Second call is idempotent.
        mgr.seed_presets(&seed).await.unwrap();

        let list = mgr
            .list_presets(Some("product"), Some("default"))
            .await
            .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].slug, "sdd");
        assert!(list[0].is_builtin);

        let phases = mgr.get_preset_phases(&list[0].id).await.unwrap();
        assert_eq!(phases.len(), 3);
        assert_eq!(phases[0].phase, "spec");
        assert_eq!(phases[0].agent_slug, "pm");
        assert_eq!(phases[2].phase, "implement");
    }

    #[tokio::test]
    async fn test_create_custom_preset() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let preset = mgr
            .create_preset(
                "user",
                "user-123",
                "my-flow",
                "My Custom Flow",
                "A custom workflow",
                None,
                &[
                    ("spec".into(), "pm".into()),
                    ("implement".into(), "developer".into()),
                ],
            )
            .await
            .unwrap();
        assert_eq!(preset.slug, "my-flow");
        assert!(!preset.is_builtin);
        assert_eq!(preset.owner_scope, "user");

        let count = mgr.count_custom_presets("user", "user-123").await.unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn test_resolve_preset_precedence() {
        let mgr = SessionManager::in_memory().await.unwrap();
        // Seed product-level preset.
        mgr.seed_presets(&[SeedPreset {
            slug: "sdd".into(),
            display_name: "SDD Product".into(),
            description: "".into(),
            reference_url: None,
            phases: vec![("spec".into(), "pm".into())],
        }])
        .await
        .unwrap();

        // Create user-level override.
        mgr.create_preset(
            "user",
            "user-1",
            "sdd",
            "SDD User Override",
            "",
            None,
            &[
                ("spec".into(), "pm".into()),
                ("review".into(), "reviewer".into()),
            ],
        )
        .await
        .unwrap();

        // Resolve: user wins over product.
        let resolved = mgr
            .resolve_preset("sdd", "", "user-1", "")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.display_name, "SDD User Override");
        assert_eq!(resolved.owner_scope, "user");

        // Create project-level override.
        mgr.create_preset(
            "project",
            "/proj/a",
            "sdd",
            "SDD Project Override",
            "",
            None,
            &[("implement".into(), "developer".into())],
        )
        .await
        .unwrap();

        // Resolve: project wins over user.
        let resolved = mgr
            .resolve_preset("sdd", "/proj/a", "user-1", "")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.display_name, "SDD Project Override");
        assert_eq!(resolved.owner_scope, "project");
    }

    #[tokio::test]
    async fn test_soft_delete_preset() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let preset = mgr
            .create_preset("user", "u1", "my-preset", "Test", "", None, &[])
            .await
            .unwrap();
        mgr.delete_preset(&preset.id).await.unwrap();
        let list = mgr.list_presets(Some("user"), Some("u1")).await.unwrap();
        assert!(list.is_empty());
    }

    // -------------------------------------------------------------------
    // Agent tests
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn test_seed_agents_idempotent() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let seed = vec![SeedAgent {
            slug: "pm".into(),
            display_name: "Athena".into(),
            title: "Product Strategist".into(),
            emoji: "🎯".into(),
            scalar_fields: vec![("theme".into(), "strategic".into())],
            list_fields: vec![(
                "responsibilities".into(),
                vec!["specs".into(), "stories".into()],
            )],
            fragments: vec![("IDENTITY.md".into(), "# PM Identity".into(), 1)],
        }];
        mgr.seed_agents(&seed).await.unwrap();
        mgr.seed_agents(&seed).await.unwrap(); // idempotent

        let list = mgr
            .list_agents(Some("product"), Some("default"))
            .await
            .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].slug, "pm");
        assert!(list[0].is_builtin);

        let fields = mgr.get_agent_profile_fields(&list[0].id).await.unwrap();
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].field, "theme");

        let fragments = mgr.get_agent_fragments(&list[0].id).await.unwrap();
        assert_eq!(fragments.len(), 1);
        assert_eq!(fragments[0].filename, "IDENTITY.md");
    }

    #[tokio::test]
    async fn test_create_custom_agent() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let agent = mgr
            .create_agent("user", "u1", "my-agent", "My Agent", "Custom Role", "🤖")
            .await
            .unwrap();
        assert_eq!(agent.slug, "my-agent");
        assert!(!agent.is_builtin);

        let count = mgr.count_custom_agents("user", "u1").await.unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn test_resolve_agent_precedence() {
        let mgr = SessionManager::in_memory().await.unwrap();
        mgr.seed_agents(&[SeedAgent {
            slug: "pm".into(),
            display_name: "PM Product".into(),
            title: "".into(),
            emoji: "".into(),
            scalar_fields: vec![],
            list_fields: vec![],
            fragments: vec![],
        }])
        .await
        .unwrap();

        mgr.create_agent("user", "u1", "pm", "PM User", "", "")
            .await
            .unwrap();

        let resolved = mgr
            .resolve_agent("pm", "", "u1", "")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(resolved.display_name, "PM User");
        assert_eq!(resolved.owner_scope, "user");
    }

    // -------------------------------------------------------------------
    // Memory tests
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn test_upsert_and_get_memory() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let mem = mgr
            .upsert_memory("global", None, None, "MEMORY.md", "Initial content")
            .await
            .unwrap();
        assert_eq!(mem.version, 1);
        assert_eq!(mem.content, "Initial content");

        // Update.
        let mem2 = mgr
            .upsert_memory("global", None, None, "MEMORY.md", "Updated content")
            .await
            .unwrap();
        assert_eq!(mem2.version, 2);

        let memories = mgr.get_memories("global", None, None).await.unwrap();
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0].content, "Updated content");
    }

    #[tokio::test]
    async fn test_project_scoped_memory() {
        let mgr = SessionManager::in_memory().await.unwrap();
        mgr.upsert_memory(
            "project",
            None,
            Some("/proj/a"),
            "MEMORY.md",
            "Project A memory",
        )
        .await
        .unwrap();
        mgr.upsert_memory(
            "project",
            None,
            Some("/proj/b"),
            "MEMORY.md",
            "Project B memory",
        )
        .await
        .unwrap();

        let a = mgr
            .get_memories("project", None, Some("/proj/a"))
            .await
            .unwrap();
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].content, "Project A memory");

        let b = mgr
            .get_memories("project", None, Some("/proj/b"))
            .await
            .unwrap();
        assert_eq!(b.len(), 1);
        assert_eq!(b[0].content, "Project B memory");
    }

    #[tokio::test]
    async fn test_soft_delete_memory() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let mem = mgr
            .upsert_memory("global", None, None, "test.md", "content")
            .await
            .unwrap();
        mgr.delete_memory(&mem.id).await.unwrap();
        let memories = mgr.get_memories("global", None, None).await.unwrap();
        assert!(memories.is_empty());
    }

    // -------------------------------------------------------------------
    // MCP server tests
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn test_upsert_mcp_server() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let srv = mgr
            .upsert_mcp_server(
                "github",
                "global",
                None,
                "sse",
                None,
                None,
                Some("https://github-mcp.ops.koklo.dev/sse"),
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(srv.name, "github");
        assert_eq!(srv.transport, "sse");

        // Update.
        let srv2 = mgr
            .upsert_mcp_server(
                "github",
                "global",
                None,
                "streamable-http",
                None,
                None,
                Some("https://github-mcp.v2.koklo.dev/"),
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(srv2.transport, "streamable-http");
        assert_eq!(srv2.id, srv.id);
    }

    #[tokio::test]
    async fn test_resolve_mcp_servers_project_overrides_global() {
        let mgr = SessionManager::in_memory().await.unwrap();
        mgr.upsert_mcp_server(
            "fs",
            "global",
            None,
            "stdio",
            Some("fs-server"),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
        mgr.upsert_mcp_server(
            "fs",
            "project",
            Some("/proj"),
            "stdio",
            Some("custom-fs"),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();

        let resolved = mgr.resolve_mcp_servers(Some("/proj")).await.unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].command.as_deref(), Some("custom-fs"));
    }

    // -------------------------------------------------------------------
    // Import tests
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn test_import_markdown_memories() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();

        // Create global memory files.
        std::fs::write(home.join("MEMORY.md"), "global memory content").unwrap();
        std::fs::create_dir_all(home.join("memories")).unwrap();
        std::fs::write(home.join("memories").join("2026-04-01.md"), "daily log").unwrap();

        // Create project memory files.
        let project_ctx = dir.path().join("project_koklo");
        std::fs::create_dir_all(project_ctx.join("memories")).unwrap();
        std::fs::write(project_ctx.join("MEMORY.md"), "project memory").unwrap();

        let count = mgr
            .import_markdown_memories(home, Some("/proj/test"), Some(&project_ctx))
            .await
            .unwrap();
        assert_eq!(count, 3);

        let global = mgr.get_memories("global", None, None).await.unwrap();
        assert_eq!(global.len(), 2);

        let project = mgr
            .get_memories("project", None, Some("/proj/test"))
            .await
            .unwrap();
        assert_eq!(project.len(), 1);
        assert_eq!(project[0].content, "project memory");
    }

    #[tokio::test]
    async fn test_import_mcp_json() {
        let mgr = SessionManager::in_memory().await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let mcp_path = dir.path().join(".mcp.json");
        std::fs::write(
            &mcp_path,
            r#"{
                "mcpServers": {
                    "github": {
                        "type": "sse",
                        "url": "https://github-mcp.ops.koklo.dev/sse",
                        "env": {"GITHUB_TOKEN": "ghp_test"}
                    },
                    "filesystem": {
                        "command": "fs-server",
                        "args": ["--root", "/tmp"]
                    }
                }
            }"#,
        )
        .unwrap();

        let count = mgr
            .import_mcp_json(&mcp_path, "global", None)
            .await
            .unwrap();
        assert_eq!(count, 2);

        let servers = mgr.resolve_mcp_servers(None).await.unwrap();
        assert_eq!(servers.len(), 2);

        let github = servers.iter().find(|s| s.name == "github").unwrap();
        assert_eq!(github.transport, "sse");
        assert_eq!(
            github.url.as_deref(),
            Some("https://github-mcp.ops.koklo.dev/sse")
        );
    }
}
