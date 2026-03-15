//! Workflow preset definitions for the Koklo pipeline.
//!
//! A preset is a named methodology that defines the ordered sequence of
//! [`Phase`]/agent pairs the pipeline runs through.  Adding a new preset
//! must never touch anything outside this file.
use koklo_events::Phase;
use serde::{Deserialize, Serialize};

/// Which workflow methodology to use for this pipeline run.
///
/// The variant names map 1-to-1 with the `--preset` CLI flag and the
/// `[workflow] preset` TOML key (case-insensitive).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetKind {
    /// Koklo's own Spec-Driven Development — the default 5-phase pipeline.
    Sdd,
    /// [BMAD Method v6](https://github.com/bmad-code-org/BMAD-METHOD) — agile,
    /// expert-agent workflow (8 phases).
    Bmad,
    /// [GitHub Spec Kit](https://github.com/github/spec-kit) — specification-driven
    /// workflow where specs become executable (6 phases).
    #[serde(rename = "speckit")]
    SpecKit,
    /// Light — minimal 3-phase pipeline for small changes.
    Light,
    /// Custom — loads phase list from `.koklo/workflow.toml`.
    /// Falls back to [`PresetKind::Sdd`] if the file is absent or malformed.
    Custom,
}

impl PresetKind {
    /// Parse a preset name from a string (case-insensitive).
    /// Accepts common aliases: `"spec-kit"`, `"spec_kit"` → [`PresetKind::SpecKit`].
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "sdd" => Some(Self::Sdd),
            "bmad" => Some(Self::Bmad),
            "speckit" | "spec-kit" | "spec_kit" => Some(Self::SpecKit),
            "light" => Some(Self::Light),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }

    /// Canonical lowercase identifier used in config files and the `--preset` flag.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sdd => "sdd",
            Self::Bmad => "bmad",
            Self::SpecKit => "speckit",
            Self::Light => "light",
            Self::Custom => "custom",
        }
    }

    /// Human-readable display name.
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Sdd => "Spec-Driven Development",
            Self::Bmad => "BMAD Method v6",
            Self::SpecKit => "GitHub Spec Kit",
            Self::Light => "Minimal ceremony",
            Self::Custom => "Custom (from .koklo/workflow.toml)",
        }
    }

    /// Short description shown in `koklo workflow list`.
    pub fn description(self) -> &'static str {
        match self {
            Self::Sdd => "Koklo's default spec-driven pipeline (5 phases)",
            Self::Bmad => "Agile framework with expert agents (8 phases)",
            Self::SpecKit => "Specification-driven: specs become executable (6 phases)",
            Self::Light => "Skip ceremony, jump to implementation (3 phases)",
            Self::Custom => "Loads phase list from .koklo/workflow.toml",
        }
    }

    /// Optional external reference URL for the methodology.
    pub fn reference_url(self) -> Option<&'static str> {
        match self {
            Self::Bmad => Some("https://github.com/bmad-code-org/BMAD-METHOD"),
            Self::SpecKit => Some("https://github.com/github/spec-kit"),
            _ => None,
        }
    }

    /// All variants in display order.
    pub fn all() -> &'static [PresetKind] {
        &[
            Self::Sdd,
            Self::Bmad,
            Self::SpecKit,
            Self::Light,
            Self::Custom,
        ]
    }
}

impl Default for PresetKind {
    fn default() -> Self {
        Self::Sdd
    }
}

