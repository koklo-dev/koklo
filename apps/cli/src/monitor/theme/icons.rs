//! Unicode icons and spinner frames.

// ── Status icons ───────────────────────────────────────────────────

pub const ICON_RUNNING: &str = "●";
pub const ICON_COMPLETED: &str = "✓";
pub const ICON_FAILED: &str = "✗";
pub const ICON_PAUSED: &str = "⏸";
pub const ICON_PENDING: &str = "·";
pub const ICON_UNKNOWN: &str = "○";

pub fn status_icon(status: &str) -> &'static str {
    match status {
        "running" => ICON_RUNNING,
        "completed" => ICON_COMPLETED,
        "failed" => ICON_FAILED,
        "paused" => ICON_PAUSED,
        "pending" => ICON_PENDING,
        _ => ICON_UNKNOWN,
    }
}

// ── Navigation icons ───────────────────────────────────────────────

pub const ICON_HOME: &str = "⌂";
pub const ICON_CHAT: &str = "◆";
pub const ICON_HISTORY: &str = "☰";
pub const ICON_TICKETS: &str = "▣";
pub const ICON_GIT: &str = "⎇";
pub const ICON_WORKFLOW: &str = "◈";
pub const ICON_SETTINGS: &str = "⚙";
pub const ICON_AGENTS: &str = "◉";
pub const ICON_FILES: &str = "▤";
pub const ICON_BMAD: &str = "◆";
pub const ICON_RESULTS: &str = "▦";

// ── Misc ───────────────────────────────────────────────────────────

pub const ICON_EXPAND: &str = "▸";
pub const ICON_COLLAPSE: &str = "▾";
pub const ICON_BREADCRUMB_SEP: &str = " › ";
pub const ICON_DOT: &str = "●";
pub const ICON_ADD: &str = "+";
pub const ICON_REMOVE: &str = "−";

// ── Spinner (Braille animation) ────────────────────────────────────

pub const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

pub fn spinner_frame(tick: usize) -> &'static str {
    SPINNER[tick % SPINNER.len()]
}
