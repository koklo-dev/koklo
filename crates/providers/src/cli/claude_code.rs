//! Claude Code CLI provider.
//!
//! Uses `claude --print --output-format stream-json --dangerously-skip-permissions`
//! to get structured NDJSON with tool events (ToolCall / ToolResult).

use super::{check_claude_session, flatten_messages_to_prompt, strip_ansi, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{LlmProvider, Message, StreamChunk, ToolEvent};
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{CompletionUsage, CostDisplay};
use koklo_shell::Sandbox;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

// ── Pricing ──────────────────────────────────────────────────────────────────

/// Pricing table for Claude models (USD per million tokens).
static CLAUDE_PRICING: &[(&str, f64, f64)] = &[
    ("claude-sonnet-4-6", 3.0, 15.0),
    ("claude-opus-4-6", 15.0, 75.0),
    ("claude-haiku-4-5", 0.25, 1.25),
    ("claude-haiku", 0.25, 1.25),
    ("claude-opus", 15.0, 75.0),
    ("claude-sonnet", 3.0, 15.0),
];

fn estimate_usage_from_text(text: &str, prompt_len: usize) -> CompletionUsage {
    CompletionUsage {
        prompt_tokens: (prompt_len / 4) as u32,
        completion_tokens: (text.len() / 4) as u32,
    }
}

fn claude_cost_display(usage: &CompletionUsage) -> Option<CostDisplay> {
    if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        let model =
            std::env::var("KOKLO_CLAUDE_MODEL").unwrap_or_else(|_| "claude-sonnet-4-6".to_string());
        for (prefix, input, output) in CLAUDE_PRICING {
            if model.starts_with(prefix) {
                let cost = (usage.prompt_tokens as f64 * input
                    + usage.completion_tokens as f64 * output)
                    / 1_000_000.0;
                return Some(CostDisplay::Usd(cost));
            }
        }
        None
    } else {
        Some(CostDisplay::Subscription)
    }
}

// ── Provider struct ───────────────────────────────────────────────────────────

pub struct ClaudeCodeCliProvider {
    #[allow(dead_code)]
    mode: CliMode,
    working_dir: Option<std::path::PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
}

impl ClaudeCodeCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: None,
            sandbox: None,
        })
    }

    pub fn with_working_dir(working_dir: std::path::PathBuf) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: None,
        })
    }

    pub fn with_context(
        working_dir: std::path::PathBuf,
        sandbox: Arc<dyn Sandbox>,
    ) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: Some(sandbox),
        })
    }

    fn validate_install() -> Result<(), ProviderError> {
        which::which("claude").map_err(|_| ProviderError::CliNotInstalled {
            name: "claude".to_string(),
            install_hint: "Install from: https://claude.ai/download or `npm install -g @anthropic-ai/claude-code`".to_string(),
        })?;
        Ok(())
    }

    // ── Layer A: stream-json subprocess ──────────────────────────────────────

    async fn run_stream_json(
        &self,
        prompt: &str,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)> {
        let args = vec![
            "--print".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--dangerously-skip-permissions".to_string(),
            prompt.to_string(),
        ];

        let mut command = tokio::process::Command::new("claude");
        command
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = &self.working_dir {
            command.current_dir(dir);
        }

        let mut child = command.spawn().map_err(ProviderError::Io)?;
        let stdout = child.stdout.take().expect("stdout is piped");
        let stderr = child.stderr.take().expect("stderr is piped");

        let stderr_handle = tokio::spawn(async move {
            let mut buf = String::new();
            BufReader::new(stderr).read_to_string(&mut buf).await.ok();
            buf
        });

        // Track tool_use_id → tool_name for ToolResult events.
        let mut tool_name_registry: HashMap<String, String> = HashMap::new();

        let mut lines = BufReader::new(stdout).lines();
        let mut full_text = String::new();
        let mut final_usage: Option<CompletionUsage> = None;

        while let Some(line) = lines.next_line().await.map_err(ProviderError::Io)? {
            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.starts_with('{') {
                continue;
            }
            for event in parse_stream_json_line(trimmed, &mut tool_name_registry) {
                match event {
                    StreamJsonEvent::Text(t) => {
                        let chunk = format!("{}\n", t);
                        on_chunk(StreamChunk {
                            text: chunk.clone(),
                            finished: false,
                            tool_event: None,
                        });
                        full_text.push_str(&chunk);
                    }
                    StreamJsonEvent::ToolCall {
                        name,
                        input_summary,
                    } => {
                        on_chunk(StreamChunk {
                            text: String::new(),
                            finished: false,
                            tool_event: Some(ToolEvent::Call {
                                tool_name: name,
                                input_summary,
                            }),
                        });
                    }
                    StreamJsonEvent::ToolResult { tool_name, summary } => {
                        on_chunk(StreamChunk {
                            text: String::new(),
                            finished: false,
                            tool_event: Some(ToolEvent::Result {
                                tool_name,
                                output_summary: summary,
                            }),
                        });
                    }
                    StreamJsonEvent::Usage {
                        input_tokens,
                        output_tokens,
                        ..
                    } => {
                        final_usage = Some(CompletionUsage {
                            prompt_tokens: input_tokens,
                            completion_tokens: output_tokens,
                        });
                    }
                    StreamJsonEvent::Other => {}
                }
            }
        }

        let status = child.wait().await.map_err(ProviderError::Io)?;
        let stderr_content = stderr_handle.await.unwrap_or_default();

        let combined = format!("{}{}", full_text, stderr_content);
        if check_claude_session(&combined) {
            return Err(ProviderError::CliSessionExpired {
                auth_command: "claude auth login".to_string(),
            }
            .into());
        }

        if !status.success() {
            return Err(ProviderError::HttpError {
                status: status.code().unwrap_or(1) as u16,
                body: stderr_content,
            }
            .into());
        }

        if full_text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }

        on_chunk(StreamChunk {
            text: String::new(),
            finished: true,
            tool_event: None,
        });

        let usage =
            final_usage.unwrap_or_else(|| estimate_usage_from_text(&full_text, prompt.len()));
        Ok((full_text, usage))
    }
}