impl std::fmt::Display for PresetKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Returns the ordered `(Phase, agent_name)` pairs for the given preset.
///
/// Each pair is one pipeline step: the workflow engine runs them in sequence.
///
/// For [`PresetKind::Custom`] this falls back to the SDD phases; the caller
/// is responsible for loading `.koklo/workflow.toml` and substituting the
/// returned list if custom overrides are present.
pub fn phases_for_preset(kind: PresetKind) -> Vec<(Phase, &'static str)> {
    match kind {
        PresetKind::Sdd | PresetKind::Custom => vec![
            (Phase::Spec, "pm"),
            (Phase::Plan, "architect"),
            (Phase::Implement, "developer"),
            (Phase::Test, "qa"),
            (Phase::Review, "reviewer"),
        ],
        PresetKind::Bmad => vec![
            (Phase::Analysis, "analyst"),
            (Phase::Spec, "pm"),
            (Phase::Plan, "architect"),
            (Phase::Implement, "developer"),
            (Phase::Test, "qa"),
            (Phase::Review, "reviewer"),
            (Phase::Security, "security"),
            (Phase::Docs, "doc-writer"),
        ],
        PresetKind::SpecKit => vec![
            (Phase::Constitution, "constitution-writer"),
            (Phase::Spec, "pm"),
            (Phase::Plan, "architect"),
            (Phase::Tasks, "task-planner"),
            (Phase::Implement, "developer"),
            (Phase::Review, "reviewer"),
        ],
        PresetKind::Light => vec![
            (Phase::Spec, "pm"),
            (Phase::Implement, "developer"),
            (Phase::Review, "reviewer"),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_presets_have_phases() {
        for &kind in PresetKind::all() {
            let phases = phases_for_preset(kind);
            assert!(!phases.is_empty(), "{:?} has no phases", kind);
        }
    }

    #[test]
    fn agent_names_are_non_empty() {
        for &kind in PresetKind::all() {
            for (_, name) in phases_for_preset(kind) {
                assert!(!name.is_empty(), "{:?}: empty agent name", kind);
            }
        }
    }

    #[test]
    fn sdd_has_exactly_5_phases() {
        assert_eq!(phases_for_preset(PresetKind::Sdd).len(), 5);
    }

    #[test]
    fn bmad_has_exactly_8_phases() {
        assert_eq!(phases_for_preset(PresetKind::Bmad).len(), 8);
    }

    #[test]
    fn speckit_has_exactly_6_phases() {
        assert_eq!(phases_for_preset(PresetKind::SpecKit).len(), 6);
    }

    #[test]
    fn light_has_exactly_3_phases() {
        assert_eq!(phases_for_preset(PresetKind::Light).len(), 3);
    }

    #[test]
    fn custom_falls_back_to_sdd_length() {
        assert_eq!(
            phases_for_preset(PresetKind::Custom).len(),
            phases_for_preset(PresetKind::Sdd).len()
        );
    }

    #[test]
    fn from_str_roundtrip() {
        for &kind in PresetKind::all() {
            assert_eq!(
                PresetKind::from_str(kind.as_str()),
                Some(kind),
                "roundtrip failed for {:?}",
                kind
            );
        }
    }

    #[test]
    fn from_str_speckit_aliases() {
        assert_eq!(PresetKind::from_str("spec-kit"), Some(PresetKind::SpecKit));
        assert_eq!(PresetKind::from_str("spec_kit"), Some(PresetKind::SpecKit));
        assert_eq!(PresetKind::from_str("SPECKIT"), Some(PresetKind::SpecKit));
    }

    #[test]
    fn from_str_unknown_returns_none() {
        assert_eq!(PresetKind::from_str("unknown"), None);
        assert_eq!(PresetKind::from_str(""), None);
    }

    #[test]
    fn all_variants_have_display_name() {
        for &kind in PresetKind::all() {
            assert!(
                !kind.display_name().is_empty(),
                "{:?} has empty display_name",
                kind
            );
        }
    }

    #[test]
    fn all_variants_have_description() {
        for &kind in PresetKind::all() {
            assert!(
                !kind.description().is_empty(),
                "{:?} has empty description",
                kind
            );
        }
    }

    #[test]
    fn bmad_and_speckit_have_reference_urls() {
        assert!(PresetKind::Bmad.reference_url().is_some());
        assert!(PresetKind::SpecKit.reference_url().is_some());
        assert!(PresetKind::Sdd.reference_url().is_none());
        assert!(PresetKind::Light.reference_url().is_none());
    }

    #[test]
    fn default_preset_is_sdd() {
        assert_eq!(PresetKind::default(), PresetKind::Sdd);
    }

    #[test]
    fn display_matches_as_str() {
        for &kind in PresetKind::all() {
            assert_eq!(kind.to_string(), kind.as_str());
        }
    }

    #[test]
    fn bmad_starts_with_analysis() {
        let phases = phases_for_preset(PresetKind::Bmad);
        assert_eq!(phases[0].0, Phase::Analysis);
        assert_eq!(phases[0].1, "analyst");
    }

    #[test]
    fn speckit_starts_with_constitution() {
        let phases = phases_for_preset(PresetKind::SpecKit);
        assert_eq!(phases[0].0, Phase::Constitution);
        assert_eq!(phases[0].1, "constitution-writer");
    }

    #[test]
    fn sdd_phase_order() {
        let phases = phases_for_preset(PresetKind::Sdd);
        assert_eq!(phases[0].0, Phase::Spec);
        assert_eq!(phases[1].0, Phase::Plan);
        assert_eq!(phases[2].0, Phase::Implement);
        assert_eq!(phases[3].0, Phase::Test);
        assert_eq!(phases[4].0, Phase::Review);
    }
}
