//! Koklo global home directory resolution.
//!
//! Resolves `~/.koklo/` (or `$KOKLO_HOME`) and provides helpers for
//! the DB path, agent directory, and first-run initialisation.

use anyhow::Result;
use koklo_providers::PipelineTomlConfig;
use std::path::PathBuf;

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

    Ok(home)
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
