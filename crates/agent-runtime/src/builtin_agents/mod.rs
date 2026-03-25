#[path = "agents/mod.rs"]
mod agents;
mod catalog;
mod profile;
mod render;

pub type BuiltinAgentFile = (String, String);
pub(crate) use profile::BuiltinAgentProfile;

const BUILTIN_SHARED_PROJECT_PROMPT: &str = r#"# Koklo Shared Constitution

Use the workspace as the source of truth.
Prefer inspecting code, docs, tests, and prior phase artifacts over guessing.
Respect phase boundaries: each agent must do its own job and hand off cleanly to the next phase.
"#;

pub fn builtin_shared_project_prompt() -> &'static str {
    BUILTIN_SHARED_PROJECT_PROMPT
}

pub fn builtin_agent_slugs() -> &'static [&'static str] {
    catalog::slugs()
}

pub fn builtin_agent_files(slug: &str) -> Option<Vec<BuiltinAgentFile>> {
    let profile = catalog::profile(slug)?;
    Some(vec![
        (
            "IDENTITY.md".to_string(),
            render::build_identity_prompt(profile),
        ),
        ("SOUL.md".to_string(), render::build_soul_prompt(profile)),
        (
            "AGENTS.md".to_string(),
            render::build_agents_prompt(profile),
        ),
        (
            "GUARDRAILS.md".to_string(),
            render::build_guardrails_prompt(profile),
        ),
    ])
}

pub fn builtin_agent_prompt(slug: &str) -> Option<String> {
    builtin_agent_files(slug).map(|files| {
        files
            .iter()
            .map(|(_, content)| content.trim())
            .filter(|content| !content.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_agent_catalog_covers_known_roles() {
        for slug in builtin_agent_slugs() {
            let prompt = builtin_agent_prompt(slug).unwrap();
            assert!(
                !prompt.trim().is_empty(),
                "missing built-in prompt for {slug}"
            );
            let files = builtin_agent_files(slug).unwrap();
            assert!(
                !files.is_empty(),
                "missing built-in prompt files for {slug}"
            );
        }
    }

    #[test]
    fn builtin_guardrails_are_role_specific() {
        let files = builtin_agent_files("developer").unwrap();
        let guardrails = files
            .iter()
            .find(|(name, _)| name == "GUARDRAILS.md")
            .map(|(_, content)| content)
            .unwrap();

        assert!(guardrails.contains("Do not claim validation you did not run"));
        assert!(guardrails.contains("Escalation Triggers"));
        assert!(guardrails.contains("required validation cannot be run"));
    }
}
