use anyhow::Result;
use koklo_providers::{PipelineTomlConfig, ProviderRegistry, ProviderSessionEvent};
use koklo_workflow_engine::presets::{phases_for_preset, PresetKind};
use std::io::Write;
use std::sync::Arc;

use crate::{
    agents_dir, determine_default_provider, find_project_root, home_dirs,
    render::plain::{provider_event_to_record, PlainRenderEngine},
};

pub(crate) async fn cmd_agent_list() -> Result<()> {
    let mut seen = std::collections::BTreeSet::new();
    for &kind in PresetKind::all() {
        for (_, name) in phases_for_preset(kind) {
            seen.insert(name);
        }
    }
    let dir = agents_dir();
    println!("{:<22} PROMPT SOURCE", "AGENT");
    println!("{}", "-".repeat(60));
    for name in &seen {
        let prompt_dir = dir.join(name);
        let legacy_prompt = dir.join(format!("{}.md", name));
        let status = if prompt_dir.is_dir() {
            prompt_dir.to_string_lossy().into_owned()
        } else if legacy_prompt.exists() {
            format!("{} [legacy]", legacy_prompt.to_string_lossy())
        } else {
            "(prompt file not found)".to_string()
        };
        println!("{:<22} {}", name, status);
    }
    Ok(())
}

pub(crate) async fn cmd_agent_show(name: &str) -> Result<()> {
    use koklo_agent_runtime::{build_system_prompt, AgentConfig};
    use koklo_events::Phase;

    let global_home = home_dirs::koklo_home();
    let project_root = find_project_root()?;
    let project_context_dir = project_root.join(".koklo");
    let project_context = if project_context_dir.exists() {
        Some(project_context_dir)
    } else {
        None
    };

    let config = AgentConfig {
        name: name.to_string(),
        phase: Phase::Spec,
        agent_slug: name.to_string(),
        timeout_secs: 0,
        global_home,
        project_context,
    };

    let prompt = build_system_prompt(&config)?;
    println!("{}", prompt);
    Ok(())
}

pub(crate) async fn cmd_agent_run(name: &str, input: Option<String>) -> Result<()> {
    use koklo_agent_runtime::{build_system_prompt, AgentConfig};
    use koklo_events::Phase;

    let prompt = match input {
        Some(prompt) => prompt,
        None => {
            println!("Enter input (Ctrl+D to finish):");
            let mut buf = String::new();
            loop {
                let mut line = String::new();
                let n = std::io::stdin().read_line(&mut line)?;
                if n == 0 {
                    break;
                }
                buf.push_str(&line);
            }
            buf
        }
    };

    let project_root = find_project_root()?;
    let global = home_dirs::load_global_config();
    let project_config = PipelineTomlConfig::load_from_project_root(&project_root)?;
    let merged = global.merge(project_config);
    let registry = Arc::new(ProviderRegistry::build(&merged)?);
    let provider =
        determine_default_provider(&registry, merged.pipeline.default_provider.as_deref())?;

    let global_home = home_dirs::koklo_home();
    let project_context_dir = project_root.join(".koklo");
    let project_context = if project_context_dir.exists() {
        Some(project_context_dir)
    } else {
        None
    };
    let system_prompt = build_system_prompt(&AgentConfig {
        name: name.to_string(),
        phase: Phase::Spec,
        agent_slug: name.to_string(),
        timeout_secs: 0,
        global_home,
        project_context,
    })?;

    println!("Running agent '{}'...\n", name);
    use koklo_providers::Message;
    let messages = vec![Message::system(system_prompt), Message::user(prompt)];
    let mut session = Arc::clone(&provider).start_session(messages).await?;
    let mut render_engine = PlainRenderEngine::new(true);
    let mut seq = 0i64;

    while let ProviderSessionEvent::Event(event) = session.next_event().await? {
        seq += 1;
        let record = provider_event_to_record(event, seq, Some(name));
        let rendered = render_engine.push_record(record);
        if !rendered.is_empty() {
            print!("{rendered}");
            let _ = std::io::stdout().flush();
        }
    }
    println!();
    Ok(())
}

pub(crate) async fn cmd_agent_sync(force: bool) -> Result<()> {
    let summary = home_dirs::sync_builtin_agents(force)?;

    println!(
        "Agent profiles synced in {}/agents",
        home_dirs::koklo_home().display()
    );
    println!("  created: {}", summary.created);
    println!("  updated: {}", summary.updated);
    println!("  skipped: {}", summary.skipped);
    println!("  migrated legacy: {}", summary.migrated_legacy);
    if !force {
        println!("  mode: safe (existing files preserved, use --force to refresh built-ins)");
    } else {
        println!("  mode: force (built-in fragments refreshed when names match)");
    }

    Ok(())
}
