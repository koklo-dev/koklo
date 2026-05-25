use crate::{builtin_agents::builtin_agent_prompt, AgentConfig};
use anyhow::Result;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

static SYSTEM_PROMPT_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone)]
pub struct SystemPromptBuild {
    pub prompt: String,
    pub cache_hit: bool,
    #[allow(dead_code)]
    pub cache_key: String,
}

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
/// Missing files are silently skipped. Layers joined with compact blank lines.
pub fn build_system_prompt(config: &AgentConfig) -> Result<String> {
    Ok(build_system_prompt_with_metrics(config)?.prompt)
}

pub(crate) fn build_system_prompt_with_metrics(config: &AgentConfig) -> Result<SystemPromptBuild> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let cache_key = build_cache_key(config, &today)?;

    if let Some(prompt) = SYSTEM_PROMPT_CACHE.lock().unwrap().get(&cache_key).cloned() {
        return Ok(SystemPromptBuild {
            prompt,
            cache_hit: true,
            cache_key,
        });
    }

    let prompt = build_system_prompt_uncached(config, &today)?;
    SYSTEM_PROMPT_CACHE
        .lock()
        .unwrap()
        .insert(cache_key.clone(), prompt.clone());

    Ok(SystemPromptBuild {
        prompt,
        cache_hit: false,
        cache_key,
    })
}

fn build_system_prompt_uncached(config: &AgentConfig, today: &str) -> Result<String> {
    let mut parts: Vec<String> = Vec::new();
    let slug = &config.agent_slug;

    read_markdown_dir(config.global_home.join("agents").join("shared"), &mut parts)?;

    if let Some(ctx) = &config.project_context {
        maybe_read(ctx.join("PROJECT.md"), &mut parts);
    }

    maybe_read(config.global_home.join("USER.md"), &mut parts);

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
            config.global_home.join("memories").join(format!("{today}.md")),
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
        let role_prompt = resolve_role_prompt(config, slug)?;
        parts.push(role_prompt);
    }

    Ok(parts.join("\n\n"))
}

fn resolve_role_prompt(config: &AgentConfig, slug: &str) -> Result<String> {
    let project_role = config
        .project_context
        .as_ref()
        .map(|ctx| ctx.join("agents").join(format!("{slug}.md")));
    let global_role = config.global_home.join("agents").join(format!("{slug}.md"));

    if let Some(path) = project_role.filter(|p| p.exists()) {
        Ok(std::fs::read_to_string(path)?)
    } else if global_role.exists() {
        Ok(std::fs::read_to_string(global_role)?)
    } else if let Some(prompt) = builtin_agent_prompt(slug) {
        Ok(prompt)
    } else {
        tracing::warn!(
            "No role prompt found for agent '{}', using generic fallback",
            config.name
        );
        Ok(format!(
            "You are the {} agent for the koklo AI development pipeline.",
            config.name
        ))
    }
}

fn build_cache_key(config: &AgentConfig, today: &str) -> Result<String> {
    let snapshot = collect_source_snapshot(config, today)?;
    let mut key = String::new();
    key.push_str("system-prompt-v1|");
    key.push_str(&config.agent_slug);
    key.push('|');
    key.push_str(&config.global_home.to_string_lossy());
    key.push('|');
    key.push_str(
        &config
            .project_context
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
    );
    key.push('|');
    key.push_str(today);
    key.push('|');
    key.push_str(&memory_overrides_fingerprint(&config.memory_overrides));
    key.push('|');
    key.push_str(&hash_string(&snapshot.join("\n")));
    Ok(key)
}

fn collect_source_snapshot(config: &AgentConfig, today: &str) -> Result<Vec<String>> {
    let mut snapshot = Vec::new();
    let slug = &config.agent_slug;

    collect_dir_snapshot(config.global_home.join("agents").join("shared"), &mut snapshot)?;
    collect_file_snapshot(
        config.project_context.as_ref().map(|ctx| ctx.join("PROJECT.md")),
        &mut snapshot,
    )?;
    collect_file_snapshot(Some(config.global_home.join("USER.md")), &mut snapshot)?;

    if let Some(overrides) = &config.memory_overrides {
        snapshot.push(format!(
            "memory_overrides:{}",
            memory_overrides_fingerprint(&Some(overrides.clone()))
        ));
    } else {
        collect_file_snapshot(Some(config.global_home.join("MEMORY.md")), &mut snapshot)?;
        collect_file_snapshot(
            Some(config.global_home.join("memories").join(format!("{today}.md"))),
            &mut snapshot,
        )?;
        collect_file_snapshot(
            config.project_context.as_ref().map(|ctx| ctx.join("MEMORY.md")),
            &mut snapshot,
        )?;
        collect_file_snapshot(
            config
                .project_context
                .as_ref()
                .map(|ctx| ctx.join("memories").join(format!("{today}.md"))),
            &mut snapshot,
        )?;
    }

    collect_dir_snapshot(config.global_home.join("agents").join(slug), &mut snapshot)?;
    if let Some(ctx) = &config.project_context {
        collect_dir_snapshot(ctx.join("agents").join(slug), &mut snapshot)?;
        collect_file_snapshot(Some(ctx.join("agents").join(format!("{slug}.md"))), &mut snapshot)?;
    }
    collect_file_snapshot(
        Some(config.global_home.join("agents").join(format!("{slug}.md"))),
        &mut snapshot,
    )?;
    snapshot.push(format!(
        "builtin:{}:{}",
        slug,
        hash_string(&builtin_agent_prompt(slug).unwrap_or_default())
    ));

    Ok(snapshot)
}

