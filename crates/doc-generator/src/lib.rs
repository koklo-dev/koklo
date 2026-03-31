//! Documentation generation utilities for Koklo.
//!
//! Provides helpers that analyse a project directory and produce skeleton
//! documentation files (README, CHANGELOG, ADR).

use anyhow::Result;
use std::fs;
use std::path::Path;

/// Analyse a project directory and generate a README skeleton.
///
/// Detects: language/framework (Cargo.toml, package.json, go.mod, etc.),
/// project name, description, and entry points.
pub fn generate_readme(project_path: &Path) -> Result<String> {
    let project_name = project_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "project".to_string());

    let mut sections = Vec::new();

    // Title
    sections.push(format!("# {project_name}\n"));

    // Description from Cargo.toml or package.json
    if let Some(desc) = detect_description(project_path) {
        sections.push(format!("{desc}\n"));
    }

    // Stack detection
    let stack = detect_stack(project_path);
    if !stack.is_empty() {
        sections.push(format!("## Tech Stack\n\n{}\n", stack.join(", ")));
    }

    // Getting started
    sections.push("## Getting Started\n".to_string());
    if project_path.join("Cargo.toml").exists() {
        sections.push("```bash\ncargo build\ncargo test\n```\n".to_string());
    } else if project_path.join("package.json").exists() {
        sections.push("```bash\nnpm install\nnpm test\n```\n".to_string());
    } else if project_path.join("go.mod").exists() {
        sections.push("```bash\ngo build ./...\ngo test ./...\n```\n".to_string());
    } else if project_path.join("requirements.txt").exists()
        || project_path.join("pyproject.toml").exists()
    {
        sections
            .push("```bash\npip install -r requirements.txt\npython -m pytest\n```\n".to_string());
    }

    // Project structure
    let structure = detect_structure(project_path);
    if !structure.is_empty() {
        sections.push("## Project Structure\n".to_string());
        sections.push(format!("```\n{}\n```\n", structure.join("\n")));
    }

    // License
    if project_path.join("LICENSE").exists() || project_path.join("LICENSE.md").exists() {
        sections.push("## License\n\nSee [LICENSE](LICENSE) for details.\n".to_string());
    }

    Ok(sections.join("\n"))
}

/// Generate a CHANGELOG skeleton from git log output.
///
/// `git_log_lines` should be lines from `git log --oneline --no-decorate`.
pub fn generate_changelog(git_log_lines: &[String], since_tag: Option<&str>) -> Result<String> {
    let mut sections = Vec::new();
    let date = chrono::Utc::now().format("%Y-%m-%d");

    let heading = if let Some(tag) = since_tag {
        format!("# Changelog\n\n## Changes since {tag} ({date})\n")
    } else {
        format!("# Changelog\n\n## Unreleased ({date})\n")
    };
    sections.push(heading);

    if git_log_lines.is_empty() {
        sections.push("No changes recorded.\n".to_string());
    } else {
        for line in git_log_lines {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                sections.push(format!("- {trimmed}"));
            }
        }
        sections.push(String::new());
    }

    Ok(sections.join("\n"))
}

/// Generate an Architecture Decision Record from a title and context.
pub fn generate_adr(title: &str, context: &str, decision: &str) -> Result<String> {
    let date = chrono::Utc::now().format("%Y-%m-%d");
    Ok(format!(
        "# ADR: {title}\n\n\
         **Date:** {date}\n\
         **Status:** Accepted\n\n\
         ## Context\n\n\
         {context}\n\n\
         ## Decision\n\n\
         {decision}\n\n\
         ## Consequences\n\n\
         _TODO: describe the consequences of this decision._\n"
    ))
}

// ── helpers ──────────────────────────────────────────────────────────────

