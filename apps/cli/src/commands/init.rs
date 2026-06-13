use anyhow::Result;
use koklo_workflow_engine::presets::PresetKind;
use std::path::{Path, PathBuf};

use crate::home_dirs;

pub(crate) async fn cmd_init(path: &PathBuf, preset: PresetKind, yes: bool) -> Result<()> {
    let target = if path == &PathBuf::from(".") {
        std::env::current_dir()?
    } else {
        path.clone()
    };

    println!("Initializing koklo...\n");

    let global_home = home_dirs::ensure_home()?;
    println!("Global home: {}/", global_home.display());
    println!("  config.toml    ✓");
    println!("  USER.md        ✓  (edit to tell agents who you are)");
    println!("  agents/        ✓  (rich agent profiles in ~/.koklo/agents/<agent>/)");
    println!("  koklo.db       will be created on first run");

    let koklo_dir = target.join(".koklo");
    let toml_path = koklo_dir.join("pipeline.toml");

    if toml_path.exists() && !yes {
        println!("\nProject: {}", target.display());
        println!("  .koklo/pipeline.toml   already exists");
        println!("\nUse `koklo config init` to reconfigure.");
        return Ok(());
    }

    let detected_preset = detect_stack_preset(&target);
    let chosen_preset = if !yes && detected_preset != preset {
        println!(
            "\nDetected stack suggests '{}' preset. You specified '{}'. Using '{}'.",
            detected_preset.as_str(),
            preset.as_str(),
            preset.as_str()
        );
        preset
    } else {
        preset
    };

    if !yes {
        println!(
            "\nProject: {}\nPreset:  {} — {}\nCreate .koklo/pipeline.toml? [Y/n] ",
            target.display(),
            chosen_preset.as_str(),
            chosen_preset.display_name()
        );
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        let trimmed = input.trim().to_lowercase();
        if trimmed == "n" || trimmed == "no" {
            println!("Aborted.");
            return Ok(());
        }
    }

    std::fs::create_dir_all(&koklo_dir)?;
    write_default_pipeline_toml(&toml_path, chosen_preset)?;

    let project_md = koklo_dir.join("PROJECT.md");
    if !project_md.exists() {
        std::fs::write(
            &project_md,
            "# Project Constitution\n\n\
             <!-- Describe this project: tech stack, conventions, goals. -->\n\
             <!-- This file is injected into every agent prompt for this project. -->\n",
        )?;
    }

    println!("\nProject: {}", target.display());
    println!("  .koklo/pipeline.toml   ✓ created");
    println!("  .koklo/PROJECT.md      ✓ created  (edit to add project constitution)");
    println!("\nRun `koklo run feature \"your feature\"` to start.");
    Ok(())
}

fn detect_stack_preset(dir: &Path) -> PresetKind {
    if dir.join("Cargo.toml").exists() {
        return PresetKind::Sdd;
    }
    if dir.join("package.json").exists() {
        return PresetKind::SpecKit;
    }
    if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        return PresetKind::Sdd;
    }
    if dir.join("go.mod").exists() {
        return PresetKind::Sdd;
    }
    PresetKind::Sdd
}

pub(crate) fn write_default_pipeline_toml(path: &PathBuf, preset: PresetKind) -> Result<()> {
    let content = format!(
        r#"[pipeline]
artifacts_dir = "docs/planning_artifacts"

[workflow]
preset = "{preset}"

# Provider overrides are optional — global $KOKLO_HOME/config.toml is used by default.
# [providers.openrouter]
# model = "anthropic/claude-opus-4-6"
"#,
        preset = preset.as_str()
    );
    std::fs::write(path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_stack_preset_prefers_rust_projects() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "[package]\nname='demo'\n").unwrap();

        assert_eq!(detect_stack_preset(dir.path()), PresetKind::Sdd);
    }

    #[test]
    fn detect_stack_preset_detects_node_projects() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), "{}\n").unwrap();

        assert_eq!(detect_stack_preset(dir.path()), PresetKind::SpecKit);
    }

    #[test]
    fn write_default_pipeline_toml_writes_selected_preset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pipeline.toml");

        write_default_pipeline_toml(&path, PresetKind::Light).unwrap();

        let content = std::fs::read_to_string(path).unwrap();
        assert!(content.contains("preset = \"light\""));
        assert!(content.contains("[pipeline]"));
    }
}
