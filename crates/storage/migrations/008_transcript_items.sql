CREATE TABLE IF NOT EXISTS transcript_items (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    phase        TEXT,
    agent_name   TEXT,
    source       TEXT NOT NULL,
    kind         TEXT NOT NULL,
    status       TEXT NOT NULL,
    item_key     TEXT,
    summary      TEXT NOT NULL,
    payload_json TEXT,
    seq          INTEGER NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcript_items_session
    ON transcript_items(session_id, seq);