// ── LlmProvider impl ─────────────────────────────────────────────────────────

#[async_trait]
impl LlmProvider for ClaudeCodeCliProvider {
    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)> {
        let prompt = flatten_messages_to_prompt(&messages);

        // ── Sandboxed path (unchanged) ────────────────────────────────────────
        if let (Some(sandbox), Some(dir)) = (&self.sandbox, &self.working_dir) {
            let args = vec![
                "--print".to_string(),
                "--dangerously-skip-permissions".to_string(),
                prompt.clone(),
            ];
            let output = super::run_sandboxed_command(sandbox, dir, "claude", &args).await?;
            let combined = format!("{}{}", output.stdout, output.stderr);
            if check_claude_session(&combined) {
                return Err(ProviderError::CliSessionExpired {
                    auth_command: "claude auth login".to_string(),
                }
                .into());
            }
            if output.exit_code != 0 {
                return Err(ProviderError::HttpError {
                    status: output.exit_code.max(1) as u16,
                    body: output.stderr,
                }
                .into());
            }
            let text = strip_ansi(&output.stdout);
            if text.trim().is_empty() {
                return Err(ProviderError::EmptyResponse.into());
            }
            on_chunk(StreamChunk {
                text: text.clone(),
                finished: false,
                tool_event: None,
            });
            on_chunk(StreamChunk {
                text: String::new(),
                finished: true,
                tool_event: None,
            });
            let usage = estimate_usage_from_text(&text, prompt.len());
            return Ok((text, usage));
        }

        // ── stream-json subprocess ──────────────────────────────────────────
        self.run_stream_json(&prompt, on_chunk).await
    }

    fn compute_cost(&self, usage: &CompletionUsage) -> Option<CostDisplay> {
        claude_cost_display(usage)
    }

    fn provider_name(&self) -> &str {
        "claude-code-cli"
    }
}

// ── stream-json parsing ───────────────────────────────────────────────────────

enum StreamJsonEvent {
    Text(String),
    ToolCall {
        name: String,
        input_summary: String,
    },
    ToolResult {
        tool_name: String,
        summary: String,
    },
    Usage {
        input_tokens: u32,
        output_tokens: u32,
        #[allow(dead_code)]
        cost_usd: Option<f64>,
    },
    #[allow(dead_code)]
    Other,
}

