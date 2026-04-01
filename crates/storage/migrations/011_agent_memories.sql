-- Migration 011: Agent memory persistence.

CREATE TABLE IF NOT EXISTS agent_memories (
    id            TEXT PRIMARY KEY,
    scope         TEXT NOT NULL CHECK(scope IN ('global','project','agent')),
    agent_slug    TEXT,
    project_path  TEXT,
    memory_key    TEXT NOT NULL,
    content       TEXT NOT NULL,
    version       INTEGER NOT NULL DEFAULT 1,
    sync_id       TEXT,
    last_synced_at TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_key
    ON agent_memories(scope, COALESCE(agent_slug, ''), COALESCE(project_path, ''), memory_key);

CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(scope);

CREATE INDEX IF NOT EXISTS idx_agent_memories_project ON agent_memories(project_path)
    WHERE project_path IS NOT NULL;
