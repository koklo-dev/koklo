use anyhow::Result;
use koklo_workflow_engine::presets::PresetKind;

use crate::{find_project_root, home_dirs};

use super::cmd_init;

pub(crate) async fn cmd_config_show() -> Result<()> {
    let global_path = home_dirs::koklo_home().join("config.toml");
    println!("# Global: {}", global_path.display());
    if global_path.exists() {
        println!("{}", std::fs::read_to_string(&global_path)?);
    } else {
        println!("(not found — run `koklo init` to create)\n");
    }

    let project_root = find_project_root()?;
    let toml_path = project_root.join(".koklo").join("pipeline.toml");
    println!("# Project: {}", toml_path.display());
    if toml_path.exists() {
        println!("{}", std::fs::read_to_string(&toml_path)?);
    } else {
        println!("(not found — run `koklo init` to create)\n");
    }
    Ok(())
}

pub(crate) async fn cmd_config_init(preset: PresetKind, yes: bool) -> Result<()> {
    let project_root = find_project_root()?;
    cmd_init(&project_root, preset, yes).await
}
