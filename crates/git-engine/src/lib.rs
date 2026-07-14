//! Git operations engine for Koklo.
//!
//! Wraps `libgit2` (via the `git2` crate) to provide a minimal, high-level API
//! for the operations the workflow engine needs: branching, staging, committing,
//! and diffing.

use anyhow::{Context, Result};
use git2::{DiffOptions, Repository, StatusOptions};
use std::fs;
use std::path::Path;

/// Status of a single file in the working tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileStatus {
    pub path: String,
    pub status: FileState,
}

/// Simplified file state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileState {
    New,
    Modified,
    Deleted,
    Renamed,
    Untracked,
}

/// High-level wrapper around a `git2::Repository`.
pub struct GitEngine {
    repo: Repository,
}

impl GitEngine {
    /// Open an existing repository at `path` (searches parent dirs).
    pub fn open(path: &Path) -> Result<Self> {
        let repo = Repository::discover(path)
            .with_context(|| format!("no git repository found at or above {}", path.display()))?;
        Ok(Self { repo })
    }

    /// Return the name of the current branch (e.g. `"main"`), or `"HEAD"` if detached.
    pub fn current_branch(&self) -> Result<String> {
        let head = self.repo.head().context("failed to read HEAD")?;
        Ok(head.shorthand().unwrap_or("HEAD").to_string())
    }

    /// List local branch names.
    pub fn list_branches(&self) -> Result<Vec<String>> {
        let branches = self
            .repo
            .branches(Some(git2::BranchType::Local))
            .context("failed to list branches")?;
        let mut names = Vec::new();
        for branch in branches {
            let (branch, _) = branch.context("failed to read branch")?;
            if let Some(name) = branch.name()? {
                names.push(name.to_string());
            }
        }
        Ok(names)
    }

    /// Create a new local branch from the current HEAD.
    pub fn create_branch(&self, name: &str) -> Result<()> {
        let head_commit = self
            .repo
            .head()
            .and_then(|h| h.peel_to_commit())
            .context("failed to resolve HEAD commit")?;
        self.repo
            .branch(name, &head_commit, false)
            .with_context(|| format!("failed to create branch '{name}'"))?;
        Ok(())
    }

    /// Switch the working tree to the given branch.
    pub fn switch_branch(&self, name: &str) -> Result<()> {
        let refname = format!("refs/heads/{name}");
        let obj = self
            .repo
            .revparse_single(&refname)
            .with_context(|| format!("branch '{name}' not found"))?;
        self.repo
            .checkout_tree(&obj, None)
            .with_context(|| format!("failed to checkout '{name}'"))?;
        self.repo
            .set_head(&refname)
            .with_context(|| format!("failed to set HEAD to '{name}'"))?;
        Ok(())
    }

    /// Return the status of all files in the working tree.
    pub fn status(&self) -> Result<Vec<FileStatus>> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true);
        let statuses = self
            .repo
            .statuses(Some(&mut opts))
            .context("failed to read status")?;
        let mut out = Vec::new();
        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("?").to_string();
            let st = entry.status();
            let state = if st.is_index_new() || st.is_wt_new() {
                if st.is_wt_new() && !st.is_index_new() {
                    FileState::Untracked
                } else {
                    FileState::New
                }
            } else if st.is_index_deleted() || st.is_wt_deleted() {
                FileState::Deleted
            } else if st.is_index_renamed() || st.is_wt_renamed() {
                FileState::Renamed
            } else {
                FileState::Modified
            };
            out.push(FileStatus {
                path,
                status: state,
            });
        }
        Ok(out)
    }

    /// Stage files by path (relative to repo root).
    pub fn stage(&self, paths: &[&Path]) -> Result<()> {
        let mut index = self.repo.index().context("failed to open index")?;
        for path in paths {
            index
                .add_path(path)
                .with_context(|| format!("failed to stage {}", path.display()))?;
        }
        index.write().context("failed to write index")?;
        Ok(())
    }

    /// Stage all modified and new files.
    pub fn stage_all(&self) -> Result<()> {
        let mut index = self.repo.index().context("failed to open index")?;
        index
            .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
            .context("failed to stage all")?;
        index.write().context("failed to write index")?;
        Ok(())
    }

    /// Create a commit on the current branch with the staged changes.
    /// Returns the new commit hash.
    pub fn commit(&self, message: &str) -> Result<String> {
        let mut index = self.repo.index().context("failed to open index")?;
        let tree_oid = index.write_tree().context("failed to write tree")?;
        let tree = self.repo.find_tree(tree_oid)?;
        let sig = self
            .repo
            .signature()
            .context("failed to create signature — set user.name and user.email in git config")?;
        let parent = self.repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        let oid = self
            .repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .context("failed to create commit")?;
        Ok(oid.to_string())
    }

    /// Return a unified diff of staged changes.
    pub fn diff_staged(&self) -> Result<String> {
        let head_tree = self.repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let index = self.repo.index().context("failed to open index")?;
        let diff = self
            .repo
            .diff_tree_to_index(
                head_tree.as_ref(),
                Some(&index),
                Some(&mut DiffOptions::new()),
            )
            .context("failed to compute staged diff")?;
        diff_to_string(&diff)
    }

    /// Return a unified diff of unstaged working-tree changes.
    pub fn diff_working(&self) -> Result<String> {
        let diff = self
            .repo
            .diff_index_to_workdir(None, Some(&mut DiffOptions::new()))
            .context("failed to compute working diff")?;
        diff_to_string(&diff)
    }
}

