//! Agent execution runtime — loads system prompts and dispatches LLM calls.
use anyhow::Result;
use koklo_events::{EventBus, Phase, PipelineEvent};
use koklo_providers::{LlmProvider, Message};
use std::path::PathBuf;
use std::sync::Arc;

/// Configuration for a single agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub name: String,
    pub phase: Phase,
    pub system_prompt_file: PathBuf,
    pub timeout_secs: u64,
    /// Path to `agents/built-in/` directory (for per-agent identity files).
    pub agents_dir: Option<PathBuf>,
    /// Path to `.koklo/` directory (for project context files).
    pub context_dir: Option<PathBuf>,
}

/// Runs a single agent: loads prompt, calls LLM, streams events.
pub struct AgentRunner {
    config: AgentConfig,
    provider: Arc<dyn LlmProvider>,
    bus: EventBus,
}

impl AgentRunner {
    pub fn new(config: AgentConfig, provider: Arc<dyn LlmProvider>, bus: EventBus) -> Self {
        Self {
            config,
            provider,
            bus,
        }
    }

    /// Run the agent with the given user prompt. Returns the full LLM response.
    pub async fn run(&self, _session_id: &str, user_prompt: &str) -> Result<String> {
        let system_prompt = build_system_prompt(&self.config)?;

        let messages = vec![Message::system(system_prompt), Message::user(user_prompt)];

        let bus = self.bus.clone();
        let phase = self.config.phase;

        let mut result = String::new();
        self.provider
            .complete_stream(messages, &mut |chunk| {
                if !chunk.text.is_empty() {
                    bus.send(PipelineEvent::AgentLog {
                        phase,
                        message: chunk.text.clone(),
                    });
                    result.push_str(&chunk.text);
                    print!("{}", chunk.text);
                }
            })
            .await?;

        Ok(result)
    }
}

/// Build the layered system prompt for an agent.
///
/// Injection order:
/// 1. `agents/built-in/shared/PROJECT.md`  — project constitution
/// 2. `.koklo/USER.md`                     — who the user is
/// 3. `.koklo/MEMORY.md`                   — long-term memory
/// 4. `.koklo/memories/YYYY-MM-DD.md`      — today's session history
/// 5. `agents/built-in/<slug>/IDENTITY.md` — agent identity
/// 6. `agents/built-in/<slug>/SOUL.md`     — agent personality
/// 7. `agents/built-in/<slug>/AGENTS.md`   — agent operational rules
/// 8. `agents/built-in/<slug>.md`          — main role prompt (required)
///
/// All layers except the last are optional; missing files are silently skipped.
/// Layers are joined with `\n\n---\n\n`.
pub fn build_system_prompt(config: &AgentConfig) -> Result<String> {
    let mut parts: Vec<String> = Vec::new();

    // [1] shared/PROJECT.md
    if let Some(agents_dir) = &config.agents_dir {
        maybe_read(agents_dir.join("shared/PROJECT.md"), &mut parts);
    }

    // [2-4] project-level context from .koklo/
    if let Some(ctx_dir) = &config.context_dir {
        maybe_read(ctx_dir.join("USER.md"), &mut parts);
        maybe_read(ctx_dir.join("MEMORY.md"), &mut parts);
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        maybe_read(
            ctx_dir.join("memories").join(format!("{today}.md")),
            &mut parts,
        );
    }

    // [5-7] per-agent identity from agents/built-in/<slug>/
    if let Some(agents_dir) = &config.agents_dir {
        let slug = config
            .system_prompt_file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        for file in ["IDENTITY.md", "SOUL.md", "AGENTS.md"] {
            maybe_read(agents_dir.join(slug).join(file), &mut parts);
        }
    }

    // [8] main role prompt (required; falls back to default if file absent)
    let role = if config.system_prompt_file.exists() {
        std::fs::read_to_string(&config.system_prompt_file)?
    } else {
        tracing::warn!(
            "System prompt file not found: {:?}, using default",
            config.system_prompt_file
        );
        format!(
            "You are the {} agent for the koklo AI development pipeline.",
            config.name
        )
    };
    parts.push(role);

    Ok(parts.join("\n\n---\n\n"))
}

fn maybe_read(path: PathBuf, parts: &mut Vec<String>) {
    if let Ok(content) = std::fs::read_to_string(&path) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_config() {
        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            system_prompt_file: PathBuf::from("agents/built-in/pm.md"),
            timeout_secs: 120,
            agents_dir: None,
            context_dir: None,
        };
        assert_eq!(config.name, "pm");
        assert_eq!(config.phase, Phase::Spec);
    }

    #[test]
    fn test_build_system_prompt_fallback() {
        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            system_prompt_file: PathBuf::from("/nonexistent/pm.md"),
            timeout_secs: 120,
            agents_dir: None,
            context_dir: None,
        };
        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("pm agent"));
    }

    #[test]
    fn test_build_system_prompt_no_optional_dirs() {
        // With no agents_dir/context_dir, only the main role prompt is used.
        let config = AgentConfig {
            name: "architect".to_string(),
            phase: Phase::Plan,
            system_prompt_file: PathBuf::from("/nonexistent/architect.md"),
            timeout_secs: 120,
            agents_dir: None,
            context_dir: None,
        };
        let prompt = build_system_prompt(&config).unwrap();
        // Only the fallback message — no separator.
        assert!(!prompt.contains("---"));
        assert!(prompt.contains("architect agent"));
    }
}
