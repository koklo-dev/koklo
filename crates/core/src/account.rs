//! Local account — a passwordless local identity shared by the CLI and the
//! desktop app.
//!
//! Koklo requires an account before first use, but it is a *local identity*, not
//! authentication: no password, no remote. It records who authors proposals,
//! approvals, and conversations. Both surfaces read and write the **same**
//! `account.toml` under the Koklo home directory (`~/.koklo/`, honouring
//! `$KOKLO_HOME`), so a profile created in the CLI is seen by the desktop and
//! vice-versa.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// File name of the local-account store inside the Koklo home directory.
pub const ACCOUNT_FILE: &str = "account.toml";

/// A local Koklo identity. Persisted as `account.toml`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalAccount {
    /// Display name (required, non-empty).
    pub name: String,
    /// Email address (required, format-validated). Local-only; never sent anywhere.
    pub email: String,
    /// Optional role/title (e.g. "Product designer").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// Creation time, Unix epoch seconds.
    pub created_at: u64,
}

/// Why a candidate account was rejected. Validation mirrors the Storybook
/// `UserSetupScreen` so the CLI and desktop accept exactly the same input.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountError {
    /// Name was empty or whitespace-only.
    EmptyName,
    /// Email was empty or whitespace-only.
    EmptyEmail,
    /// Email did not match `<local>@<domain>.<tld>`.
    InvalidEmail,
}

impl std::fmt::Display for AccountError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self {
            AccountError::EmptyName => "enter your name to continue",
            AccountError::EmptyEmail => "enter your email address",
            AccountError::InvalidEmail => "enter a valid email address",
        };
        f.write_str(msg)
    }
}

impl std::error::Error for AccountError {}

impl LocalAccount {
    /// Build a validated account, trimming each field and stamping `created_at`
    /// with the current time. An empty optional role becomes `None`.
    pub fn new(
        name: impl Into<String>,
        email: impl Into<String>,
        role: Option<String>,
    ) -> Result<Self, AccountError> {
        Self::new_at(name, email, role, now_unix())
    }

    /// Like [`LocalAccount::new`] but with an explicit timestamp (deterministic
    /// for tests).
    pub fn new_at(
        name: impl Into<String>,
        email: impl Into<String>,
        role: Option<String>,
        created_at: u64,
    ) -> Result<Self, AccountError> {
        let name = name.into().trim().to_string();
        let email = email.into().trim().to_string();
        if name.is_empty() {
            return Err(AccountError::EmptyName);
        }
        if email.is_empty() {
            return Err(AccountError::EmptyEmail);
        }
        if !is_valid_email(&email) {
            return Err(AccountError::InvalidEmail);
        }
        let role = role.map(|r| r.trim().to_string()).filter(|r| !r.is_empty());
        Ok(Self {
            name,
            email,
            role,
            created_at,
        })
    }
}

/// Resolve the account file path inside a Koklo home directory.
pub fn account_path(home: &Path) -> PathBuf {
    home.join(ACCOUNT_FILE)
}

/// `true` when a local account already exists under `home`.
pub fn exists(home: &Path) -> bool {
    account_path(home).exists()
}

/// Load the account from `home`, or `None` when no account file exists.
pub fn load(home: &Path) -> anyhow::Result<Option<LocalAccount>> {
    let path = account_path(home);
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)?;
    let account = toml::from_str(&raw)?;
    Ok(Some(account))
}

/// Persist `account` under `home`, creating the directory if needed.
pub fn save(home: &Path, account: &LocalAccount) -> anyhow::Result<()> {
    std::fs::create_dir_all(home)?;
    let toml = toml::to_string_pretty(account)?;
    std::fs::write(account_path(home), toml)?;
    Ok(())
}

/// Minimal email format check matching the Storybook regex
/// `^[^\s@]+@[^\s@]+\.[^\s@]+$`: a non-empty local part, a single `@`, then a
/// domain containing a dot — both sides free of spaces and `@`.
fn is_valid_email(email: &str) -> bool {
    let mut parts = email.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let valid_segment = |s: &str| !s.is_empty() && !s.contains(char::is_whitespace);
    valid_segment(local)
        && valid_segment(domain)
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_trims_and_drops_blank_role() {
        let account =
            LocalAccount::new_at("  Awa Yade ", " awa@studio.com ", Some("  ".into()), 42).unwrap();
        assert_eq!(account.name, "Awa Yade");
        assert_eq!(account.email, "awa@studio.com");
        assert_eq!(account.role, None);
        assert_eq!(account.created_at, 42);
    }

    #[test]
    fn new_keeps_non_blank_role() {
        let account =
            LocalAccount::new_at("Awa", "awa@studio.com", Some(" Designer ".into()), 1).unwrap();
        assert_eq!(account.role.as_deref(), Some("Designer"));
    }

    #[test]
    fn new_rejects_empty_name_email_and_bad_email() {
        assert_eq!(
            LocalAccount::new_at("  ", "a@b.co", None, 0),
            Err(AccountError::EmptyName)
        );
        assert_eq!(
            LocalAccount::new_at("A", "   ", None, 0),
            Err(AccountError::EmptyEmail)
        );
        assert_eq!(
            LocalAccount::new_at("A", "not-an-email", None, 0),
            Err(AccountError::InvalidEmail)
        );
    }

    #[test]
    fn email_validation_matches_storybook_regex() {
        for good in ["a@b.co", "awa.y@studio.dev", "x+y@sub.example.com"] {
            assert!(is_valid_email(good), "{good} should be valid");
        }
        for bad in [
            "a@b", "@b.co", "a@.co", "a@b.", "a b@c.co", "a@@b.co", "a@b c.co", "plain",
        ] {
            assert!(!is_valid_email(bad), "{bad} should be invalid");
        }
    }

    #[test]
    fn error_messages_are_actionable() {
        assert_eq!(
            AccountError::EmptyName.to_string(),
            "enter your name to continue"
        );
        assert_eq!(
            AccountError::EmptyEmail.to_string(),
            "enter your email address"
        );
        assert_eq!(
            AccountError::InvalidEmail.to_string(),
            "enter a valid email address"
        );
    }

    #[test]
    fn save_load_exists_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join(".koklo");
        assert!(!exists(&home));
        assert_eq!(load(&home).unwrap(), None);

        let account = LocalAccount::new_at("Awa", "awa@studio.com", Some("Dev".into()), 7).unwrap();
        save(&home, &account).unwrap();

        assert!(exists(&home));
        assert_eq!(account_path(&home), home.join("account.toml"));
        assert_eq!(load(&home).unwrap(), Some(account));
    }

    #[test]
    fn now_unix_is_after_2020() {
        // 2020-01-01 in epoch seconds; guards against a broken clock helper.
        assert!(now_unix() > 1_577_836_800);
    }
}
