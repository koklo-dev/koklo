use super::*;

pub(crate) fn parse_command_action(input: &str) -> Result<Option<CommandAction>> {
    let trimmed = input.trim();
    if !trimmed.starts_with('/') {
        return Ok(None);
    }

    let command = trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let rest = trimmed[command.len()..].trim();

    let action = match command.as_str() {
        "/help" | "/?" | "/commands" => CommandAction::Help,
        "/approve" | "/yes" => CommandAction::Approve,
        "/reject" | "/no" => CommandAction::Reject,
        "/dashboard" | "/home" => CommandAction::Dashboard,
        "/workspace" | "/ws" => CommandAction::Workspace,
        "/edit" => {
            if rest.is_empty() {
                anyhow::bail!("Usage: /edit <path>");
            }
            CommandAction::Edit(PathBuf::from(rest))
        }
        "/reply" => {
            if rest.is_empty() {
                anyhow::bail!("Usage: /reply <text>");
            }
            CommandAction::Reply(rest.to_string())
        }
        "/focus" => match rest.to_ascii_lowercase().as_str() {
            "sessions" => CommandAction::Focus(Panel::Sessions),
            "phases" => CommandAction::Focus(Panel::Phases),
            "log" | "logs" => CommandAction::Focus(Panel::Log),
            _ => anyhow::bail!("Usage: /focus <sessions|phases|log>"),
        },
        "/live" => CommandAction::Live,
        "/refresh" | "/reload" => CommandAction::Refresh,
        "/summary" => CommandAction::Summary,
        "/quit" | "/exit" => CommandAction::Quit,
        other => anyhow::bail!("Unknown command: {}", other),
    };

    Ok(Some(action))
}
