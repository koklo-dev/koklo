//! Koklo global home directory resolution.
//!
//! Resolves `~/.koklo/` (or `$KOKLO_HOME`) and provides helpers for
//! the DB path, agent directory, and first-run initialisation.

use anyhow::Result;
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

const DEFAULT_CONFIG_TOML: &str = r#"# koklo global configuration

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"
model = "claude-opus-4-6"

# [providers.ollama]
# base_url = "http://localhost:11434"
# model = "llama3.2"

# [providers.openrouter]
# api_key_env = "OPENROUTER_API_KEY"
# model = "anthropic/claude-opus-4-6"
# [providers.openrouter.routing]
# data_collection = "deny"
# allow_fallbacks = true
# sort = "price"
"#;
