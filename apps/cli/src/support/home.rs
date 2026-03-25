//! Koklo global home directory resolution.
//!
//! Resolves `~/.koklo/` (or `$KOKLO_HOME`) and provides helpers for
//! the DB path, agent directory, and first-run initialisation.

use anyhow::Result;
use koklo_agent_runtime::{
    builtin_agent_files, builtin_agent_slugs, builtin_shared_project_prompt,
};
use koklo_providers::PipelineTomlConfig;
use std::path::PathBuf;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct AgentSyncSummary {
    pub created: usize,
    pub updated: usize,
    pub skipped: usize,
    pub migrated_legacy: usize,
}

/// Returns `$KOKLO_HOME` if set, otherwise `~/.koklo/`.
pub fn koklo_home() -> PathBuf {
    std::env::var("KOKLO_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .expect("cannot determine home directory")
                .join(".koklo")
        })
}

/// Returns the path to the global SQLite database.
///
/// `$KOKLO_DB_PATH` overrides the default of `~/.koklo/koklo.db`.
pub fn koklo_db_path() -> String {
    std::env::var("KOKLO_DB_PATH")
        .unwrap_or_else(|_| koklo_home().join("koklo.db").to_string_lossy().into_owned())
}

/// Ensures `~/.koklo/` and its required subdirectories exist.
///
/// Creates template files (`USER.md`, `config.toml`, `secrets.toml`) on first run.
/// Returns the path to the global home directory.
pub fn ensure_home() -> Result<PathBuf> {
    let home = koklo_home();
    ensure_home_at(&home)?;
    Ok(home)
}

fn ensure_home_at(home: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(home.join("agents").join("shared"))?;
    std::fs::create_dir_all(home.join("memories"))?;

    let user_md = home.join("USER.md");
    if !user_md.exists() {
        std::fs::write(
            &user_md,
            "# User Profile\n\n<!-- Who are you? Your role, preferences, background. -->\n",
        )?;
    }

    let config = home.join("config.toml");
    if !config.exists() {
        std::fs::write(&config, DEFAULT_CONFIG_TOML)?;
    }

    let secrets = home.join("secrets.toml");
    if !secrets.exists() {
        std::fs::write(&secrets, DEFAULT_SECRETS_TOML)?;
        set_private_file_permissions(&secrets)?;
    }

    let shared_project = home.join("agents").join("shared").join("PROJECT.md");
    if !shared_project.exists() {
        std::fs::write(&shared_project, builtin_shared_project_prompt())?;
    }

    sync_builtin_agents_at(home, false)?;

    Ok(())
}

pub fn sync_builtin_agents(overwrite: bool) -> Result<AgentSyncSummary> {
    let home = koklo_home();
    std::fs::create_dir_all(home.join("agents").join("shared"))?;
    sync_builtin_agents_at(&home, overwrite)
}

fn sync_builtin_agents_at(home: &std::path::Path, overwrite: bool) -> Result<AgentSyncSummary> {
    let mut summary = AgentSyncSummary::default();

    for slug in builtin_agent_slugs() {
        let agent_dir = home.join("agents").join(slug);
        std::fs::create_dir_all(&agent_dir)?;
        let legacy_prompt = home.join("agents").join(format!("{slug}.md"));
        if !directory_has_markdown_files(&agent_dir)? && legacy_prompt.exists() {
            let role_path = agent_dir.join("ROLE.md");
            if !role_path.exists() {
                let legacy_content = std::fs::read_to_string(&legacy_prompt)?;
                if !legacy_content.trim().is_empty() {
                    std::fs::write(role_path, legacy_content)?;
                    summary.migrated_legacy += 1;
                }
            }
            continue;
        }

        if let Some(files) = builtin_agent_files(slug) {
            for (name, content) in files {
                let path = agent_dir.join(name);
                if !path.exists() {
                    std::fs::write(path, content)?;
                    summary.created += 1;
                } else if overwrite {
                    let existing = std::fs::read_to_string(&path).unwrap_or_default();
                    if existing != content {
                        std::fs::write(path, content)?;
                        summary.updated += 1;
                    } else {
                        summary.skipped += 1;
                    }
                } else {
                    summary.skipped += 1;
                }
            }
        }
    }

    Ok(summary)
}

