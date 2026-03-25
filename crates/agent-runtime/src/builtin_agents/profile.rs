#[derive(Debug)]
pub(crate) struct BuiltinAgentProfile {
    pub(crate) name: &'static str,
    pub(crate) title: &'static str,
    pub(crate) emoji: &'static str,
    pub(crate) theme: &'static str,
    pub(crate) vibe: &'static str,
    pub(crate) mission: &'static str,
    pub(crate) role_in_system: &'static str,
    pub(crate) always_load_first: &'static [&'static str],
    pub(crate) responsibilities: &'static [&'static str],
    pub(crate) personality: &'static [&'static str],
    pub(crate) communication_style: &'static [&'static str],
    pub(crate) handoff_rules: &'static [&'static str],
    pub(crate) guardrails: &'static [&'static str],
    pub(crate) escalation_triggers: &'static [&'static str],
}
