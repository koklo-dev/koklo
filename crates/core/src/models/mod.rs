//! Shared identifier models used across Koklo crates.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectId(pub Uuid);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionId(pub Uuid);
