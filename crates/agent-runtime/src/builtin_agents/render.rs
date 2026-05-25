use crate::builtin_agents::BuiltinAgentProfile;

pub(super) fn build_identity_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "Name: {name}\nTitle: {title}\nTheme: {theme}\nMission: {mission}",
        name = profile.name,
        title = profile.title,
        theme = profile.theme,
        mission = profile.mission,
    )
}

pub(super) fn build_soul_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "Style\n{personality}\nCommunication\n{communication}",
        personality = format_bullets(profile.personality),
        communication = format_bullets(profile.communication_style),
    )
}

pub(super) fn build_agents_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "Role\n{role}\nLoad First\n{always_load}\nResponsibilities\n{responsibilities}\nHandoff\n{handoff}",
        role = profile.role_in_system,
        always_load = format_bullets(profile.always_load_first),
        responsibilities = format_bullets(profile.responsibilities),
        handoff = format_bullets(profile.handoff_rules),
    )
}

pub(super) fn build_guardrails_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "Limits\n{guardrails}\nEscalate When\n{escalation}\nEscalation Discipline\n- State what is blocked, what evidence is missing, and what decision is needed.\n- Prefer an explicit stop over a confident mistake outside your role.",
        guardrails = format_bullets(profile.guardrails),
        escalation = format_bullets(profile.escalation_triggers),
    )
}

fn format_bullets(items: &[&str]) -> String {
    items
        .iter()
        .map(|item| format!("- {item}\n"))
        .collect::<String>()
}
