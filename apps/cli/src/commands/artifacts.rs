use anyhow::Result;

use crate::open_storage;

pub(crate) async fn cmd_artifacts_list(session_id: &str) -> Result<()> {
    let storage = open_storage().await?;
    let artifacts = storage.list_artifacts(session_id).await?;
    if artifacts.is_empty() {
        println!("No artifacts recorded for session {}.", session_id);
    } else {
        println!("{:<14} {:<12} PATH", "PHASE", "SIZE");
        println!("{}", "-".repeat(70));
        for artifact in artifacts {
            println!(
                "{:<14} {:<12} {}",
                artifact.phase, artifact.size_bytes, artifact.path
            );
        }
    }
    Ok(())
}

pub(crate) async fn cmd_artifacts_show(session_id: &str, phase: &str) -> Result<()> {
    let storage = open_storage().await?;
    let artifacts = storage.list_artifacts(session_id).await?;
    let artifact = artifacts
        .into_iter()
        .find(|artifact| artifact.phase == phase)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "No artifact for phase '{}' in session '{}'",
                phase,
                session_id
            )
        })?;
    let content = std::fs::read_to_string(&artifact.path)
        .map_err(|error| anyhow::anyhow!("Cannot read {}: {}", artifact.path, error))?;
    println!("{}", content);
    Ok(())
}
