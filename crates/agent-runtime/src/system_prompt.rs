use crate::{builtin_agents::builtin_agent_prompt, AgentConfig};
use anyhow::Result;
use std::path::PathBuf;

/// Build the layered system prompt for an agent.
///
/// Injection order (all layers optional except [10]):
///
///  [1]  `~/.koklo/agents/shared/*.md`           global shared fragments
///  [2]  `.koklo/PROJECT.md`                     project constitution
///  [3]  `~/.koklo/USER.md`                      who the user is (global)
///  [4]  `~/.koklo/MEMORY.md`                    global long-term memory
///  [5]  `~/.koklo/memories/YYYY-MM-DD.md`       global daily log
///  [6]  `.koklo/MEMORY.md`                      project memory
///  [7]  `.koklo/memories/YYYY-MM-DD.md`         project daily log
///  [8]  `~/.koklo/agents/<slug>/*.md`           global agent fragments
///  [9]  `.koklo/agents/<slug>/*.md`             project agent fragments
/// [10]  legacy fallback: `.koklo/agents/<slug>.md` → `~/.koklo/agents/<slug>.md` → built-in fallback
///
/// Missing files are silently skipped. Layers joined with `\n\n---\n\n`.
pub fn build_system_prompt(config: &AgentConfig) -> Result<String> {
    let mut parts: Vec<String> = Vec::new();
    let slug = &config.agent_slug;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    read_markdown_dir(config.global_home.join("agents").join("shared"), &mut parts)?;

    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("PROJECT.md"), &mut parts);
    }

    maybe_read(config.global_home.join("USER.md"), &mut parts);

    // Memory layers: prefer DB-sourced overrides when available,
    // falling back to file-based memories.
    if let Some(overrides) = &config.memory_overrides {
        for (_label, content) in overrides {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
        }
    } else {
        maybe_read(config.global_home.join("MEMORY.md"), &mut parts);
        maybe_read(
            config
                .global_home
                .join("memories")
                .join(format!("{today}.md")),
            &mut parts,
        );

        if let Some(ctx) = &config.project_context {
            maybe_read(ctx.join("MEMORY.md"), &mut parts);
            maybe_read(ctx.join("memories").join(format!("{today}.md")), &mut parts);
        }
    }

    let mut agent_fragment_count =
        read_markdown_dir(config.global_home.join("agents").join(slug), &mut parts)?;

    if let Some(ctx) = &config.project_context {
        agent_fragment_count += read_markdown_dir(ctx.join("agents").join(slug), &mut parts)?;
    }

    if agent_fragment_count == 0 {
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
            } else if let Some(prompt) = builtin_agent_prompt(slug) {
                prompt
            } else {
                tracing::warn!(
                    "No role prompt found for agent '{}', using generic fallback",
                    config.name
                );
                format!(
                    "You are the {} agent for the koklo AI development pipeline.",
                    config.name
                )
            }
        };
        parts.push(role_prompt);
    }

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

fn read_markdown_dir(path: PathBuf, parts: &mut Vec<String>) -> Result<usize> {
    if !path.exists() {
        return Ok(0);
    }

    let mut entries = std::fs::read_dir(path)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    entries.sort_by_key(|entry| markdown_sort_key(&entry.file_name().to_string_lossy()));

    let mut loaded = 0usize;
    for entry in entries {
        let before = parts.len();
        maybe_read(entry.path(), parts);
        if parts.len() > before {
            loaded += 1;
        }
    }

    Ok(loaded)
}

fn markdown_sort_key(name: &str) -> (usize, String) {
    let rank = match name.to_ascii_uppercase().as_str() {
        "IDENTITY.MD" => 0,
        "PERSONALITY.MD" | "SOUL.MD" => 1,
        "TASK.MD" | "ROLE.MD" => 2,
        "GUARDRAILS.MD" | "AGENTS.MD" => 3,
        "OUTPUT.MD" => 4,
        _ => 10,
    };
    (rank, name.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use koklo_events::Phase;

    fn test_config(slug: &str) -> AgentConfig {
        AgentConfig {
            name: slug.to_string(),
            phase: Phase::Spec,
            agent_slug: slug.to_string(),
            timeout_secs: 120,
            global_home: PathBuf::from("/nonexistent/koklo_home"),
            project_context: None,
            memory_overrides: None,
        }
    }

    #[test]
    fn build_system_prompt_fallback_uses_builtin_profile() {
        let config = test_config("pm");
        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("Athena"));
        assert!(prompt.contains("Product Strategist"));
        assert!(prompt.contains("Do not implement code"));
    }

    #[test]
    fn build_system_prompt_no_optional_dirs() {
        let config = test_config("developer");
        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("Hephaestus"));
    }

    #[test]
    fn build_system_prompt_prefers_project_flat_role_prompt() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        std::fs::create_dir_all(global_home.join("agents")).unwrap();
        std::fs::create_dir_all(&project_ctx).unwrap();
        std::fs::create_dir_all(project_ctx.join("agents")).unwrap();
        std::fs::write(project_ctx.join("agents").join("pm.md"), "project pm role").unwrap();
        std::fs::write(global_home.join("agents").join("pm.md"), "global pm role").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
            memory_overrides: None,
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("project pm role"));
        assert!(!prompt.contains("global pm role"));
    }

    #[test]
    fn build_system_prompt_uses_global_flat_role_prompt() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        let agents_dir = global_home.join("agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        std::fs::write(agents_dir.join("pm.md"), "global pm role").unwrap();
        std::fs::create_dir_all(&project_ctx).unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
            memory_overrides: None,
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("global pm role"));
    }

    #[test]
    fn build_system_prompt_uses_agent_directory_fragments_in_order() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        let global_agent_dir = global_home.join("agents").join("pm");
        std::fs::create_dir_all(&global_agent_dir).unwrap();
        std::fs::write(global_agent_dir.join("TASK.md"), "global task").unwrap();
        std::fs::write(global_agent_dir.join("IDENTITY.md"), "global identity").unwrap();

        let project_agent_dir = project_ctx.join("agents").join("pm");
        std::fs::create_dir_all(&project_agent_dir).unwrap();
        std::fs::write(project_agent_dir.join("OUTPUT.md"), "project output").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
            memory_overrides: None,
        };

        let prompt = build_system_prompt(&config).unwrap();
        let identity_pos = prompt.find("global identity").unwrap();
        let task_pos = prompt.find("global task").unwrap();
        let output_pos = prompt.find("project output").unwrap();

        assert!(identity_pos < task_pos);
        assert!(task_pos < output_pos);
        assert!(!prompt.contains("PM Agent"));
    }

    #[test]
    fn build_system_prompt_memory_overrides_replace_file_based_memories() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");

        // Create a file-based MEMORY.md that should NOT appear when overrides are set.
        std::fs::create_dir_all(&global_home).unwrap();
        std::fs::write(global_home.join("MEMORY.md"), "file-based memory").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: None,
            memory_overrides: Some(vec![
                ("global".to_string(), "DB global memory".to_string()),
                ("project".to_string(), "DB project memory".to_string()),
            ]),
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("DB global memory"));
        assert!(prompt.contains("DB project memory"));
        assert!(!prompt.contains("file-based memory"));
    }
}
