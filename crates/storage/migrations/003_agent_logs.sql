CREATE TABLE IF NOT EXISTS agent_logs (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    phase       TEXT NOT NULL,
    agent_name  TEXT NOT NULL,
    message     TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_logs_session
    ON agent_logs(session_id, seq);
