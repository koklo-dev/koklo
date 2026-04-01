-- Migration 009: Custom presets persistence.

CREATE TABLE IF NOT EXISTS presets (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    reference_url TEXT,
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

CREATE INDEX IF NOT EXISTS idx_presets_scope ON presets(owner_scope);
CREATE INDEX IF NOT EXISTS idx_presets_owner ON presets(owner_scope, owner_id);

CREATE TABLE IF NOT EXISTS preset_phases (
    id         TEXT PRIMARY KEY,
    preset_id  TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    phase      TEXT NOT NULL,
    agent_slug TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_preset_phases_preset ON preset_phases(preset_id, seq);
