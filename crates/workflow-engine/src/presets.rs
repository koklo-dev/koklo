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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetKind {
    /// Koklo's own Spec-Driven Development — the default 5-phase pipeline.
    #[default]
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
    /// Bugfix Fastlane — focused 4-phase pipeline for hotfixes.
    Bugfix,
    /// Release Prep — documentation & validation pipeline for releases.
    Release,
    /// SDD Strict — extended SDD with security audit and docs (7 phases).
    Strict,
    /// Custom — loads phase list from `.koklo/workflow.toml`.
    /// Falls back to [`PresetKind::Sdd`] if the file is absent or malformed.
    Custom,
}

impl PresetKind {
    /// Parse a preset name from a string (case-insensitive).
    /// Accepts common aliases: `"spec-kit"`, `"spec_kit"` → [`PresetKind::SpecKit`].
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "sdd" => Some(Self::Sdd),
            "bmad" => Some(Self::Bmad),
            "speckit" | "spec-kit" | "spec_kit" => Some(Self::SpecKit),
            "light" => Some(Self::Light),
            "bugfix" | "bug-fix" | "bug_fix" => Some(Self::Bugfix),
            "release" | "release-prep" | "release_prep" => Some(Self::Release),
            "strict" | "sdd-strict" | "sdd_strict" => Some(Self::Strict),
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
            Self::Bugfix => "bugfix",
            Self::Release => "release",
            Self::Strict => "strict",
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
            Self::Bugfix => "Bugfix Fastlane",
            Self::Release => "Release Prep",
            Self::Strict => "SDD Strict",
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
            Self::Bugfix => "Fast pipeline for hotfixes (4 phases)",
            Self::Release => "Documentation & validation for releases (3 phases)",
            Self::Strict => "Extended SDD with security audit and docs (7 phases)",
            Self::Custom => "Loads phase list from .koklo/workflow.toml",
        }
    }

    /// Optional external reference URL for the methodology.
    pub fn reference_url(self) -> Option<&'static str> {
        match self {
            Self::Bmad => Some("https://github.com/bmad-code-org/BMAD-METHOD"),
            Self::SpecKit => Some("https://github.com/github/spec-kit"),
            Self::Bugfix
            | Self::Release
            | Self::Strict
            | Self::Sdd
            | Self::Light
            | Self::Custom => None,
        }
    }

    /// All variants in display order.
    pub fn all() -> &'static [PresetKind] {
        &[
            Self::Sdd,
            Self::Bmad,
            Self::SpecKit,
            Self::Light,
            Self::Bugfix,
            Self::Release,
            Self::Strict,
            Self::Custom,
        ]
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
        PresetKind::Bugfix => vec![
            (Phase::Spec, "pm"),
            (Phase::Implement, "developer"),
            (Phase::Test, "qa"),
            (Phase::Review, "reviewer"),
        ],
        PresetKind::Release => vec![
            (Phase::Docs, "doc-writer"),
            (Phase::Test, "qa"),
            (Phase::Review, "reviewer"),
        ],
        PresetKind::Strict => vec![
            (Phase::Spec, "pm"),
            (Phase::Plan, "architect"),
            (Phase::Implement, "developer"),
            (Phase::Test, "qa"),
            (Phase::Security, "security"),
            (Phase::Review, "reviewer"),
            (Phase::Docs, "doc-writer"),
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
    fn bugfix_has_exactly_4_phases() {
        assert_eq!(phases_for_preset(PresetKind::Bugfix).len(), 4);
    }

    #[test]
    fn release_has_exactly_3_phases() {
        assert_eq!(phases_for_preset(PresetKind::Release).len(), 3);
    }

    #[test]
    fn strict_has_exactly_7_phases() {
        assert_eq!(phases_for_preset(PresetKind::Strict).len(), 7);
    }

    #[test]
    fn bugfix_starts_with_spec() {
        let phases = phases_for_preset(PresetKind::Bugfix);
        assert_eq!(phases[0].0, Phase::Spec);
        assert_eq!(phases[0].1, "pm");
    }

    #[test]
    fn release_starts_with_docs() {
        let phases = phases_for_preset(PresetKind::Release);
        assert_eq!(phases[0].0, Phase::Docs);
        assert_eq!(phases[0].1, "doc-writer");
    }

    #[test]
    fn strict_includes_security() {
        let phases = phases_for_preset(PresetKind::Strict);
        assert!(phases.iter().any(|(p, _)| *p == Phase::Security));
    }

    #[test]
    fn from_str_bugfix_aliases() {
        assert_eq!(PresetKind::parse("bugfix"), Some(PresetKind::Bugfix));
        assert_eq!(PresetKind::parse("bug-fix"), Some(PresetKind::Bugfix));
        assert_eq!(PresetKind::parse("bug_fix"), Some(PresetKind::Bugfix));
        assert_eq!(PresetKind::parse("BUGFIX"), Some(PresetKind::Bugfix));
    }

    #[test]
    fn from_str_release_aliases() {
        assert_eq!(PresetKind::parse("release"), Some(PresetKind::Release));
        assert_eq!(PresetKind::parse("release-prep"), Some(PresetKind::Release));
        assert_eq!(PresetKind::parse("release_prep"), Some(PresetKind::Release));
    }

    #[test]
    fn from_str_strict_aliases() {
        assert_eq!(PresetKind::parse("strict"), Some(PresetKind::Strict));
        assert_eq!(PresetKind::parse("sdd-strict"), Some(PresetKind::Strict));
        assert_eq!(PresetKind::parse("sdd_strict"), Some(PresetKind::Strict));
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
                PresetKind::parse(kind.as_str()),
                Some(kind),
                "roundtrip failed for {:?}",
                kind
            );
        }
    }

    #[test]
    fn from_str_speckit_aliases() {
        assert_eq!(PresetKind::parse("spec-kit"), Some(PresetKind::SpecKit));
        assert_eq!(PresetKind::parse("spec_kit"), Some(PresetKind::SpecKit));
        assert_eq!(PresetKind::parse("SPECKIT"), Some(PresetKind::SpecKit));
    }

    #[test]
    fn from_str_unknown_returns_none() {
        assert_eq!(PresetKind::parse("unknown"), None);
        assert_eq!(PresetKind::parse(""), None);
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
        assert!(PresetKind::Bugfix.reference_url().is_none());
        assert!(PresetKind::Release.reference_url().is_none());
        assert!(PresetKind::Strict.reference_url().is_none());
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
