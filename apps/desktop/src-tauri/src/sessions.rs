use crate::ipc::SessionDto;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use koklo_storage::SessionManager;
use koklo_workflow_engine::presets::PresetKind;
use serde::Deserialize;

const RUN_TYPES: &str = "feature, bug, task";
const RUN_PRESETS: &str = "light, sdd, bmad, speckit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunType {
    Feature,
    Bug,
    Task,
}

impl RunType {
    fn parse(value: &str) -> Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "feature" => Ok(Self::Feature),
            "bug" => Ok(Self::Bug),
            "task" => Ok(Self::Task),
            other => Err(anyhow!(
                "unsupported run type `{other}`; supported values: {RUN_TYPES}"
            )),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSessionInput {
    #[serde(rename = "type")]
    pub run_type: String,
    pub title: String,
    pub preset: String,
    pub project_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunSpec {
    pub run_type: RunType,
    pub title: String,
    pub preset: PresetKind,
    pub project_path: String,
}

impl TryFrom<RunSessionInput> for RunSpec {
    type Error = anyhow::Error;

    fn try_from(input: RunSessionInput) -> Result<Self> {
        let title = input.title.trim();
        if title.is_empty() {
            return Err(anyhow!("run title must not be empty"));
        }
        let project_path = input.project_path.trim();
        if project_path.is_empty() {
            return Err(anyhow!("projectPath must not be empty"));
        }
        let preset = PresetKind::parse(&input.preset).filter(|preset| {
            matches!(
                preset,
                PresetKind::Light | PresetKind::Sdd | PresetKind::Bmad | PresetKind::SpecKit
            )
        });
        let preset = preset.ok_or_else(|| {
            anyhow!(
                "unsupported run preset `{}`; supported values: {RUN_PRESETS}",
                input.preset
            )
        })?;

        Ok(Self {
            run_type: RunType::parse(&input.run_type)?,
            title: title.to_string(),
            preset,
            project_path: project_path.to_string(),
        })
    }
}

#[async_trait]
pub trait SessionRunner: Send + Sync {
    async fn run(&self, spec: RunSpec) -> Result<String>;
}

/// Validate and start a workflow-engine run, then return its persisted session.
pub async fn sessions_run(
    storage: &SessionManager,
    runner: &dyn SessionRunner,
    input: RunSessionInput,
) -> Result<SessionDto> {
    let session_id = runner.run(input.try_into()?).await?;
    storage
        .get_session(&session_id)
        .await?
        .map(SessionDto::from)
        .ok_or_else(|| anyhow!("workflow engine returned unknown session `{session_id}`"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    struct RecordingRunner {
        storage: Arc<SessionManager>,
        calls: Arc<Mutex<Vec<RunSpec>>>,
    }

    #[async_trait]
    impl SessionRunner for RecordingRunner {
        async fn run(&self, spec: RunSpec) -> Result<String> {
            self.calls.lock().unwrap().push(spec.clone());
            let session = self
                .storage
                .create_session(&spec.title, spec.preset.as_str(), &spec.project_path)
                .await?;
            self.storage
                .update_session_status(&session.id, "running")
                .await?;
            Ok(session.id)
        }
    }

    fn input(run_type: &str, preset: &str) -> RunSessionInput {
        RunSessionInput {
            run_type: run_type.to_string(),
            title: "Desktop pipeline".to_string(),
            preset: preset.to_string(),
            project_path: "/repo".to_string(),
        }
    }

    #[test]
    fn validates_and_maps_supported_values() {
        let spec = RunSpec::try_from(input("bug", "speckit")).unwrap();
        assert_eq!(spec.run_type, RunType::Bug);
        assert_eq!(spec.preset, PresetKind::SpecKit);
    }

    #[test]
    fn rejects_unsupported_values_with_actionable_errors() {
        let type_error = RunSpec::try_from(input("spike", "light")).unwrap_err();
        assert!(type_error.to_string().contains(RUN_TYPES));

        let preset_error = RunSpec::try_from(input("task", "custom")).unwrap_err();
        assert!(preset_error.to_string().contains(RUN_PRESETS));
    }

    #[tokio::test]
    async fn persists_session_and_starts_through_runner_boundary() {
        let storage = Arc::new(SessionManager::in_memory().await.unwrap());
        let calls = Arc::new(Mutex::new(Vec::new()));
        let runner = RecordingRunner {
            storage: Arc::clone(&storage),
            calls: Arc::clone(&calls),
        };

        let dto = sessions_run(storage.as_ref(), &runner, input("feature", "light"))
            .await
            .unwrap();

        assert_eq!(dto.status, "running");
        assert_eq!(dto.preset, "light");
        assert!(storage.get_session(&dto.id).await.unwrap().is_some());
        let recorded = calls.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].run_type, RunType::Feature);
    }
}
