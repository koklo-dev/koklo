//! Ownership scope resolution for multi-tenant storage.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Identifies who owns a resource.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OwnerRef {
    /// One of: `"product"`, `"user"`, `"project"`, or (EE-only) `"org"`.
    pub scope: String,
    /// Opaque identifier.  For `"product"` this is `"default"`.
    /// For `"user"` it is the local user ID.  For `"org"` it is the org UUID.
    /// For `"project"` it is the absolute project path.
    pub owner_id: String,
}

impl OwnerRef {
    pub fn product() -> Self {
        Self {
            scope: "product".into(),
            owner_id: "default".into(),
        }
    }

    pub fn user(user_id: impl Into<String>) -> Self {
        Self {
            scope: "user".into(),
            owner_id: user_id.into(),
        }
    }

    pub fn project(project_path: impl Into<String>) -> Self {
        Self {
            scope: "project".into(),
            owner_id: project_path.into(),
        }
    }

    pub fn org(org_id: impl Into<String>) -> Self {
        Self {
            scope: "org".into(),
            owner_id: org_id.into(),
        }
    }
}

/// Resolves the effective owner for a given operation.
///
/// Community edition returns `OwnerRef::user(...)`.
/// Enterprise edition may resolve to an org based on SSO token / config.
#[async_trait]
pub trait ScopeResolver: Send + Sync {
    /// Resolve the effective owner for the current context.
    async fn resolve(&self) -> anyhow::Result<OwnerRef>;

    /// List all scopes visible to the current user (for queries).
    /// Community: returns `[product, user]`.
    /// EE Team/Enterprise: returns `[product, user, org(s)]`.
    async fn visible_scopes(&self) -> anyhow::Result<Vec<OwnerRef>>;
}

/// Default local-only scope resolver for Community/Pro tiers.
pub struct LocalScopeResolver {
    pub user_id: String,
}

#[async_trait]
impl ScopeResolver for LocalScopeResolver {
    async fn resolve(&self) -> anyhow::Result<OwnerRef> {
        Ok(OwnerRef::user(&self.user_id))
    }

    async fn visible_scopes(&self) -> anyhow::Result<Vec<OwnerRef>> {
        Ok(vec![OwnerRef::product(), OwnerRef::user(&self.user_id)])
    }
}