fn collect_dir_snapshot(path: PathBuf, snapshot: &mut Vec<String>) -> Result<()> {
    if !path.exists() {
        snapshot.push(format!("dir:{}:missing", path.display()));
        return Ok(());
    }

    let entries = markdown_entries(&path)?;
    if entries.is_empty() {
        snapshot.push(format!("dir:{}:empty", path.display()));
        return Ok(());
    }

    for entry in entries {
        collect_file_snapshot(Some(entry.path()), snapshot)?;
    }

    Ok(())
}

fn collect_file_snapshot(path: Option<PathBuf>, snapshot: &mut Vec<String>) -> Result<()> {
    let Some(path) = path else {
        return Ok(());
    };
    if !path.exists() {
        snapshot.push(format!("file:{}:missing", path.display()));
        return Ok(());
    }

    let metadata = std::fs::metadata(&path)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    snapshot.push(format!(
        "file:{}:{}:{}",
        path.display(),
        metadata.len(),
        modified
    ));
    Ok(())
}

fn memory_overrides_fingerprint(overrides: &Option<Vec<(String, String)>>) -> String {
    let Some(overrides) = overrides else {
        return "none".to_string();
    };

    let joined = overrides
        .iter()
        .map(|(label, content)| format!("{label}:{}", hash_string(content)))
        .collect::<Vec<_>>()
        .join("|");
    hash_string(&joined)
}

fn hash_string(value: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn maybe_read(path: PathBuf, parts: &mut Vec<String>) {
    if let Ok(content) = std::fs::read_to_string(&path) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed.to_string());
        }
    }
}

fn markdown_entries(path: &Path) -> Result<Vec<std::fs::DirEntry>> {
    if !path.exists() {
        return Ok(Vec::new());
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
    Ok(entries)
}

fn read_markdown_dir(path: PathBuf, parts: &mut Vec<String>) -> Result<usize> {
    let entries = markdown_entries(&path)?;

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
        let identity_idx = prompt.find("global identity").unwrap();
        let task_idx = prompt.find("global task").unwrap();
        let output_idx = prompt.find("project output").unwrap();
        assert!(identity_idx < task_idx);
        assert!(task_idx < output_idx);
    }

    #[test]
    fn build_system_prompt_memory_overrides_replace_file_based_memories() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let project_ctx = tmp.path().join("project");

        std::fs::create_dir_all(global_home.join("agents")).unwrap();
        std::fs::create_dir_all(global_home.join("memories")).unwrap();
        std::fs::create_dir_all(&project_ctx).unwrap();
        std::fs::create_dir_all(project_ctx.join("memories")).unwrap();
        std::fs::write(global_home.join("MEMORY.md"), "global memory file").unwrap();
        std::fs::write(project_ctx.join("MEMORY.md"), "project memory file").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: Some(project_ctx),
            memory_overrides: Some(vec![
                ("global".to_string(), "override global memory".to_string()),
                ("project".to_string(), "override project memory".to_string()),
            ]),
        };

        let prompt = build_system_prompt(&config).unwrap();
        assert!(prompt.contains("override global memory"));
        assert!(prompt.contains("override project memory"));
        assert!(!prompt.contains("global memory file"));
        assert!(!prompt.contains("project memory file"));
    }

    #[test]
    fn build_system_prompt_cache_hits_on_stable_sources() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        std::fs::create_dir_all(global_home.join("agents").join("pm")).unwrap();
        std::fs::write(
            global_home.join("agents").join("pm").join("IDENTITY.md"),
            "cached prompt body",
        )
        .unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: None,
            memory_overrides: None,
        };

        let first = build_system_prompt_with_metrics(&config).unwrap();
        let second = build_system_prompt_with_metrics(&config).unwrap();
        assert!(!first.cache_hit);
        assert!(second.cache_hit);
        assert_eq!(first.prompt, second.prompt);
        assert_eq!(first.cache_key, second.cache_key);
    }

    #[test]
    fn build_system_prompt_cache_invalidates_when_source_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let global_home = tmp.path().join("global");
        let agent_dir = global_home.join("agents").join("pm");
        std::fs::create_dir_all(&agent_dir).unwrap();
        let identity = agent_dir.join("IDENTITY.md");
        std::fs::write(&identity, "version one").unwrap();

        let config = AgentConfig {
            name: "pm".to_string(),
            phase: Phase::Spec,
            agent_slug: "pm".to_string(),
            timeout_secs: 120,
            global_home,
            project_context: None,
            memory_overrides: None,
        };

        let first = build_system_prompt_with_metrics(&config).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        std::fs::write(&identity, "version two with a different length").unwrap();
        let second = build_system_prompt_with_metrics(&config).unwrap();

        assert!(!first.cache_hit);
        assert!(!second.cache_hit);
        assert_ne!(first.cache_key, second.cache_key);
        assert_ne!(first.prompt, second.prompt);
        assert!(second.prompt.contains("version two"));
    }
}
