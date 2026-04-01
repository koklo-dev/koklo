//! Koklo CLI — autonomous AI development pipeline.
//!
//! # Usage
//! ```text
//! koklo [OPTIONS] <COMMAND>
//!
//! Core:
//!   init          Initialize Koklo in the current project
//!   run           Run a workflow pipeline
//!   session       Manage pipeline sessions
//!   agent         Manage and run built-in agents
//!   workflow      List and inspect workflow presets
//!   config        View project configuration
//!   artifacts     Browse pipeline artifacts
//!   provider      Manage LLM providers
//!   monitor       Live TUI dashboard
//!   context       Manage context files
//!
//! Aliases (backward-compat):
//!   status        → session list / session show <id>
//!   resume        → session resume <id>
//! ```

mod bridge;
mod cli;
mod commands;
mod monitor;
mod render;
mod support;

use anyhow::Result;
use koklo_providers::load_secrets_into_env;
use tracing_subscriber::EnvFilter;

pub(crate) use support::app::{
    agents_dir, build_orchestrator, build_orchestrator_with_gate, canonical_provider_name,
    determine_default_provider, find_project_root, load_writable_config, normalize_pipeline_config,
    open_storage, provider_name_candidates, write_config,
};
pub(crate) use support::home as home_dirs;

pub async fn run() -> Result<()> {
    initialize_runtime();
    // Seed built-in presets and agents into the DB (idempotent).
    if let Ok(storage) = open_storage().await {
        if let Err(e) = home_dirs::seed_database(&storage).await {
            tracing::warn!("DB seeding failed (non-fatal): {}", e);
        }
    }
    cli::run().await
}

fn initialize_runtime() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .try_init();
    let _ = home_dirs::ensure_home();
    load_secrets_into_env();
}
