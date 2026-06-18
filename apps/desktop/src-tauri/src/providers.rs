//! `providers.*` IPC wire types (Sprint 007 / US-015, roadmap P2 §1).
//!
//! Pure projections only — the registry-backed handlers live in [`crate::handlers`].

use koklo_providers::{
    detect::{DetectionSource, ProviderDetection},
    ProviderInteractionMode,
};
use serde::Serialize;

/// A configured/detected provider for the Settings → AI Accounts panel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDto {
    pub name: String,
    pub interaction_mode: String,
    pub detected: bool,
    pub detection_source: Option<String>,
}

/// Wire label for a provider interaction mode (mirrors the TS `ProviderInteractionMode`).
pub fn interaction_mode_label(mode: ProviderInteractionMode) -> &'static str {
    match mode {
        ProviderInteractionMode::Native => "native",
        ProviderInteractionMode::Normalized => "normalized",
        ProviderInteractionMode::Synthetic => "synthetic",
    }
}

/// Wire label for where auto-detection found a provider.
pub fn detection_source_label(source: &DetectionSource) -> &'static str {
    match source {
        DetectionSource::Ollama { .. } => "ollama",
        DetectionSource::LocalCli { .. } => "cli",
        DetectionSource::EnvKey { .. } => "env",
        DetectionSource::Config => "config",
    }
}

/// `providers.list` — project `(name, interaction_mode)` pairs (from the built
/// registry) into DTOs, sorted by name. Every listed provider is `detected` (it is
/// configured/available in the registry) with source `"config"`.
pub fn provider_dtos<'a>(
    entries: impl Iterator<Item = (&'a str, ProviderInteractionMode)>,
) -> Vec<ProviderDto> {
    let mut dtos: Vec<ProviderDto> = entries
        .map(|(name, mode)| ProviderDto {
            name: name.to_string(),
            interaction_mode: interaction_mode_label(mode).to_string(),
            detected: true,
            detection_source: Some("config".to_string()),
        })
        .collect();
    dtos.sort_by(|a, b| a.name.cmp(&b.name));
    dtos
}

/// `providers.detect` — project an auto-detection outcome into a DTO. `mode_of`
/// resolves the detected provider's interaction mode (from the registry); a provider
/// detected but not built falls back to the registry default.
pub fn provider_detection_dto(
    detection: &ProviderDetection,
    mode_of: impl Fn(&str) -> ProviderInteractionMode,
) -> Option<ProviderDto> {
    match detection {
        ProviderDetection::Detected { provider, source } => Some(ProviderDto {
            name: provider.clone(),
            interaction_mode: interaction_mode_label(mode_of(provider)).to_string(),
            detected: true,
            detection_source: Some(detection_source_label(source).to_string()),
        }),
        ProviderDetection::NeedsSelection => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_dtos_are_labeled_and_sorted() {
        let dtos = provider_dtos(
            [
                ("openrouter", ProviderInteractionMode::Normalized),
                ("claude-code", ProviderInteractionMode::Native),
            ]
            .into_iter(),
        );
        assert_eq!(
            dtos.iter().map(|d| d.name.as_str()).collect::<Vec<_>>(),
            vec!["claude-code", "openrouter"]
        );
        assert_eq!(dtos[0].interaction_mode, "native");
        assert!(dtos[0].detected);
        assert_eq!(dtos[0].detection_source.as_deref(), Some("config"));
    }

    #[test]
    fn provider_detection_dto_maps_detected_source() {
        let detection = ProviderDetection::Detected {
            provider: "claude-code".to_string(),
            source: DetectionSource::LocalCli {
                binary: "claude".to_string(),
            },
        };
        let dto = provider_detection_dto(&detection, |_| ProviderInteractionMode::Native).unwrap();
        assert_eq!(dto.name, "claude-code");
        assert_eq!(dto.interaction_mode, "native");
        assert_eq!(dto.detection_source.as_deref(), Some("cli"));
    }

    #[test]
    fn provider_detection_dto_is_none_when_unresolved() {
        let dto = provider_detection_dto(&ProviderDetection::NeedsSelection, |_| {
            ProviderInteractionMode::Synthetic
        });
        assert!(dto.is_none());
    }
}
