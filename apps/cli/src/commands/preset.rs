use anyhow::Result;

use crate::open_storage;

pub(crate) async fn cmd_preset_list() -> Result<()> {
    let storage = open_storage().await?;
    let presets = storage.list_presets(None, None).await?;

    println!(
        "{:<15} {:<30} {:<10} {:<8} SCOPE",
        "SLUG", "NAME", "BUILT-IN", "PHASES"
    );
    println!("{}", "-".repeat(80));
    for preset in &presets {
        let phases = storage.get_preset_phases(&preset.id).await?;
        let builtin = if preset.is_builtin { "yes" } else { "no" };
        println!(
            "{:<15} {:<30} {:<10} {:<8} {}",
            preset.slug,
            preset.display_name,
            builtin,
            phases.len(),
            preset.owner_scope
        );
    }
    Ok(())
}

pub(crate) async fn cmd_preset_show(slug: &str) -> Result<()> {
    let storage = open_storage().await?;
    // Use resolve with empty IDs — will match product scope.
    let preset = storage
        .resolve_preset(slug, "", "default", "")
        .await?
        .ok_or_else(|| anyhow::anyhow!("Preset '{}' not found. Run `koklo preset list`.", slug))?;

    println!("{} — {}", preset.display_name, preset.description);
    println!("Scope: {} ({})", preset.owner_scope, preset.owner_id);
    if preset.is_builtin {
        println!("Built-in: yes");
    }
    println!();

    let phases = storage.get_preset_phases(&preset.id).await?;
    let phase_strs: Vec<String> = phases
        .iter()
        .map(|p| format!("{} ({})", p.phase, p.agent_slug))
        .collect();
    println!("{}", phase_strs.join(" → "));
    Ok(())
}

pub(crate) async fn cmd_preset_create(
    slug: &str,
    name: Option<String>,
    description: Option<String>,
    phases_str: &str,
) -> Result<()> {
    let display_name = name.unwrap_or_else(|| slug.to_string());
    let desc = description.unwrap_or_default();

    let phases: Vec<(String, String)> = phases_str
        .split(',')
        .map(|pair| {
            let parts: Vec<&str> = pair.trim().splitn(2, ':').collect();
            if parts.len() != 2 {
                Err(anyhow::anyhow!(
                    "Invalid phase format '{}'. Expected 'phase:agent' (e.g. spec:pm).",
                    pair
                ))
            } else {
                Ok((parts[0].to_string(), parts[1].to_string()))
            }
        })
        .collect::<Result<Vec<_>>>()?;

    if phases.is_empty() {
        anyhow::bail!("At least one phase is required.");
    }

    let storage = open_storage().await?;
    let preset = storage
        .create_preset("user", "default", slug, &display_name, &desc, None, &phases)
        .await?;

    println!(
        "Created preset '{}' with {} phases.",
        preset.slug,
        phases.len()
    );
    let phase_strs: Vec<String> = phases
        .iter()
        .map(|(p, a)| format!("{} ({})", p, a))
        .collect();
    println!("{}", phase_strs.join(" → "));
    Ok(())
}

pub(crate) async fn cmd_preset_delete(slug: &str) -> Result<()> {
    let storage = open_storage().await?;
    let preset = storage
        .resolve_preset(slug, "", "default", "")
        .await?
        .ok_or_else(|| anyhow::anyhow!("Preset '{}' not found.", slug))?;

    if preset.is_builtin {
        anyhow::bail!("Cannot delete built-in preset '{}'.", slug);
    }

    storage.delete_preset(&preset.id).await?;
    println!("Deleted preset '{}'.", slug);
    Ok(())
}
