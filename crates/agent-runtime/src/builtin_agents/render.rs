use crate::builtin_agents::BuiltinAgentProfile;

pub(super) fn build_identity_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "# IDENTITY.md\n\nName: {name}\nTitle: {title}\nTheme: {theme}\nVibe: {vibe}\nEmoji: {emoji}\nMission: {mission}\n",
        name = profile.name,
        title = profile.title,
        theme = profile.theme,
        vibe = profile.vibe,
        emoji = profile.emoji,
        mission = profile.mission,
    )
}

pub(super) fn build_soul_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "# SOUL.md - {name}, {title}\n\nIdentity\nYour identity is already defined in IDENTITY.md.\nDo not ask the user to define your name, title, emoji, or role.\n\nPersonality\n{personality}\nCommunication Style\n{communication}\n",
        name = profile.name,
        title = profile.title,
        personality = format_bullets(profile.personality),
        communication = format_bullets(profile.communication_style),
    )
}

pub(super) fn build_agents_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "# AGENTS.md - {name} ({title})\n\nRole in the Delivery System\n{role}\n\nAlways Load First\n{always_load}\nCore Responsibilities\n{responsibilities}\nHandoff Discipline\n{handoff}\n",
        name = profile.name,
        title = profile.title,
        role = profile.role_in_system,
        always_load = format_bullets(profile.always_load_first),
        responsibilities = format_bullets(profile.responsibilities),
        handoff = format_bullets(profile.handoff_rules),
    )
}

pub(super) fn build_guardrails_prompt(profile: &BuiltinAgentProfile) -> String {
    format!(
        "# GUARDRAILS.md - {name} ({title})\n\nOperating Limits\n{guardrails}\n\nEscalation Triggers\n{escalation}\n\nEscalation Discipline\n- State clearly what is blocked, what evidence is missing, and what decision is needed.\n- Protect role boundaries even when the user request is vague or pressure is high.\n- Prefer an explicit stop over a confident mistake in the wrong role.\n",
        name = profile.name,
        title = profile.title,
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
