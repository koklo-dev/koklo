use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Default, Deserialize)]
struct SecretsToml {
    #[serde(default)]
    env: HashMap<String, String>,
}

pub fn resolve_secret(var_name: &str) -> Option<String> {
    std::env::var(var_name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| load_secrets_map().remove(var_name))
}

pub fn has_secret(var_name: &str) -> bool {
    resolve_secret(var_name).is_some()
}

pub fn load_secrets_into_env() {
    for (key, value) in load_secrets_map() {
        if std::env::var_os(&key).is_none() {
            std::env::set_var(key, value);
        }
    }
}

pub fn secrets_path() -> PathBuf {
    if let Ok(path) = std::env::var("KOKLO_SECRETS_FILE") {
        return PathBuf::from(path);
    }

    if let Ok(home) = std::env::var("KOKLO_HOME") {
        return PathBuf::from(home).join("secrets.toml");
    }

    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".koklo")
        .join("secrets.toml")
}

fn load_secrets_map() -> HashMap<String, String> {
    let path = secrets_path();
    if !path.exists() {
        return HashMap::new();
    }

    let Ok(text) = std::fs::read_to_string(&path) else {
        tracing::warn!("Failed to read secrets file {}", path.display());
        return HashMap::new();
    };

    match toml::from_str::<SecretsToml>(&text) {
        Ok(secrets) => secrets.env,
        Err(err) => {
            tracing::warn!("Invalid secrets file {}: {}", path.display(), err);
            HashMap::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct EnvGuard {
        key: &'static str,
        previous: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: impl Into<String>) -> Self {
            let previous = std::env::var(key).ok();
            std::env::set_var(key, value.into());
            Self { key, previous }
        }

        fn unset(key: &'static str) -> Self {
            let previous = std::env::var(key).ok();
            std::env::remove_var(key);
            Self { key, previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            if let Some(ref previous) = self.previous {
                std::env::set_var(self.key, previous);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    #[test]
    fn test_resolve_secret_prefers_environment() {
        let _secret_path = EnvGuard::unset("KOKLO_SECRETS_FILE");
        let _secret = EnvGuard::set("KOKLO_TEST_SECRET_ENV", "from-env");

        assert_eq!(
            resolve_secret("KOKLO_TEST_SECRET_ENV"),
            Some("from-env".to_string())
        );
    }

    #[test]
    fn test_resolve_secret_falls_back_to_secrets_file() {
        let dir = tempfile::tempdir().unwrap();
        let secrets = dir.path().join("secrets.toml");
        std::fs::write(&secrets, "[env]\nKOKLO_TEST_SECRET_FILE = \"from-file\"\n").unwrap();

        let _secret_path = EnvGuard::set("KOKLO_SECRETS_FILE", secrets.display().to_string());
        let _secret = EnvGuard::unset("KOKLO_TEST_SECRET_FILE");

        assert_eq!(
            resolve_secret("KOKLO_TEST_SECRET_FILE"),
            Some("from-file".to_string())
        );
    }

    #[test]
    fn test_load_secrets_into_env_sets_missing_values_only() {
        let dir = tempfile::tempdir().unwrap();
        let secrets = dir.path().join("secrets.toml");
        std::fs::write(
            &secrets,
            "[env]\nKOKLO_TEST_SECRET_ONE = \"one\"\nKOKLO_TEST_SECRET_TWO = \"two\"\n",
        )
        .unwrap();

        let _secret_path = EnvGuard::set("KOKLO_SECRETS_FILE", secrets.display().to_string());
        let _one = EnvGuard::unset("KOKLO_TEST_SECRET_ONE");
        let _two = EnvGuard::set("KOKLO_TEST_SECRET_TWO", "from-env");

        load_secrets_into_env();

        assert_eq!(std::env::var("KOKLO_TEST_SECRET_ONE").unwrap(), "one");
        assert_eq!(std::env::var("KOKLO_TEST_SECRET_TWO").unwrap(), "from-env");
    }

    #[test]
    fn test_secrets_path_uses_koklo_home_when_set() {
        let dir = tempfile::tempdir().unwrap();
        let _home = EnvGuard::set("KOKLO_HOME", dir.path().display().to_string());
        let _secret_path = EnvGuard::unset("KOKLO_SECRETS_FILE");

        assert_eq!(secrets_path(), dir.path().join("secrets.toml"));
    }
}
