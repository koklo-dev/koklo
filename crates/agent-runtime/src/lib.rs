//! Agent execution runtime — loads system prompts and dispatches LLM calls.
use anyhow::Result;
use koklo_events::{CompletionUsage, EventBus, Phase, PipelineEvent};
use koklo_providers::{LlmProvider, Message, ToolEvent};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

static STREAM_STDOUT: AtomicBool = AtomicBool::new(true);

pub fn set_stdout_streaming_enabled(enabled: bool) {
    STREAM_STDOUT.store(enabled, Ordering::Relaxed);
}

/// Configuration for a single agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub name: String,
    pub phase: Phase,
    /// Agent slug used for file lookups (e.g. `"pm"`, `"architect"`).
    pub agent_slug: String,
    pub timeout_secs: u64,
    /// Global koklo home directory (`~/.koklo/`).
    pub global_home: PathBuf,
    /// Project-level `.koklo/` directory. `None` when outside any project.
    pub project_context: Option<PathBuf>,
}

/// Runs a single agent: loads prompt, calls LLM, streams events.
pub struct AgentRunner {
    config: AgentConfig,
    provider: Arc<dyn LlmProvider>,
    bus: EventBus,
}

pub struct AgentRunResult {
    pub output: String,
    pub usage: CompletionUsage,
}

impl AgentRunner {
    pub fn new(config: AgentConfig, provider: Arc<dyn LlmProvider>, bus: EventBus) -> Self {
        Self {
            config,
            provider,
            bus,
        }
    }

    /// Run the agent with the given user prompt. Returns the full LLM response and token usage.
    pub async fn run(&self, session_id: &str, user_prompt: &str) -> Result<AgentRunResult> {
        let system_prompt = build_system_prompt(&self.config)?;

        let messages = vec![Message::system(system_prompt), Message::user(user_prompt)];

        let bus = self.bus.clone();
        let phase = self.config.phase;
        let session_id_str = session_id.to_string();

        let mut result = String::new();
        let (_, usage) = self
            .provider
            .complete_stream(messages, &mut |chunk| {
                if !chunk.text.is_empty() {
                    bus.send(PipelineEvent::AgentLog {
                        phase,
                        session_id: session_id_str.clone(),
                        message: chunk.text.clone(),
                    });
                    result.push_str(&chunk.text);
                    if STREAM_STDOUT.load(Ordering::Relaxed) {
                        print!("{}", chunk.text);
                    }
                }
                match chunk.tool_event {
                    Some(ToolEvent::Call {
                        tool_name,
                        input_summary,
                    }) => {
                        bus.send(PipelineEvent::ToolCall {
                            phase,
                            session_id: session_id_str.clone(),
                            tool_name,
                            input_summary,
                        });
                    }
                    Some(ToolEvent::Result {
                        tool_name,
                        output_summary,
                    }) => {
                        bus.send(PipelineEvent::ToolResult {
                            phase,
                            session_id: session_id_str.clone(),
                            tool_name,
                            output_summary,
                        });
                    }
                    None => {}
                }
            })
            .await?;

        Ok(AgentRunResult {
            output: result,
            usage,
        })
    }
}

