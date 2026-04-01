//! Tier enforcement extension point.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Koklo product tier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Community,
    Pro,
    Team,
    Enterprise,
}

/// Feature limits for a given tier.
#[derive(Debug, Clone)]
pub struct TierLimits {
    /// Max custom agents (Community: 3, Pro+: None = unlimited).
    pub max_custom_agents: Option<u32>,
    /// Max custom presets (Community: 3, Pro+: None = unlimited).
    pub max_custom_presets: Option<u32>,
    /// Cloud sync enabled.
    pub cloud_sync: bool,
    /// CRDT collaborative editing.
    pub crdt_collab: bool,
    /// Role-based access control.
    pub rbac: bool,
    /// Single sign-on.
    pub sso: bool,
    /// Enterprise audit log.
    pub audit_log: bool,
    /// Organisation-level policies.
    pub org_policies: bool,
}

impl Tier {
    pub fn limits(self) -> TierLimits {
        match self {
            Tier::Community => TierLimits {
                max_custom_agents: Some(3),
                max_custom_presets: Some(3),
                cloud_sync: false,
                crdt_collab: false,
                rbac: false,
                sso: false,
                audit_log: false,
                org_policies: false,
            },
            Tier::Pro => TierLimits {
                max_custom_agents: None,
                max_custom_presets: None,
                cloud_sync: true,
                crdt_collab: false,
                rbac: false,
                sso: false,
                audit_log: false,
                org_policies: false,
            },
            Tier::Team => TierLimits {
                max_custom_agents: None,
                max_custom_presets: None,
                cloud_sync: true,
                crdt_collab: true,
                rbac: true,
                sso: false,
                audit_log: false,
                org_policies: false,
            },
            Tier::Enterprise => TierLimits {
                max_custom_agents: None,
                max_custom_presets: None,
                cloud_sync: true,
                crdt_collab: true,
                rbac: true,
                sso: true,
                audit_log: true,
                org_policies: true,
            },
        }
    }
}

/// Resolves the current tier.  Community edition returns `Tier::Community`.
/// EE checks the license cache or cloud API.
#[async_trait]
pub trait TierResolver: Send + Sync {
    async fn current_tier(&self) -> anyhow::Result<Tier>;
}

/// Default resolver for Community edition.
pub struct CommunityTierResolver;

#[async_trait]
impl TierResolver for CommunityTierResolver {
    async fn current_tier(&self) -> anyhow::Result<Tier> {
        Ok(Tier::Community)
    }
}
