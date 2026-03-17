CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    phase TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL,
    cost_kind TEXT NOT NULL DEFAULT 'usd',
    recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);