fn detect_description(project_path: &Path) -> Option<String> {
    // Try Cargo.toml
    if let Ok(content) = fs::read_to_string(project_path.join("Cargo.toml")) {
        for line in content.lines() {
            if let Some(desc) = line.strip_prefix("description") {
                let desc = desc.trim().trim_start_matches('=').trim().trim_matches('"');
                if !desc.is_empty() {
                    return Some(desc.to_string());
                }
            }
        }
    }
    // Try package.json
    if let Ok(content) = fs::read_to_string(project_path.join("package.json")) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("\"description\"") {
                if let Some(start) = trimmed.find(": \"") {
                    let rest = &trimmed[start + 3..];
                    if let Some(end) = rest.find('"') {
                        let desc = &rest[..end];
                        if !desc.is_empty() {
                            return Some(desc.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

fn detect_stack(project_path: &Path) -> Vec<&'static str> {
    let mut stack = Vec::new();
    if project_path.join("Cargo.toml").exists() {
        stack.push("Rust");
    }
    if project_path.join("package.json").exists() {
        stack.push("Node.js");
    }
    if project_path.join("go.mod").exists() {
        stack.push("Go");
    }
    if project_path.join("pyproject.toml").exists()
        || project_path.join("requirements.txt").exists()
    {
        stack.push("Python");
    }
    if project_path.join("Gemfile").exists() {
        stack.push("Ruby");
    }
    if project_path.join("pom.xml").exists() || project_path.join("build.gradle").exists() {
        stack.push("Java");
    }
    if project_path.join("docker-compose.yml").exists() || project_path.join("Dockerfile").exists()
    {
        stack.push("Docker");
    }
    stack
}

fn detect_structure(project_path: &Path) -> Vec<String> {
    let interesting = [
        "src", "crates", "apps", "packages", "lib", "cmd", "tests", "docs", "scripts",
    ];
    let mut found = Vec::new();
    if let Ok(entries) = fs::read_dir(project_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false)
                && interesting.contains(&name.as_str())
            {
                found.push(format!("{name}/"));
            }
        }
    }
    found.sort();
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn generate_readme_for_rust_project() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("Cargo.toml"),
            "[package]\nname = \"test-proj\"\ndescription = \"A test project\"\n",
        )
        .unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();

        let readme = generate_readme(dir.path()).unwrap();
        assert!(readme.contains("A test project"));
        assert!(readme.contains("Rust"));
        assert!(readme.contains("cargo build"));
        assert!(readme.contains("src/"));
    }

    #[test]
    fn generate_readme_for_node_project() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("package.json"),
            "{\n  \"name\": \"my-app\",\n  \"description\": \"A node app\"\n}\n",
        )
        .unwrap();

        let readme = generate_readme(dir.path()).unwrap();
        assert!(readme.contains("Node.js"));
        assert!(readme.contains("npm install"));
    }

    #[test]
    fn generate_changelog_with_entries() {
        let lines = vec![
            "abc1234 Fix login bug".to_string(),
            "def5678 Add user profile".to_string(),
        ];
        let log = generate_changelog(&lines, None).unwrap();
        assert!(log.contains("# Changelog"));
        assert!(log.contains("Unreleased"));
        assert!(log.contains("- abc1234 Fix login bug"));
        assert!(log.contains("- def5678 Add user profile"));
    }

    #[test]
    fn generate_changelog_with_since_tag() {
        let lines = vec!["abc Fix".to_string()];
        let log = generate_changelog(&lines, Some("v0.1.0")).unwrap();
        assert!(log.contains("since v0.1.0"));
    }

    #[test]
    fn generate_changelog_empty() {
        let log = generate_changelog(&[], None).unwrap();
        assert!(log.contains("No changes recorded"));
    }

    #[test]
    fn generate_adr_basic() {
        let adr = generate_adr(
            "Use SQLite",
            "We need local storage",
            "SQLite with WAL mode",
        )
        .unwrap();
        assert!(adr.contains("# ADR: Use SQLite"));
        assert!(adr.contains("We need local storage"));
        assert!(adr.contains("SQLite with WAL mode"));
        assert!(adr.contains("Consequences"));
    }

    #[test]
    fn detect_stack_multi() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Cargo.toml"), "").unwrap();
        fs::write(dir.path().join("package.json"), "{}").unwrap();
        fs::write(dir.path().join("Dockerfile"), "").unwrap();
        let stack = detect_stack(dir.path());
        assert!(stack.contains(&"Rust"));
        assert!(stack.contains(&"Node.js"));
        assert!(stack.contains(&"Docker"));
    }
}
