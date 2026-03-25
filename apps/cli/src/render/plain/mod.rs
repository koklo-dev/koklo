use crate::render::model::{build_transcript_render_model, RenderBlock, RenderBlockBody};
use chrono::Utc;
use koklo_providers::ProviderEvent;
use koklo_storage::TranscriptItemRecord;

mod engine;
mod provider_adapter;
#[cfg(test)]
mod tests;

pub use self::engine::PlainRenderEngine;
pub use self::provider_adapter::provider_event_to_record;
