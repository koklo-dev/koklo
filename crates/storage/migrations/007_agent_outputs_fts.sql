CREATE TABLE IF NOT EXISTS agent_outputs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    phase TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_session ON agent_outputs(session_id);

CREATE VIRTUAL TABLE IF NOT EXISTS agent_outputs_fts
    USING fts5(content, content='agent_outputs', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS agent_outputs_fts_insert
AFTER INSERT ON agent_outputs BEGIN
    INSERT INTO agent_outputs_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS agent_outputs_fts_delete
AFTER DELETE ON agent_outputs BEGIN
    INSERT INTO agent_outputs_fts(agent_outputs_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS agent_outputs_fts_update
AFTER UPDATE ON agent_outputs BEGIN
    INSERT INTO agent_outputs_fts(agent_outputs_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO agent_outputs_fts(rowid, content) VALUES (new.rowid, new.content);
END;
