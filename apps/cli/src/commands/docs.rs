use anyhow::Result;
use std::fs;
use std::process::Command;

pub(crate) async fn cmd_docs_readme(output: Option<String>) -> Result<()> {
    let project_path = std::env::current_dir()?;
    let readme = koklo_doc_generator::generate_readme(&project_path)?;
    if let Some(path) = output {
        fs::write(&path, &readme)?;
        println!("README written to {path}");
    } else {
        print!("{readme}");
    }
    Ok(())
}

pub(crate) async fn cmd_docs_changelog(since: Option<String>) -> Result<()> {
    let project_path = std::env::current_dir()?;

    // Try to get git log
    let mut cmd = Command::new("git");
    cmd.arg("log")
        .arg("--oneline")
        .arg("--no-decorate")
        .current_dir(&project_path);
    if let Some(ref tag) = since {
        cmd.arg(format!("{tag}..HEAD"));
    }
    cmd.arg("-50"); // limit to 50 entries

    let lines = match cmd.output() {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|l| l.to_string())
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    let changelog = koklo_doc_generator::generate_changelog(&lines, since.as_deref())?;
    print!("{changelog}");
    Ok(())
}

pub(crate) async fn cmd_docs_adr(title: &str) -> Result<()> {
    let adr = koklo_doc_generator::generate_adr(
        title,
        "_TODO: describe the context and problem._",
        "_TODO: describe the decision taken._",
    )?;
    print!("{adr}");
    Ok(())
}
