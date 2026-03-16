ALTER TABLE sessions ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN workspace_branch TEXT NOT NULL DEFAULT '';
UPDATE sessions
SET workspace_path = project_path
WHERE workspace_path = '';
