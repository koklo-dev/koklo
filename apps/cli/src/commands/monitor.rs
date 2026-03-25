use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;

use crate::{find_project_root, monitor, open_storage};

pub(crate) async fn cmd_monitor(
    session: Option<String>,
    follow: Option<String>,
    project: Option<String>,
) -> Result<()> {
    let storage = Arc::new(open_storage().await?);
    let (session_filter, follow_mode) = if let Some(id) = follow {
        (Some(id), true)
    } else {
        (session, false)
    };

    let project_filter = resolve_project_filter(
        project.as_deref(),
        find_project_root().ok(),
        std::env::current_dir().ok(),
    );

    monitor::run_monitor(session_filter, follow_mode, project_filter, storage).await
}

fn resolve_project_filter(
    project: Option<&str>,
    project_root: Option<PathBuf>,
    current_dir: Option<PathBuf>,
) -> Option<String> {
    let project = project?;
    let resolved = if project == "." {
        project_root
            .or(current_dir)
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(project)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(project))
    };
    Some(resolved.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_project_filter_uses_project_root_for_dot() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        std::fs::create_dir_all(&root).unwrap();

        let resolved = resolve_project_filter(Some("."), Some(root.clone()), None);
        assert_eq!(resolved.as_deref(), Some(root.to_string_lossy().as_ref()));
    }

    #[test]
    fn resolve_project_filter_falls_back_to_current_dir_for_dot() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().join("cwd");
        std::fs::create_dir_all(&cwd).unwrap();

        let resolved = resolve_project_filter(Some("."), None, Some(cwd.clone()));
        assert_eq!(resolved.as_deref(), Some(cwd.to_string_lossy().as_ref()));
    }

    #[test]
    fn resolve_project_filter_canonicalizes_explicit_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        let nested = root.join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        let input = nested.join("..").join("nested");

        let resolved = resolve_project_filter(Some(input.to_string_lossy().as_ref()), None, None);
        assert_eq!(resolved.as_deref(), Some(nested.to_string_lossy().as_ref()));
    }
}
