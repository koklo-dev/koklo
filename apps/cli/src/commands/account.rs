//! `koklo account` — manage the local account, and the gate that requires one
//! before primary commands (`start`, `run`) may proceed.
//!
//! Koklo cannot be used without a *local* account: a passwordless local identity
//! (name, email, optional role) stored once in `~/.koklo/account.toml` and shared
//! with the desktop app. This mirrors the desktop `UserSetupScreen` onboarding.

use anyhow::{bail, Result};
use koklo_core::account::{self, LocalAccount};
use std::io::{BufRead, IsTerminal, Write};
use std::path::PathBuf;

use crate::home_dirs;

/// How many times the interactive setup re-asks before giving up.
const MAX_ATTEMPTS: usize = 5;

/// The Koklo home directory the account lives in (honours `$KOKLO_HOME`).
fn account_home() -> PathBuf {
    home_dirs::koklo_home()
}

/// Guard for primary commands: ensure a local account exists, creating one
/// interactively when allowed. Returns an actionable error otherwise so the
/// command never silently runs account-less.
///
/// `prompt_allowed` should be `true` only on an interactive run (a TTY, and not
/// `--yes`), where asking for name/email is appropriate.
pub(crate) fn ensure_account(prompt_allowed: bool) -> Result<()> {
    let home = account_home();
    if account::exists(&home) {
        return Ok(());
    }
    if !prompt_allowed {
        bail!(no_account_message());
    }
    home_dirs::ensure_home()?;
    println!("Koklo needs a local account before you can continue.\n");
    let account = prompt_for_account(&mut std::io::stdin().lock(), &mut std::io::stdout())?;
    account::save(&home, &account)?;
    println!(
        "\n✓ Local account created for {} ({}).\n",
        account.name, account.email
    );
    Ok(())
}

/// `koklo account show` — print the current local account or guidance.
pub(crate) async fn cmd_account_show() -> Result<()> {
    match account::load(&account_home())? {
        Some(a) => {
            println!("Local account");
            println!("  Name   {}", a.name);
            println!("  Email  {}", a.email);
            if let Some(role) = &a.role {
                println!("  Role   {role}");
            }
        }
        None => println!("No local account yet. Run `koklo account setup` to create one."),
    }
    Ok(())
}

/// `koklo account setup` — create or replace the local account interactively.
pub(crate) async fn cmd_account_setup() -> Result<()> {
    let home = account_home();
    if !std::io::stdin().is_terminal() {
        bail!("`koklo account setup` needs an interactive terminal.");
    }
    home_dirs::ensure_home()?;
    if account::exists(&home) {
        println!("Replacing your existing local account.\n");
    }
    let account = prompt_for_account(&mut std::io::stdin().lock(), &mut std::io::stdout())?;
    account::save(&home, &account)?;
    println!(
        "\n✓ Local account saved for {} ({}).",
        account.name, account.email
    );
    Ok(())
}

/// The actionable error shown when no account exists and we cannot prompt.
fn no_account_message() -> String {
    "No Koklo account found. Koklo requires a local account before first use.\n\
     Run `koklo account setup` in an interactive terminal to create your local profile."
        .to_string()
}

/// Read name/email/role from `reader`, re-prompting on validation failure. Pure
/// over the I/O handles so it is unit-testable without a real terminal.
fn prompt_for_account<R: BufRead, W: Write>(
    reader: &mut R,
    writer: &mut W,
) -> Result<LocalAccount> {
    for _ in 0..MAX_ATTEMPTS {
        let name = prompt_line(reader, writer, "Full name: ")?;
        let email = prompt_line(reader, writer, "Email address: ")?;
        let role = prompt_line(reader, writer, "Role (optional, Enter to skip): ")?;
        let role = (!role.is_empty()).then_some(role);

        match LocalAccount::new(name, email, role) {
            Ok(account) => return Ok(account),
            Err(error) => writeln!(writer, "  ✗ {error}. Please try again.\n")?,
        }
    }
    bail!("could not create an account after {MAX_ATTEMPTS} attempts");
}

/// Print `label`, read one line, and return it trimmed. Errors if input closes.
fn prompt_line<R: BufRead, W: Write>(
    reader: &mut R,
    writer: &mut W,
    label: &str,
) -> Result<String> {
    write!(writer, "{label}")?;
    writer.flush()?;
    let mut buf = String::new();
    if reader.read_line(&mut buf)? == 0 {
        bail!("input closed before account setup completed");
    }
    Ok(buf.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn run_prompt(input: &str) -> Result<LocalAccount> {
        let mut reader = Cursor::new(input.to_string().into_bytes());
        let mut writer = Vec::new();
        prompt_for_account(&mut reader, &mut writer)
    }

    #[test]
    fn prompt_collects_name_email_and_role() {
        let account = run_prompt("Awa Yade\nawa@studio.com\nDesigner\n").unwrap();
        assert_eq!(account.name, "Awa Yade");
        assert_eq!(account.email, "awa@studio.com");
        assert_eq!(account.role.as_deref(), Some("Designer"));
    }

    #[test]
    fn prompt_treats_blank_role_as_none() {
        let account = run_prompt("Awa\nawa@studio.com\n\n").unwrap();
        assert_eq!(account.role, None);
    }

    #[test]
    fn prompt_reprompts_on_invalid_email_then_succeeds() {
        // First email is invalid; the second is accepted.
        let account = run_prompt("Awa\nnope\nx\nAwa\nawa@studio.com\n\n").unwrap();
        assert_eq!(account.email, "awa@studio.com");
    }

    #[test]
    fn prompt_fails_when_input_closes_early() {
        assert!(run_prompt("Awa\n").is_err());
    }

    #[test]
    fn no_account_message_is_actionable() {
        let msg = no_account_message();
        assert!(msg.contains("koklo account setup"));
    }
}
