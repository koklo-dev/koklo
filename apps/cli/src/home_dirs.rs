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
/// Creates template files (`USER.md`, `config.toml`) on first run.
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
# model = "anthropic/claude-opus-4-6"

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
