use koklo_events::Phase;
use std::path::PathBuf;

/// Configuration for a single agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub name: String,
    pub phase: Phase,
    /// Agent slug used for file lookups (e.g. `"pm"`, `"architect"`).
    pub agent_slug: String,
    pub timeout_secs: u64,
    /// Global koklo home directory (`~/.koklo/`).
    pub global_home: PathBuf,
    /// Project-level `.koklo/` directory. `None` when outside any project.
    pub project_context: Option<PathBuf>,
}