/// Build the layered system prompt for an agent.
///
/// Injection order (all layers optional except [14]):
///
///  [1]  `~/.koklo/agents/shared/PROJECT.md`     global fallback constitution
///  [2]  `.koklo/PROJECT.md`                     project constitution
///  [3]  `~/.koklo/USER.md`                      who the user is (global)
///  [4]  `~/.koklo/MEMORY.md`                    global long-term memory
///  [5]  `~/.koklo/memories/YYYY-MM-DD.md`       global daily log
///  [6]  `.koklo/MEMORY.md`                      project memory
///  [7]  `.koklo/memories/YYYY-MM-DD.md`         project daily log
///  [8]  `~/.koklo/agents/<slug>/IDENTITY.md`    agent identity (global)
///  [9]  `~/.koklo/agents/<slug>/SOUL.md`        agent personality (global)
/// [10]  `~/.koklo/agents/<slug>/AGENTS.md`      agent rules (global)
/// [11]  `.koklo/agents/<slug>/IDENTITY.md`      project identity override
/// [12]  `.koklo/agents/<slug>/SOUL.md`          project soul override
/// [13]  `.koklo/agents/<slug>/AGENTS.md`        project agents override
/// [14]  role prompt: `.koklo/agents/<slug>.md` → `~/.koklo/agents/<slug>.md` → embedded fallback
///
/// Missing files are silently skipped. Layers joined with `\n\n---\n\n`.
pub fn build_system_prompt(config: &AgentConfig) -> Result<String> {
    let mut parts: Vec<String> = Vec::new();
    let slug = &config.agent_slug;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // [1] global fallback constitution
    maybe_read(
        config
            .global_home
            .join("agents")
            .join("shared")
            .join("PROJECT.md"),
        &mut parts,
    );

    // [2] project constitution
    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("PROJECT.md"), &mut parts);
    }

    // [3] global USER.md
    maybe_read(config.global_home.join("USER.md"), &mut parts);

    // [4] global MEMORY.md
    maybe_read(config.global_home.join("MEMORY.md"), &mut parts);

    // [5] global daily log
    maybe_read(
        config
            .global_home
            .join("memories")
            .join(format!("{today}.md")),
        &mut parts,
    );

    // [6] project MEMORY.md
    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("MEMORY.md"), &mut parts);
    }

    // [7] project daily log
    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("memories").join(format!("{today}.md")), &mut parts);
    }

    // [8-10] global per-agent identity files
    for file in ["IDENTITY.md", "SOUL.md", "AGENTS.md"] {
        maybe_read(
            config.global_home.join("agents").join(slug).join(file),
            &mut parts,
        );
    }

    // [11-13] project per-agent identity overrides
    if let Some(ctx) = &config.project_context {
        for file in ["IDENTITY.md", "SOUL.md", "AGENTS.md"] {
            maybe_read(ctx.join("agents").join(slug).join(file), &mut parts);
        }
    }

    // [14] role prompt: project override → global → embedded fallback
    let role_prompt = {
        let project_role = config
            .project_context
            .as_ref()
            .map(|ctx| ctx.join("agents").join(format!("{slug}.md")));
        let global_role = config.global_home.join("agents").join(format!("{slug}.md"));

        if let Some(path) = project_role.filter(|p| p.exists()) {
            std::fs::read_to_string(path)?
        } else if global_role.exists() {
            std::fs::read_to_string(global_role)?
        } else {
            tracing::warn!(
                "No role prompt found for agent '{}', using embedded fallback",
                config.name
            );
            format!(
                "You are the {} agent for the koklo AI development pipeline.",
                config.name
            )
        }
    };
    parts.push(role_prompt);

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

    fn test_config(slug: &str) -> AgentConfig {
        AgentConfig {
            name: slug.to_string(),
            phase: Phase::Spec,
            agent_slug: slug.to_string(),
            timeout_secs: 120,
            global_home: PathBuf::from("/nonexistent/koklo_home"),
            project_context: None,
        }
    }

    #[test]
    fn test_agent_config() {
        let config = test_config("pm");
        assert_eq!(config.name, "pm");
        assert_eq!(config.phase, Phase::Spec);
        assert_eq!(config.agent_slug, "pm");
    }

    #[test]
    fn test_build_system_prompt_fallback() {
        let config = test_config("pm");
        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("pm agent"));
    }

    #[test]
    fn test_build_system_prompt_no_optional_dirs() {
        // With nonexistent global_home and no project_context, only the fallback.
        let config = test_config("architect");
        let prompt = build_system_prompt(&config).unwrap();
        // Only the fallback message — no separator.
        assert!(!prompt.contains("---"));
        assert!(prompt.contains("architect agent"));
    }

    #[test]
    fn test_build_system_prompt_project_role_override() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        // Create global role prompt
        let agents_dir = global_home.join("agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        let mut f = std::fs::File::create(agents_dir.join("pm.md")).unwrap();
        writeln!(f, "global pm role").unwrap();

        // Create project override
        let proj_agents = project_ctx.join("agents");
        std::fs::create_dir_all(&proj_agents).unwrap();
        let mut f = std::fs::File::create(proj_agents.join("pm.md")).unwrap();
        writeln!(f, "project pm override").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("project pm override"));
        assert!(!prompt.contains("global pm role"));
    }

    #[test]
    fn test_build_system_prompt_global_role_when_no_project_override() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        let agents_dir = global_home.join("agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        let mut f = std::fs::File::create(agents_dir.join("pm.md")).unwrap();
        writeln!(f, "global pm role").unwrap();

        // Project context exists but has no agents override
        std::fs::create_dir_all(&project_ctx).unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("global pm role"));
    }
}
