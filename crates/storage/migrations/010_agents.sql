-- Migration 010: Agent definitions persistence.

CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    emoji         TEXT NOT NULL DEFAULT '',
    owner_scope   TEXT NOT NULL CHECK(owner_scope IN ('product','org','user','project')),
    owner_id      TEXT NOT NULL,
    is_builtin    INTEGER NOT NULL DEFAULT 0,
    version       INTEGER NOT NULL DEFAULT 1,
    sync_id       TEXT,
    last_synced_at TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT,
    UNIQUE(slug, owner_scope, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_scope ON agents(owner_scope);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_scope, owner_id);

-- Scalar profile fields (theme, vibe, mission, role_in_system).
CREATE TABLE IF NOT EXISTS agent_profile_fields (
    id       TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    field    TEXT NOT NULL,
    value    TEXT NOT NULL,
    UNIQUE(agent_id, field)
);

-- List profile fields (responsibilities, personality, guardrails, etc.).
CREATE TABLE IF NOT EXISTS agent_profile_list_items (
    id       TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    field    TEXT NOT NULL,
    seq      INTEGER NOT NULL,
    value    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_list_items
    ON agent_profile_list_items(agent_id, field, seq);

-- Markdown fragments (IDENTITY.md, SOUL.md, AGENTS.md, GUARDRAILS.md, custom).
CREATE TABLE IF NOT EXISTS agent_fragments (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    content    TEXT NOT NULL,
    sort_rank  INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(agent_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_agent_fragments_agent
    ON agent_fragments(agent_id, sort_rank);
