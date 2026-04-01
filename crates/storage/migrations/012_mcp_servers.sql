-- Migration 012: MCP server and skill persistence.

CREATE TABLE IF NOT EXISTS mcp_servers (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    scope        TEXT NOT NULL CHECK(scope IN ('global','project')),
    project_path TEXT,
    transport    TEXT NOT NULL DEFAULT 'stdio',
    command      TEXT,
    args_json    TEXT,
    url          TEXT,
    env_json     TEXT,
    headers_json TEXT,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_name_scope
    ON mcp_servers(name, scope, COALESCE(project_path, ''));

CREATE INDEX IF NOT EXISTS idx_mcp_servers_scope ON mcp_servers(scope);

CREATE TABLE IF NOT EXISTS mcp_skills (
    id           TEXT PRIMARY KEY,
    server_id    TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tool_name    TEXT NOT NULL,
    description  TEXT,
    enabled      INTEGER NOT NULL DEFAULT 1,
    config_json  TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE(server_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_skills_server ON mcp_skills(server_id);
