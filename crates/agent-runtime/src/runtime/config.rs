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
    /// Optional DB-sourced memory content injected into the system prompt.
    ///
    /// When set, these replace the file-based memory layers (4–7) in the
    /// prompt.  Each entry is `(label, content)`.  The caller is responsible
    /// for querying the database and populating this field.
    pub memory_overrides: Option<Vec<(String, String)>>,
}