/// Parse one NDJSON line from `--output-format stream-json`.
///
/// Returns zero or more events (a single assistant content block can contain
/// both text items and tool_use items).
fn parse_stream_json_line(
    line: &str,
    tool_name_registry: &mut HashMap<String, String>,
) -> Vec<StreamJsonEvent> {
    let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
        return vec![];
    };

    match val["type"].as_str().unwrap_or("") {
        "assistant" => {
            let Some(content) = val["message"]["content"].as_array() else {
                return vec![];
            };
            let mut events = Vec::new();
            let mut text_buf = String::new();
            for item in content {
                match item["type"].as_str().unwrap_or("") {
                    "text" => {
                        if let Some(t) = item["text"].as_str() {
                            text_buf.push_str(t);
                        }
                    }
                    "tool_use" => {
                        // Flush any accumulated text first.
                        if !text_buf.is_empty() {
                            events.push(StreamJsonEvent::Text(std::mem::take(&mut text_buf)));
                        }
                        let name = item["name"].as_str().unwrap_or("tool").to_string();
                        let id = item["id"].as_str().unwrap_or("").to_string();
                        // Register id → name for matching tool results later.
                        if !id.is_empty() {
                            tool_name_registry.insert(id, name.clone());
                        }
                        let input_summary = extract_input_summary(&item["input"], &name);
                        events.push(StreamJsonEvent::ToolCall {
                            name,
                            input_summary,
                        });
                    }
                    _ => {}
                }
            }
            if !text_buf.is_empty() {
                events.push(StreamJsonEvent::Text(text_buf));
            }
            events
        }
        // Claude Code uses "tool" or "tool_result" depending on version.
        "tool" | "tool_result" => {
            let tool_use_id = val["tool_use_id"].as_str().unwrap_or("").to_string();
            let tool_name = tool_name_registry
                .get(&tool_use_id)
                .cloned()
                .unwrap_or_else(|| "tool".to_string());
            let summary = val["content"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|item| item["text"].as_str())
                .and_then(|t| t.lines().next())
                .unwrap_or("ok")
                .to_string();
            vec![StreamJsonEvent::ToolResult { tool_name, summary }]
        }
        "result" => {
            let input_tokens = val["usage"]["input_tokens"].as_u64().unwrap_or(0) as u32;
            let output_tokens = val["usage"]["output_tokens"].as_u64().unwrap_or(0) as u32;
            let cost_usd = val["total_cost_usd"].as_f64();
            vec![StreamJsonEvent::Usage {
                input_tokens,
                output_tokens,
                cost_usd,
            }]
        }
        _ => vec![],
    }
}

/// Extract a short (≤60 char) summary from a tool's input JSON.
fn extract_input_summary(input: &serde_json::Value, tool_name: &str) -> String {
    let raw = match tool_name {
        "Write" | "Edit" | "Read" | "MultiEdit" | "NotebookEdit" => {
            input["file_path"].as_str().unwrap_or("").to_string()
        }
        "Bash" => input["command"].as_str().unwrap_or("").to_string(),
        "Glob" | "Grep" => input["pattern"].as_str().unwrap_or("").to_string(),
        _ => input["path"]
            .as_str()
            .or_else(|| input["file_path"].as_str())
            .or_else(|| input["query"].as_str())
            .unwrap_or("")
            .to_string(),
    };
    if raw.chars().count() > 60 {
        let truncated: String = raw.chars().take(59).collect();
        format!("{}…", truncated)
    } else {
        raw
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_extract_input_summary_write() {
        let input = serde_json::json!({"file_path": "src/main.rs", "content": "..."});
        assert_eq!(extract_input_summary(&input, "Write"), "src/main.rs");
    }

    #[test]
    fn test_extract_input_summary_bash() {
        let input = serde_json::json!({"command": "cargo test"});
        assert_eq!(extract_input_summary(&input, "Bash"), "cargo test");
    }

    #[test]
    fn test_extract_input_summary_truncates() {
        let long_path = "a".repeat(80);
        let input = serde_json::json!({"file_path": long_path});
        let summary = extract_input_summary(&input, "Write");
        // 59 chars + '…' (1 char) = 60 chars total
        assert!(summary.chars().count() <= 60);
        assert!(summary.ends_with('…'));
    }

    #[test]
    fn test_parse_assistant_text() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamJsonEvent::Text(t) if t == "Hello"));
    }

    #[test]
    fn test_parse_tool_use() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"abc","name":"Write","input":{"file_path":"src/lib.rs"}}]}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 1);
        assert!(
            matches!(&events[0], StreamJsonEvent::ToolCall { name, input_summary }
                if name == "Write" && input_summary == "src/lib.rs")
        );
        assert_eq!(reg.get("abc").unwrap(), "Write");
    }

    #[test]
    fn test_parse_tool_result() {
        let line = r#"{"type":"tool_result","tool_use_id":"abc","content":[{"type":"text","text":"ok\nsome detail"}]}"#;
        let mut reg = HashMap::new();
        reg.insert("abc".to_string(), "Write".to_string());
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 1);
        assert!(
            matches!(&events[0], StreamJsonEvent::ToolResult { tool_name, summary }
                if tool_name == "Write" && summary == "ok")
        );
    }

    #[test]
    fn test_parse_usage() {
        let line = r#"{"type":"result","usage":{"input_tokens":100,"output_tokens":50},"total_cost_usd":0.001}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 1);
        assert!(matches!(
            &events[0],
            StreamJsonEvent::Usage {
                input_tokens: 100,
                output_tokens: 50,
                ..
            }
        ));
    }

    #[test]
    fn test_parse_mixed_content_block() {
        // Text then tool_use in same content array.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Here is the file:"},{"type":"tool_use","id":"x","name":"Read","input":{"file_path":"Cargo.toml"}}]}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 2);
        assert!(matches!(&events[0], StreamJsonEvent::Text(t) if t == "Here is the file:"));
        assert!(matches!(&events[1], StreamJsonEvent::ToolCall { name, .. } if name == "Read"));
    }
}
