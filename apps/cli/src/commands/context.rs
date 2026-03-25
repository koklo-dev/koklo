use anyhow::Result;

use crate::{find_project_root, home_dirs};

pub(crate) async fn cmd_context_show() -> Result<()> {
    let global_home = home_dirs::koklo_home();
    let project_root = find_project_root()?;
    let koklo_dir = project_root.join(".koklo");

    println!("Global context: {}/", global_home.display());
    for (file, desc) in &[
        ("USER.md", "Who the user is"),
        ("MEMORY.md", "Long-term memory"),
    ] {
        let path = global_home.join(file);
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let first_line = content.lines().next().unwrap_or("(empty)");
            println!("  {} — {} ✓", file, desc);
            println!("    {}", first_line);
        } else {
            println!("  {} — {} (not found)", file, desc);
        }
    }
    let global_memories = global_home.join("memories");
    if global_memories.exists() {
        let count = std::fs::read_dir(&global_memories)
            .map(|entries| entries.count())
            .unwrap_or(0);
        println!("  memories/ ({} files)", count);
    } else {
        println!("  memories/ (no logs yet)");
    }

    println!();
    if koklo_dir.exists() {
        println!("Project context: {}/", koklo_dir.display());
        for (file, desc) in &[
            ("PROJECT.md", "Project constitution"),
            ("MEMORY.md", "Project memory"),
        ] {
            let path = koklo_dir.join(file);
            if path.exists() {
                let content = std::fs::read_to_string(&path)?;
                let first_line = content.lines().next().unwrap_or("(empty)");
                println!("  {} — {} ✓", file, desc);
                println!("    {}", first_line);
            } else {
                println!("  {} — {} (not found)", file, desc);
            }
        }
        let project_memories = koklo_dir.join("memories");
        if project_memories.exists() {
            let mut entries: Vec<_> = std::fs::read_dir(&project_memories)?
                .filter_map(|entry| entry.ok())
                .collect();
            entries.sort_by_key(|entry| entry.file_name());
            println!("  memories/ ({} files)", entries.len());
            for entry in entries.iter().rev().take(3) {
                println!("    {}", entry.file_name().to_string_lossy());
            }
            if entries.len() > 3 {
                println!("    ... and {} more", entries.len() - 3);
            }
        } else {
            println!("  memories/ (no project session logs yet)");
        }
    } else {
        println!(
            "Project context: (none — no .koklo/ in {})",
            project_root.display()
        );
        println!("  Run `koklo init` to create one.");
    }

    Ok(())
}

pub(crate) async fn cmd_context_init() -> Result<()> {
    let project_root = find_project_root()?;
    let koklo_dir = project_root.join(".koklo");
    std::fs::create_dir_all(&koklo_dir)?;

    let user_md = koklo_dir.join("USER.md");
    if user_md.exists() {
        println!("USER.md already exists: {}", user_md.display());
        println!("Edit it directly to update your user context.");
        return Ok(());
    }

    println!("Creating .koklo/USER.md");
    println!(
        "This file is injected into every agent prompt so agents know who they're working with."
    );
    println!();

    println!("Your name (or handle): ");
    let mut name = String::new();
    std::io::stdin().read_line(&mut name)?;
    let name = name.trim().to_string();

    println!("Your role/title (e.g. 'Senior Rust Engineer', 'indie hacker'): ");
    let mut role = String::new();
    std::io::stdin().read_line(&mut role)?;
    let role = role.trim().to_string();

    println!("Your main stack/languages (e.g. 'Rust, TypeScript, Python'): ");
    let mut stack = String::new();
    std::io::stdin().read_line(&mut stack)?;
    let stack = stack.trim().to_string();

    let content = format!(
        "# User Context\n\nName: {}\nRole: {}\nStack: {}\n\n\
         ## Preferences\n\n\
         - Prefer concise, direct explanations\n\
         - Show me the code, not just the theory\n\
         - Flag trade-offs explicitly\n",
        if name.is_empty() { "Unknown" } else { &name },
        if role.is_empty() { "Developer" } else { &role },
        if stack.is_empty() {
            "Not specified"
        } else {
            &stack
        },
    );

    std::fs::write(&user_md, &content)?;
    println!("\nCreated: {}", user_md.display());
    println!("Edit this file anytime to update what agents know about you.");

    let memory_md = koklo_dir.join("MEMORY.md");
    if !memory_md.exists() {
        std::fs::write(
            &memory_md,
            "# Project Memory\n\n\
             Add hand-curated notes here. This file is injected into every agent prompt.\n\
             Keep it concise — agents read this on every pipeline run.\n",
        )?;
        println!("Created: {}", memory_md.display());
    }

    Ok(())
}
