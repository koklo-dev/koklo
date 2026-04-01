-- Migration 013: Organization foundation tables.
-- These tables exist in the public schema but are only populated by EE crates.

CREATE TABLE IF NOT EXISTS organizations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    tier        TEXT NOT NULL DEFAULT 'community'
                CHECK(tier IN ('community','pro','team','enterprise')),
    settings_json TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_members (
    id       TEXT PRIMARY KEY,
    org_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL,
    role     TEXT NOT NULL DEFAULT 'member'
             CHECK(role IN ('owner','admin','member','viewer')),
    joined_at TEXT NOT NULL,
    UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

-- Cached license information.  Authoritative source is the cloud API.
CREATE TABLE IF NOT EXISTS license_info (
    id            TEXT PRIMARY KEY DEFAULT 'current',
    tier          TEXT NOT NULL DEFAULT 'community',
    user_id       TEXT,
    org_id        TEXT,
    valid_until   TEXT,
    features_json TEXT,
    checked_at    TEXT NOT NULL
);
