use crate::ipc::WorktreeDto;
use anyhow::{anyhow, Result};
use koklo_git_engine::prune_worktree;
use koklo_storage::{Session, SessionManager};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ActiveWorktreeSelection {
    path: Option<String>,
}

fn selection_file(koklo_home: &Path) -> PathBuf {
    koklo_home.join("desktop-active-worktree.json")
}

fn read_selection(koklo_home: &Path) -> Option<String> {
    let path = selection_file(koklo_home);
    let raw = fs::read_to_string(path).ok()?;
    let data: ActiveWorktreeSelection = serde_json::from_str(&raw).ok()?;
    data.path
}

fn write_selection(koklo_home: &Path, path: Option<&str>) -> Result<()> {
    fs::create_dir_all(koklo_home)?;
    let payload = serde_json::to_string_pretty(&ActiveWorktreeSelection {
        path: path.map(ToOwned::to_owned),
    })?;
    fs::write(selection_file(koklo_home), payload)?;
    Ok(())
}

fn is_dedicated_worktree(session: &Session) -> bool {
    !session.workspace_branch.is_empty() && session.workspace_path != session.project_path
}

fn worktree_exists(session: &Session) -> bool {
    Path::new(&session.workspace_path).exists()
}

fn listable_sessions(rows: Vec<Session>) -> Vec<Session> {
    rows.into_iter()
        .filter(|session| is_dedicated_worktree(session) && worktree_exists(session))
        .collect()
}

pub async fn list(storage: &SessionManager, koklo_home: &Path) -> Result<Vec<WorktreeDto>> {
    let rows = listable_sessions(storage.list_sessions().await?);
    let selected = read_selection(koklo_home);
    let fallback_active = rows.first().map(|row| row.workspace_path.clone());

    Ok(rows
        .into_iter()
        .map(|row| WorktreeDto {
            session_id: row.id,
            path: row.workspace_path.clone(),
            branch: row.workspace_branch.clone(),
            is_active: selected
                .as_deref()
                .or(fallback_active.as_deref())
                .map(|path| path == row.workspace_path)
                .unwrap_or(false),
            status: row.status,
        })
        .collect())
}

pub async fn create(
    storage: &SessionManager,
    session_id: &str,
    koklo_home: &Path,
) -> Result<WorktreeDto> {
    let session = storage
        .get_session(session_id)
        .await?
        .ok_or_else(|| anyhow!("unknown session `{session_id}`"))?;
    if !is_dedicated_worktree(&session) {
        return Err(anyhow!(
            "session `{session_id}` has no dedicated worktree to surface"
        ));
    }
    let selected = read_selection(koklo_home);
    Ok(WorktreeDto {
        session_id: session.id,
        path: session.workspace_path.clone(),
        branch: session.workspace_branch.clone(),
        is_active: selected
            .as_deref()
            .map(|path| path == session.workspace_path)
            .unwrap_or(false),
        status: session.status,
    })
}

pub async fn switch(storage: &SessionManager, koklo_home: &Path, path: &str) -> Result<()> {
    let known = list(storage, koklo_home).await?;
    if !known.iter().any(|row| row.path == path) {
        return Err(anyhow!("unknown worktree `{path}`"));
    }
    write_selection(koklo_home, Some(path))
}

pub async fn prune(storage: &SessionManager, koklo_home: &Path, path: &str) -> Result<()> {
    let known = list(storage, koklo_home).await?;
    let target = known
        .iter()
        .find(|row| row.path == path)
        .ok_or_else(|| anyhow!("unknown worktree `{path}`"))?;
    if matches!(
        target.status.as_str(),
        "running" | "queued" | "pending" | "in_progress"
    ) {
        return Err(anyhow!("cannot prune an active worktree"));
    }
    prune_worktree(Path::new(path))?;
    if let Some(session) = storage.get_session(&target.session_id).await? {
        storage
            .update_session_workspace(&session.id, &session.project_path, "")
            .await?;
    }
    if read_selection(koklo_home).as_deref() == Some(path) {
        write_selection(koklo_home, None)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn seeded_storage() -> SessionManager {
        SessionManager::in_memory().await.unwrap()
    }

    #[tokio::test]
    async fn list_marks_selected_worktree_active() {
        let storage = seeded_storage().await;
        let home = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        let worktree = project.path().join(".koklo/worktrees/s1");
        std::fs::create_dir_all(&worktree).unwrap();
        let session = storage
            .create_session("Feature", "light", &project.path().to_string_lossy())
            .await
            .unwrap();
        storage
            .update_session_workspace(&session.id, &worktree.to_string_lossy(), "koklo/session/s1")
            .await
            .unwrap();
        write_selection(home.path(), Some(&worktree.to_string_lossy())).unwrap();

        let rows = list(&storage, home.path()).await.unwrap();

        assert_eq!(rows.len(), 1);
        assert!(rows[0].is_active);
    }

    #[tokio::test]
    async fn switch_rejects_unknown_path() {
        let storage = seeded_storage().await;
        let home = tempfile::tempdir().unwrap();

        let err = switch(&storage, home.path(), "/repo/.koklo/worktrees/missing")
            .await
            .unwrap_err();

        assert!(err.to_string().contains("unknown worktree"));
    }

    #[tokio::test]
    async fn pruned_worktree_disappears_from_list() {
        let storage = seeded_storage().await;
        let home = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        let worktree = project.path().join(".koklo/worktrees/s1");
        std::fs::create_dir_all(&worktree).unwrap();

        let session = storage
            .create_session("Feature", "light", &project.path().to_string_lossy())
            .await
            .unwrap();
        storage
            .update_session_workspace(&session.id, &worktree.to_string_lossy(), "koklo/session/s1")
            .await
            .unwrap();
        storage
            .update_session_status(&session.id, "completed")
            .await
            .unwrap();

        prune(&storage, home.path(), &worktree.to_string_lossy())
            .await
            .unwrap();

        let rows = list(&storage, home.path()).await.unwrap();
        assert!(rows.is_empty());
    }
}
