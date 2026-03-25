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
    println!("{:<22} SYSTEM PROMPT", "AGENT");
    println!("{}", "-".repeat(60));
    for name in &seen {
        let prompt_path = dir.join(format!("{}.md", name));
        let status = if prompt_path.exists() {
            prompt_path.to_string_lossy().into_owned()
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

    let dir = agents_dir();
    let system_prompt_file = dir.join(format!("{}.md", name));
    let system_prompt = if system_prompt_file.exists() {
        std::fs::read_to_string(&system_prompt_file)?
    } else {
        format!(
            "You are the {} agent for the koklo AI development pipeline.",
            name
        )
    };

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
