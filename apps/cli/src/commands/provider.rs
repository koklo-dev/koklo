use anyhow::Result;
use koklo_providers::registry::build_provider;
use koklo_providers::{
    has_secret, ClaudeCodeCliProvider, LlmProvider, PipelineTomlConfig, ProviderTomlEntry,
};
use std::sync::Arc;

use crate::{
    canonical_provider_name, find_project_root, home_dirs, load_writable_config,
    normalize_pipeline_config, provider_name_candidates, write_config,
};

pub(crate) async fn cmd_provider_list() -> Result<()> {
    let mut global = home_dirs::load_global_config();
    let project_root = find_project_root()?;
    let mut project = PipelineTomlConfig::load_from_project_root(&project_root)?;
    normalize_pipeline_config(&mut global);
    normalize_pipeline_config(&mut project);
    let merged = global.clone().merge(project.clone());

    if merged.providers.is_empty() {
        println!("No providers configured.");
        println!("Run `koklo provider add <name>` or edit $KOKLO_HOME/config.toml.");
        return Ok(());
    }

    let default_name = merged.pipeline.default_provider.as_deref();

    println!("{:<22} {:<30} {:<10} STATUS", "NAME", "MODEL", "SOURCE");
    println!("{}", "─".repeat(75));
    let mut names: Vec<&String> = merged.providers.keys().collect();
    names.sort();
    for name in names {
        let entry = &merged.providers[name];
        let source = if project.providers.contains_key(name) {
            "project"
        } else {
            "global"
        };
        let model = entry.model.as_deref().unwrap_or("-");
        let is_default = default_name == Some(name.as_str());
        let display_name = if is_default {
            format!("{} *", name)
        } else {
            name.clone()
        };
        let status = if let Some(key_env) = &entry.api_key_env {
            if has_secret(key_env) {
                "configured"
            } else {
                "missing key"
            }
        } else {
            "configured"
        };
        println!(
            "{:<22} {:<30} {:<10} {}",
            display_name, model, source, status
        );
    }
    if default_name.is_some() {
        println!();
        println!(
            "  * = default provider  |  global = $KOKLO_HOME/config.toml  |  project = .koklo/pipeline.toml"
        );
    }
    Ok(())
}

pub(crate) async fn cmd_provider_test(name: &str) -> Result<()> {
    let canonical_name = canonical_provider_name(name);
    let mut global = home_dirs::load_global_config();
    let project_root = find_project_root()?;
    let mut project = PipelineTomlConfig::load_from_project_root(&project_root)?;
    normalize_pipeline_config(&mut global);
    normalize_pipeline_config(&mut project);
    let merged = global.merge(project);
    let smoke_dir = if canonical_name == "claude-code" {
        Some(tempfile::tempdir()?)
    } else {
        None
    };
    let provider: Arc<dyn LlmProvider> = if let Some(dir) = &smoke_dir {
        Arc::new(ClaudeCodeCliProvider::with_working_dir(
            dir.path().to_path_buf(),
        )?)
    } else {
        let entry = merged
            .providers
            .get(canonical_name)
            .ok_or_else(|| anyhow::anyhow!("Provider '{}' is not configured.", canonical_name))?;
        let mut smoke_entry = entry.clone();
        if let Some(smoke_model) = &entry.smoke_model {
            smoke_entry.model = Some(smoke_model.clone());
        }
        build_provider(canonical_name, &smoke_entry)?
    };

    println!("Testing provider '{}'...", canonical_name);
    use koklo_providers::Message;
    let messages = vec![Message::user("Reply with exactly: OK".to_string())];
    match provider
        .complete_stream(messages, &mut |chunk| {
            if !chunk.text.is_empty() {
                print!("{}", chunk.text);
            }
        })
        .await
    {
        Ok(_) => {
            println!("\nProvider '{}': OK", canonical_name);
        }
        Err(error) => {
            eprintln!("\nProvider '{}' failed: {}", canonical_name, error);
        }
    }
    Ok(())
}

pub(crate) async fn cmd_provider_add(
    name: &str,
    model: Option<String>,
    key_env: Option<String>,
    base_url: Option<String>,
    project: bool,
) -> Result<()> {
    let canonical_name = canonical_provider_name(name);
    if let Some(key_env_name) = &key_env {
        if looks_like_api_key(key_env_name) {
            anyhow::bail!(
                "'{}' looks like an API key value, not an env var name.\n\
                 --key-env expects the NAME of the environment variable that holds the key.\n\
                 \n\
                 Usage:\n\
                 \n\
                   export OPENROUTER_API_KEY='{}'\n\
                   koklo provider add {} [--key-env OPENROUTER_API_KEY]\n\
                 \n\
                Or use a custom var name:\n\
                 \n\
                   export MY_KEY='{}'\n\
                   koklo provider add {} --key-env MY_KEY",
                key_env_name,
                key_env_name,
                canonical_name,
                key_env_name,
                canonical_name
            );
        }
    }

    let (default_key_env, default_model, default_smoke_model, default_base_url) =
        match canonical_name {
            "openrouter" => (
                Some("OPENROUTER_API_KEY"),
                Some("openai/gpt-4o"),
                Some("google/gemma-3-4b-it:free"),
                None,
            ),
            "ollama" => (None, Some("llama3.2"), None, Some("http://localhost:11434")),
            "claude-code" | "codex" => (None, None, None, None),
            _ => (None, None, None, None),
        };

    let entry = ProviderTomlEntry {
        api_key_env: key_env.or_else(|| default_key_env.map(String::from)),
        model: model.or_else(|| default_model.map(String::from)),
        smoke_model: default_smoke_model.map(String::from),
        base_url: base_url.or_else(|| default_base_url.map(String::from)),
        ..Default::default()
    };

    let (config_path, mut config) = load_writable_config(project)?;
    for candidate in provider_name_candidates(canonical_name) {
        config.providers.remove(candidate);
    }
    config.providers.insert(canonical_name.to_string(), entry);

    write_config(&config_path, &config)?;
    println!(
        "Added provider '{}' to {}",
        canonical_name,
        config_path.display()
    );
    Ok(())
}

