use anyhow::Result;
use koklo_workflow_engine::presets::{phases_for_preset, PresetKind};

pub(crate) fn cmd_workflow_list() {
    println!("{:<10} {:<30} {:<8} REFERENCE", "PRESET", "NAME", "PHASES");
    println!("{}", "-".repeat(75));
    for &kind in PresetKind::all() {
        let phases = phases_for_preset(kind);
        let url = kind.reference_url().unwrap_or("");
        println!(
            "{:<10} {:<30} {:<8} {}",
            kind.as_str(),
            kind.display_name(),
            phases.len(),
            url
        );
    }
}

pub(crate) fn cmd_workflow_show(preset_str: &str) -> Result<()> {
    let kind = PresetKind::parse(preset_str).ok_or_else(|| {
        anyhow::anyhow!(
            "Unknown preset '{}'. Run `koklo workflow list`.",
            preset_str
        )
    })?;
    let phases = phases_for_preset(kind);
    println!("{} — {}", kind.display_name(), kind.description());
    if let Some(url) = kind.reference_url() {
        println!("Reference: {}", url);
    }
    println!();
    let phase_names: Vec<String> = phases
        .iter()
        .map(|(phase, agent)| format!("{} ({})", phase, agent))
        .collect();
    println!("{}", phase_names.join(" → "));
    Ok(())
}
