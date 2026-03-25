use super::{agents, BuiltinAgentProfile};

const SLUGS: [&str; 10] = [
    "pm",
    "architect",
    "developer",
    "qa",
    "reviewer",
    "analyst",
    "security",
    "doc-writer",
    "constitution-writer",
    "task-planner",
];

pub(super) fn slugs() -> &'static [&'static str] {
    &SLUGS
}

pub(super) fn profile(slug: &str) -> Option<&'static BuiltinAgentProfile> {
    match slug {
        "pm" => Some(&agents::pm::PROFILE),
        "architect" => Some(&agents::architect::PROFILE),
        "developer" => Some(&agents::developer::PROFILE),
        "qa" => Some(&agents::qa::PROFILE),
        "reviewer" => Some(&agents::reviewer::PROFILE),
        "analyst" => Some(&agents::analyst::PROFILE),
        "security" => Some(&agents::security::PROFILE),
        "doc-writer" => Some(&agents::doc_writer::PROFILE),
        "constitution-writer" => Some(&agents::constitution_writer::PROFILE),
        "task-planner" => Some(&agents::task_planner::PROFILE),
        _ => None,
    }
}