/// Remove a Koklo-managed worktree directory from disk.
///
/// Guardrail: only paths under a `.koklo/worktrees/` segment are accepted.
pub fn prune_worktree(path: &Path) -> Result<()> {
    let normalized = path
        .canonicalize()
        .or_else(|_| Ok::<_, std::io::Error>(path.to_path_buf()))
        .context("failed to resolve worktree path")?;
    let as_text = normalized.to_string_lossy();
    if !as_text.contains("/.koklo/worktrees/") && !as_text.contains("\\.koklo\\worktrees\\") {
        anyhow::bail!(
            "refusing to prune `{}` because it is not under .koklo/worktrees",
            normalized.display()
        );
    }
    if !normalized.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&normalized)
        .with_context(|| format!("failed to prune worktree `{}`", normalized.display()))?;
    Ok(())
}

fn diff_to_string(diff: &git2::Diff) -> Result<String> {
    let mut buf = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' {
            buf.push(origin as u8);
        }
        buf.extend_from_slice(line.content());
        true
    })
    .context("failed to format diff")?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn init_temp_repo() -> (tempfile::TempDir, GitEngine) {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();

        // Configure user identity so commits work in CI (no global git config)
        {
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "Test").unwrap();
            config.set_str("user.email", "test@test.com").unwrap();
        }

        // Create initial commit so HEAD exists
        {
            let sig = git2::Signature::now("Test", "test@test.com").unwrap();
            let mut index = repo.index().unwrap();
            let tree_oid = index.write_tree().unwrap();
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
                .unwrap();
        }

        let engine = GitEngine { repo };
        (dir, engine)
    }

    #[test]
    fn current_branch_returns_main_or_master() {
        let (_dir, engine) = init_temp_repo();
        let branch = engine.current_branch().unwrap();
        assert!(
            branch == "main" || branch == "master",
            "unexpected branch: {branch}"
        );
    }

    #[test]
    fn create_and_list_branch() {
        let (_dir, engine) = init_temp_repo();
        engine.create_branch("feature-test").unwrap();
        let branches = engine.list_branches().unwrap();
        assert!(branches.contains(&"feature-test".to_string()));
    }

    #[test]
    fn switch_branch() {
        let (_dir, engine) = init_temp_repo();
        engine.create_branch("dev").unwrap();
        engine.switch_branch("dev").unwrap();
        assert_eq!(engine.current_branch().unwrap(), "dev");
    }

    #[test]
    fn stage_and_commit() {
        let (dir, engine) = init_temp_repo();
        let file_path = dir.path().join("hello.txt");
        fs::write(&file_path, "hello world").unwrap();
        engine.stage(&[Path::new("hello.txt")]).unwrap();
        let hash = engine.commit("add hello").unwrap();
        assert_eq!(hash.len(), 40); // SHA-1 hex
    }

    #[test]
    fn status_shows_untracked() {
        let (dir, engine) = init_temp_repo();
        fs::write(dir.path().join("new.txt"), "new").unwrap();
        let st = engine.status().unwrap();
        assert!(st
            .iter()
            .any(|f| f.path == "new.txt" && f.status == FileState::Untracked));
    }

    #[test]
    fn diff_staged_shows_changes() {
        let (dir, engine) = init_temp_repo();
        let file_path = dir.path().join("diff.txt");
        fs::write(&file_path, "content").unwrap();
        engine.stage(&[Path::new("diff.txt")]).unwrap();
        let diff = engine.diff_staged().unwrap();
        assert!(diff.contains("content"));
    }

    #[test]
    fn diff_working_shows_changes() {
        let (dir, engine) = init_temp_repo();
        // Create and commit a file first
        let file_path = dir.path().join("work.txt");
        fs::write(&file_path, "original").unwrap();
        engine.stage(&[Path::new("work.txt")]).unwrap();
        engine.commit("add work").unwrap();
        // Modify it
        fs::write(&file_path, "modified").unwrap();
        let diff = engine.diff_working().unwrap();
        assert!(diff.contains("modified"));
    }

    #[test]
    fn stage_all_stages_everything() {
        let (dir, engine) = init_temp_repo();
        fs::write(dir.path().join("a.txt"), "a").unwrap();
        fs::write(dir.path().join("b.txt"), "b").unwrap();
        engine.stage_all().unwrap();
        let diff = engine.diff_staged().unwrap();
        assert!(diff.contains("a"));
        assert!(diff.contains("b"));
    }

    #[test]
    fn open_nonexistent_repo_fails() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("not-a-repo");
        fs::create_dir_all(&sub).unwrap();
        assert!(GitEngine::open(&sub).is_err());
    }

    #[test]
    fn prune_worktree_removes_koklo_worktree_dir() {
        let dir = tempfile::tempdir().unwrap();
        let worktree = dir.path().join(".koklo/worktrees/session-a");
        fs::create_dir_all(&worktree).unwrap();
        fs::write(worktree.join("file.txt"), "ok").unwrap();

        prune_worktree(&worktree).unwrap();

        assert!(!worktree.exists());
    }

    #[test]
    fn prune_worktree_rejects_non_koklo_paths() {
        let dir = tempfile::tempdir().unwrap();
        let unrelated = dir.path().join("other/session-a");
        fs::create_dir_all(&unrelated).unwrap();

        assert!(prune_worktree(&unrelated).is_err());
        assert!(unrelated.exists());
    }
}