fn directory_has_markdown_files(path: &std::path::Path) -> Result<bool> {
    if !path.exists() {
        return Ok(false);
    }

    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let is_markdown = entry
            .path()
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false);
        if is_markdown {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Load `~/.koklo/config.toml` as a `PipelineTomlConfig`.
/// Returns `Default` if the file is missing or cannot be parsed.
pub fn load_global_config() -> PipelineTomlConfig {
    let path = koklo_home().join("config.toml");
    PipelineTomlConfig::load_from_path(&path).unwrap_or_default()
}

const DEFAULT_CONFIG_TOML: &str = r#"# koklo global configuration

# ── Cloud ───────────────────────────────────────────────────────────────────
# OpenRouter: single API key, 300+ models. Set OPENROUTER_API_KEY to enable.
# [providers.openrouter]
# api_key_env = "OPENROUTER_API_KEY"
# model = "openai/gpt-4o"
# smoke_model = "google/gemma-3-4b-it:free"

# ── Local bridges ───────────────────────────────────────────────────────────
# Claude Code CLI bridge (no API key needed — uses local `claude` binary)
[providers.claude-code]

# Codex CLI bridge (no API key needed — uses local `codex` binary)
# [providers.codex]

# ── Local models ────────────────────────────────────────────────────────────
# [providers.ollama]
# base_url = "http://localhost:11434"
# model = "llama3.2"
"#;

const DEFAULT_SECRETS_TOML: &str = r#"# koklo secrets
#
# This file is loaded by the CLI for non-interactive runs.
# Keep permissions strict (0600 on Unix).
#
# [env]
# OPENROUTER_API_KEY = "sk-or-v1-..."
# ANTHROPIC_API_KEY = "sk-ant-..."
"#;

#[cfg(unix)]
fn set_private_file_permissions(path: &std::path::Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &std::path::Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_home_bootstraps_builtin_agent_files() {
        let dir = tempfile::tempdir().unwrap();
        ensure_home_at(dir.path()).unwrap();

        assert!(dir.path().join("USER.md").exists());
        assert!(dir.path().join("config.toml").exists());
        assert!(dir.path().join("secrets.toml").exists());
        assert!(dir
            .path()
            .join("agents")
            .join("shared")
            .join("PROJECT.md")
            .exists());
        assert!(dir
            .path()
            .join("agents")
            .join("pm")
            .join("IDENTITY.md")
            .exists());
        assert!(dir
            .path()
            .join("agents")
            .join("pm")
            .join("SOUL.md")
            .exists());
        assert!(dir
            .path()
            .join("agents")
            .join("developer")
            .join("AGENTS.md")
            .exists());
        assert!(dir
            .path()
            .join("agents")
            .join("developer")
            .join("GUARDRAILS.md")
            .exists());
        assert!(dir
            .path()
            .join("agents")
            .join("reviewer")
            .join("SOUL.md")
            .exists());
    }

    #[test]
    fn ensure_home_migrates_legacy_flat_prompt_to_agent_directory() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("agents")).unwrap();
        std::fs::write(dir.path().join("agents").join("pm.md"), "legacy pm prompt").unwrap();

        ensure_home_at(dir.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(dir.path().join("agents").join("pm").join("ROLE.md")).unwrap(),
            "legacy pm prompt"
        );
        assert!(!dir
            .path()
            .join("agents")
            .join("pm")
            .join("IDENTITY.md")
            .exists());
    }

    #[test]
    fn sync_builtin_agents_force_overwrites_builtin_files() {
        let dir = tempfile::tempdir().unwrap();
        ensure_home_at(dir.path()).unwrap();

        let guardrails = dir
            .path()
            .join("agents")
            .join("developer")
            .join("GUARDRAILS.md");
        std::fs::write(&guardrails, "custom guardrails").unwrap();

        let summary = sync_builtin_agents_at(dir.path(), true).unwrap();

        assert!(summary.updated >= 1);
        let content = std::fs::read_to_string(guardrails).unwrap();
        assert!(content.contains("Do not claim validation you did not run"));
    }
}
