ALTER TABLE sessions ADD COLUMN project_path TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
