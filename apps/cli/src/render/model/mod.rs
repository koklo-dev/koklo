//! Provider-agnostic transcript render model.
//!
//! This module converts persisted transcript items into a small display model
//! that does not depend on ratatui. The TUI and plain-text follow mode both
//! render from this same model.

use koklo_storage::TranscriptItemRecord;
use serde_json::Value;
use std::collections::HashSet;

mod accumulators;
mod builder;
mod file_changes;
mod live;
#[cfg(test)]
mod tests;
mod types;

pub use self::builder::build_transcript_render_model;
pub use self::live::TranscriptLiveModel;
pub use self::types::{
    RenderBlock, RenderBlockBody, RenderBlockKind, RenderTone, TranscriptRenderModel,
};

use self::builder::{choose_command_label, looks_like_placeholder_command, tone_for_kind};
use self::file_changes::{format_file_change, should_prefer_file_change_lines};
