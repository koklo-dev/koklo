//! Configuration types for `.koklo/pipeline.toml`.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use anyhow::Result;

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PipelineTomlConfig {
    #[serde(default)]
    pub pipeline: PipelineSection,
    #[serde(default)]
    pub workflow: WorkflowSection,
    #[serde(default)]
    pub agents: HashMap<String, AgentTomlConfig>,
    #[serde(default)]
    pub providers: HashMap<String, ProviderTomlEntry>,
}

/// `[workflow]` section of `pipeline.toml`.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct WorkflowSection {
    /// Default workflow preset for this project.
    /// Accepted values: `"sdd"` (default), `"bmad"`, `"speckit"`, `"light"`, `"custom"`.
    pub preset: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PipelineSection {
    pub db_path: Option<String>,
    pub artifacts_dir: Option<String>,
    pub agents_dir: Option<String>,
    pub default_provider: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct AgentTomlConfig {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub timeout_secs: Option<u64>,
    pub sandbox: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct ProviderTomlEntry {
    /// Env var name holding the API key (e.g. `"ANTHROPIC_API_KEY"`).
    pub api_key_env: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    /// Optional fallback provider name.
    pub fallback: Option<String>,
}

impl PipelineTomlConfig {
    /// Load from `<root>/.koklo/pipeline.toml`. Returns defaults if the file is absent.
    pub fn load_from_project_root(root: &Path) -> Result<Self> {
        let path = root.join(".koklo").join("pipeline.toml");
        if !path.exists() {
            return Ok(Self::default());
        }
        let text = std::fs::read_to_string(&path)
            .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", path.display(), e))?;
        toml::from_str(&text)
            .map_err(|e| anyhow::anyhow!("Invalid pipeline.toml: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_toml() {
        let raw = r#"
[pipeline]
db_path = "test.db"
artifacts_dir = "docs/artifacts"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[providers.ollama]
base_url = "http://127.0.0.1:11434"

[agents.pm]
provider = "ollama"
model = "qwen2.5-coder:7b"
timeout_secs = 120
"#;
        let cfg: PipelineTomlConfig = toml::from_str(raw).unwrap();
        assert_eq!(cfg.pipeline.db_path.as_deref(), Some("test.db"));
        assert!(cfg.providers.contains_key("anthropic"));
        assert_eq!(
            cfg.providers["ollama"].base_url.as_deref(),
            Some("http://127.0.0.1:11434")
        );
        assert_eq!(cfg.agents["pm"].provider.as_deref(), Some("ollama"));
        assert_eq!(cfg.agents["pm"].timeout_secs, Some(120));
    }

    #[test]
    fn test_absent_file_returns_default() {
        let root = Path::new("/tmp/koklo_test_nonexistent_xyz_12345");
        let cfg = PipelineTomlConfig::load_from_project_root(root).unwrap();
        assert!(cfg.providers.is_empty());
        assert!(cfg.agents.is_empty());
    }

    #[test]
    fn test_invalid_toml_returns_error() {
        // Write a temp file with invalid TOML
        let dir = std::env::temp_dir().join("koklo_test_invalid_toml");
        let koklo_dir = dir.join(".koklo");
        std::fs::create_dir_all(&koklo_dir).ok();
        std::fs::write(koklo_dir.join("pipeline.toml"), "[[invalid = garbage").ok();
        let result = PipelineTomlConfig::load_from_project_root(&dir);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("pipeline.toml"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
