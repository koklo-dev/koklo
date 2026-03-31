use anyhow::{bail, Result};
use std::process::Command;

/// Editor detection order.
const EDITOR_CANDIDATES: &[&str] = &["cursor", "code", "zed", "nvim", "vim", "nano"];

struct DetectedEditor {
    name: &'static str,
    path: String,
}

fn detect_editor() -> Option<DetectedEditor> {
    // 1. $KOKLO_EDITOR
    if let Ok(editor) = std::env::var("KOKLO_EDITOR") {
        if which::which(&editor).is_ok() {
            return Some(DetectedEditor {
                name: "custom ($KOKLO_EDITOR)",
                path: editor,
            });
        }
    }
    // 2. $EDITOR
    if let Ok(editor) = std::env::var("EDITOR") {
        if which::which(&editor).is_ok() {
            return Some(DetectedEditor {
                name: "custom ($EDITOR)",
                path: editor,
            });
        }
    }
    // 3. Auto-detect
    for &name in EDITOR_CANDIDATES {
        if let Ok(path) = which::which(name) {
            return Some(DetectedEditor {
                name: candidate_display_name(name),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
    None
}

fn candidate_display_name(name: &str) -> &'static str {
    match name {
        "cursor" => "Cursor",
        "code" => "VS Code",
        "zed" => "Zed",
        "nvim" => "Neovim",
        "vim" => "Vim",
        "nano" => "Nano",
        _ => "Unknown",
    }
}

fn open_in_editor(editor_path: &str, file: &str, line: Option<u32>) -> Result<()> {
    let editor_name = std::path::Path::new(editor_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    let mut cmd = Command::new(editor_path);

    match editor_name.as_str() {
        "code" | "cursor" => {
            if let Some(line) = line {
                cmd.arg("--goto").arg(format!("{file}:{line}"));
            } else {
                cmd.arg(file);
            }
        }
        "zed" => {
            if let Some(line) = line {
                cmd.arg(format!("{file}:{line}"));
            } else {
                cmd.arg(file);
            }
        }
        "vim" | "nvim" | "vi" => {
            if let Some(line) = line {
                cmd.arg(format!("+{line}")).arg(file);
            } else {
                cmd.arg(file);
            }
        }
        _ => {
            cmd.arg(file);
        }
    }

    let status = cmd.status()?;
    if !status.success() {
        bail!("Editor exited with status {status}");
    }
    Ok(())
}

pub(crate) async fn cmd_ide_detect() -> Result<()> {
    match detect_editor() {
        Some(editor) => {
            println!("Detected: {} ({})", editor.name, editor.path);
        }
        None => {
            println!("No editor detected.");
            println!(
                "Set $KOKLO_EDITOR or $EDITOR, or install one of: {}",
                EDITOR_CANDIDATES.join(", ")
            );
        }
    }
    Ok(())
}

pub(crate) async fn cmd_ide_open(file: &str, line: Option<u32>) -> Result<()> {
    let editor = detect_editor().ok_or_else(|| {
        anyhow::anyhow!(
            "No editor found. Set $KOKLO_EDITOR or $EDITOR, or install one of: {}",
            EDITOR_CANDIDATES.join(", ")
        )
    })?;
    println!("Opening {} in {}...", file, editor.name);
    open_in_editor(&editor.path, file, line)?;
    Ok(())
}
