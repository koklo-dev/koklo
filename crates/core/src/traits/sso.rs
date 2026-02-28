//! SSO provider extension point.

use async_trait::async_trait;

#[async_trait]
pub trait SsoProvider: Send + Sync {
    async fn login_url(&self) -> anyhow::Result<String>;
}

pub struct NoopSsoProvider;

#[async_trait]
impl SsoProvider for NoopSsoProvider {
    async fn login_url(&self) -> anyhow::Result<String> {
        Ok(String::new())
    }
}
