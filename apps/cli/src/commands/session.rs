use anyhow::Result;
use std::path::PathBuf;

use crate::{build_orchestrator, open_storage};

pub(crate) async fn cmd_session_list() -> Result<()> {
    let storage = open_storage().await?;
    let sessions = storage.list_sessions().await?;
    if sessions.is_empty() {
        println!("No sessions found.");
    } else {
        println!(
            "{:<38} {:<8} {:<30} STATUS",
            "SESSION ID", "PRESET", "FEATURE"
        );
        println!("{}", "-".repeat(88));
        for session in sessions {
            println!(
                "{:<38} {:<8} {:<30} {}",
                session.id, session.preset, session.feature_title, session.status
            );
        }
    }
    Ok(())
}

pub(crate) async fn cmd_session_show(id: &str) -> Result<()> {
    let storage = open_storage().await?;
    match storage.get_session(id).await? {
        Some(session) => {
            println!("Session:  {}", session.id);
            println!("Feature:  {}", session.feature_title);
            println!("Preset:   {}", session.preset);
            println!("Status:   {}", session.status);
            println!("Project:  {}", session.project_path);
            println!("Workspace: {}", session.workspace_path);
            println!(
                "Branch:   {}",
                if session.workspace_branch.is_empty() {
                    "(shared project tree)"
                } else {
                    &session.workspace_branch
                }
            );
            println!("Created:  {}", session.created_at);
            println!("Updated:  {}", session.updated_at);
            println!();
            let phases = storage.get_phases_for_session(id).await?;
            if phases.is_empty() {
                println!("No phases recorded.");
            } else {
                println!("{:<14} {:<12} COMPLETED", "PHASE", "STATUS");
                println!("{}", "-".repeat(50));
                for phase in phases {
                    println!(
                        "{:<14} {:<12} {}",
                        phase.phase,
                        phase.status,
                        phase.completed_at.as_deref().unwrap_or("-")
                    );
                }
            }
        }
        None => println!("Session not found: {}", id),
    }
    Ok(())
}

pub(crate) async fn cmd_session_resume(id: &str) -> Result<()> {
    let storage = open_storage().await?;
    let session = storage
        .get_session(id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Session not found: {}", id))?;
    let orchestrator = build_orchestrator(Some(PathBuf::from(&session.project_path)), None).await?;
    orchestrator.resume(id).await?;
    let session = storage
        .get_session(id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Session not found after resume: {}", id))?;
    println!(
        "\nSession {} resumed and completed.\nWorkspace: {}\nBranch: {}",
        id,
        session.workspace_path,
        if session.workspace_branch.is_empty() {
            "(shared project tree)"
        } else {
            &session.workspace_branch
        }
    );
    Ok(())
}
