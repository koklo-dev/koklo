//! `koklo monitor` — live TUI dashboard for pipeline activity.
//!
//! Polls the SQLite database every 500 ms. Two display modes:
//! - Default: ratatui TUI with sessions + phases + log panels
//! - `--follow`: plain text stream (for CI / scripting)

use crate::render::model::{
    build_transcript_render_model, RenderBlock, RenderBlockBody, RenderBlockKind, RenderTone,
    TranscriptLiveModel, TranscriptRenderModel,
};
use crate::render::plain::PlainRenderEngine;
use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use koklo_events::{
    CostDisplay, GateChannel, GateDisplay, GateResponse, PipelineEvent, TranscriptItem,
    UserInputChannel, UserInputQuestion,
};
use koklo_storage::{
    PhaseRecord, Session, SessionManager, SessionUsageSummary, TranscriptItemRecord,
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Row, Table},
    Frame, Terminal,
};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, oneshot};

mod app;
mod commands;
mod events;
mod format;
mod layout;
mod render;
mod runtime;
mod terminal;
#[cfg(test)]
mod tests;
mod transcript;
mod types;

#[cfg(test)]
pub(crate) use self::commands::parse_command_action;
pub(crate) use self::events::*;
pub(crate) use self::format::*;
pub(crate) use self::layout::*;
pub(crate) use self::terminal::*;
pub(crate) use self::transcript::*;
pub(crate) use self::types::*;

/// Run `koklo monitor`. Dispatches to TUI or follow mode.
pub async fn run_monitor(
    session_filter: Option<String>,
    follow: bool,
    project_filter: Option<String>,
    storage: Arc<SessionManager>,
) -> Result<()> {
    if follow {
        run_follow_mode(session_filter, project_filter, storage).await
    } else {
        run_tui_mode(session_filter, project_filter, storage).await
    }
}