pub(crate) async fn cmd_provider_remove(name: &str, project: bool) -> Result<()> {
    let canonical_name = canonical_provider_name(name);
    let (config_path, mut config) = load_writable_config(project)?;

    let mut removed = false;
    for candidate in provider_name_candidates(canonical_name) {
        removed |= config.providers.remove(candidate).is_some();
    }

    if !removed {
        println!("Provider '{}' not found in config.", canonical_name);
        return Ok(());
    }

    write_config(&config_path, &config)?;
    println!(
        "Removed provider '{}' from {}",
        canonical_name,
        config_path.display()
    );
    Ok(())
}

pub(crate) async fn cmd_provider_set_default(name: &str, project: bool) -> Result<()> {
    let canonical_name = canonical_provider_name(name);
    let (config_path, mut config) = load_writable_config(project)?;
    config.pipeline.default_provider = Some(canonical_name.to_string());
    write_config(&config_path, &config)?;
    println!(
        "Default provider set to '{}' in {}",
        canonical_name,
        config_path.display()
    );
    Ok(())
}

pub(crate) async fn cmd_provider_usage(name: Option<String>) -> Result<()> {
    let mut global = home_dirs::load_global_config();
    let project_root = find_project_root()?;
    let mut project = PipelineTomlConfig::load_from_project_root(&project_root)?;
    normalize_pipeline_config(&mut global);
    normalize_pipeline_config(&mut project);
    let merged = global.merge(project);

    if merged.providers.is_empty() {
        println!("No providers configured. Run `koklo provider add <name>`.");
        return Ok(());
    }

    let names_to_show: Vec<String> = if let Some(name) = name {
        vec![canonical_provider_name(&name).to_string()]
    } else {
        let mut keys: Vec<String> = merged.providers.keys().cloned().collect();
        keys.sort();
        keys
    };

    println!("{:<14} {:<16} {:<12} TIER", "PROVIDER", "USAGE", "LIMIT");
    println!("{}", "─".repeat(55));

    for provider_name in &names_to_show {
        if provider_name == "openrouter" {
            if let Some(entry) = merged.providers.get(provider_name) {
                let key_env = entry.api_key_env.as_deref().unwrap_or("OPENROUTER_API_KEY");
                if looks_like_api_key(key_env) {
                    println!(
                        "{:<14} misconfigured — api_key_env contains a key value, not a var name",
                        provider_name
                    );
                    println!("  Fix:  koklo provider remove openrouter");
                    println!("        export OPENROUTER_API_KEY='<your-key>'");
                    println!("        koklo provider add openrouter");
                    continue;
                }
                match std::env::var(key_env) {
                    Ok(api_key) => match fetch_openrouter_usage(&api_key).await {
                        Ok(info) => {
                            let usage = format!("${:.2}", info.usage);
                            let limit = info
                                .limit
                                .map(|value| format!("${:.2}", value))
                                .unwrap_or_else(|| "unlimited".to_string());
                            let tier = if info.is_free_tier { "free" } else { "paid" };
                            println!("{:<14} {:<16} {:<12} {}", provider_name, usage, limit, tier);
                        }
                        Err(error) => {
                            println!("{:<14} error: {}", provider_name, error);
                        }
                    },
                    Err(_) => {
                        println!("{:<14} env var {} is not set", provider_name, key_env);
                        println!("  Fix:  export {}='<your-key>'", key_env);
                    }
                }
            } else {
                println!("{:<14} not configured", provider_name);
            }
        } else {
            println!("{:<14} local — no usage data", provider_name);
        }
    }
    Ok(())
}

fn looks_like_api_key(s: &str) -> bool {
    let key_prefixes = ["sk-", "pk-", "ak-", "key-", "Bearer "];
    if key_prefixes.iter().any(|prefix| s.starts_with(prefix)) {
        return true;
    }
    s.chars().any(|ch| ch.is_lowercase())
}

struct OpenRouterKeyInfo {
    usage: f64,
    limit: Option<f64>,
    is_free_tier: bool,
}

async fn fetch_openrouter_usage(api_key: &str) -> Result<OpenRouterKeyInfo> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://openrouter.ai/api/v1/auth/key")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("OpenRouter request failed: {}", error))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| anyhow::anyhow!("OpenRouter response parse failed: {}", error))?;
    let data = &json["data"];

    Ok(OpenRouterKeyInfo {
        usage: data["usage"].as_f64().unwrap_or(0.0),
        limit: data["limit"].as_f64(),
        is_free_tier: data["is_free_tier"].as_bool().unwrap_or(true),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_api_key_like_values() {
        assert!(looks_like_api_key("sk-secret-value"));
        assert!(looks_like_api_key("Bearer token"));
        assert!(looks_like_api_key("abcDEF123"));
    }

    #[test]
    fn does_not_flag_env_var_names_as_api_keys() {
        assert!(!looks_like_api_key("OPENROUTER_API_KEY"));
        assert!(!looks_like_api_key("KOKLO_PROVIDER_TOKEN"));
    }
}
