-- Migration 002: add preset column to sessions, size_bytes to artifacts,
--               and note column to gate_decisions.

ALTER TABLE sessions ADD COLUMN preset TEXT NOT NULL DEFAULT 'sdd';
CREATE INDEX IF NOT EXISTS idx_sessions_preset ON sessions(preset);

ALTER TABLE artifacts ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE gate_decisions ADD COLUMN note TEXT;
