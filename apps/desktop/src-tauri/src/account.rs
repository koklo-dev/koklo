//! Desktop IPC adapter for the local account (`account.get` / `account.save`).
//!
//! Koklo requires a local account before the Shell is usable; the desktop
//! onboarding screen (`UserSetupScreen`) reads and writes it through these
//! procedures. Logic lives in `koklo_core::account` — this layer is a pure
//! **Interface adapter** mapping the domain type onto the wire DTO, exactly like
//! [`crate::ipc`]. The same `~/.koklo/account.toml` is shared with the CLI.

use anyhow::Result;
use koklo_core::account::{self, LocalAccount};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A local account as the frontend consumes it (Sidebar identity, onboarding).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDto {
    pub name: String,
    pub email: String,
    pub role: Option<String>,
    pub created_at: u64,
}

impl From<LocalAccount> for AccountDto {
    fn from(a: LocalAccount) -> Self {
        Self {
            name: a.name,
            email: a.email,
            role: a.role,
            created_at: a.created_at,
        }
    }
}

/// What `UserSetupScreen` submits. Avatar is captured in-UI only (not persisted
/// in v1), so it is intentionally absent here.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub name: String,
    pub email: String,
    #[serde(default)]
    pub role: Option<String>,
}

/// `account.get` — the saved account, or `None` when onboarding is still pending.
pub fn account_get(home: &Path) -> Result<Option<AccountDto>> {
    Ok(account::load(home)?.map(AccountDto::from))
}

/// `account.save` — validate and persist the local identity, returning the DTO.
/// Validation (name/email) is identical to the CLI and the Storybook screen.
pub fn account_save(home: &Path, input: AccountInput) -> Result<AccountDto> {
    let account = LocalAccount::new(input.name, input.email, input.role)?;
    account::save(home, &account)?;
    Ok(AccountDto::from(account))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_returns_none_then_some_after_save() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        assert_eq!(account_get(home).unwrap(), None);

        let saved = account_save(
            home,
            AccountInput {
                name: "Awa Yade".into(),
                email: "awa@studio.com".into(),
                role: Some("Designer".into()),
            },
        )
        .unwrap();
        assert_eq!(saved.name, "Awa Yade");

        let loaded = account_get(home).unwrap().unwrap();
        assert_eq!(loaded, saved);
    }

    #[test]
    fn save_rejects_invalid_email() {
        let dir = tempfile::tempdir().unwrap();
        let err = account_save(
            dir.path(),
            AccountInput {
                name: "Awa".into(),
                email: "nope".into(),
                role: None,
            },
        )
        .unwrap_err();
        assert!(err.to_string().contains("valid email"));
    }

    #[test]
    fn dto_serializes_camel_case() {
        let dto = AccountDto {
            name: "Awa".into(),
            email: "awa@studio.com".into(),
            role: None,
            created_at: 7,
        };
        let json = serde_json::to_value(&dto).unwrap();
        assert!(json.get("createdAt").is_some());
        assert!(json.get("created_at").is_none());
    }
}
