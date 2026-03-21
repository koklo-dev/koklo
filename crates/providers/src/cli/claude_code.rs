//! Claude Code CLI provider.
//!
//! Uses `claude --print --output-format stream-json` to get structured NDJSON
//! with tool events, and optionally bridges native permission prompts back into
//! the Koklo runtime via `--permission-prompt-tool`.

use super::{check_claude_session, flatten_messages_to_prompt, strip_ansi, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{
    LlmProvider, Message, ProviderApprovalDecision, ProviderApprovalKind,
    ProviderApprovalPayload, ProviderCapabilities, ProviderEvent, ProviderInteractionMode,
    ProviderSession, ProviderSessionEvent, StreamChunk, UserInputPayload,
};
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{CompletionUsage, CostDisplay, UserInputQuestion};
use koklo_shell::Sandbox;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{sleep, Duration};

const CLAUDE_PERMISSION_TOOL_NAME: &str = "koklo_permission_prompt";

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
    working_dir: Option<PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
    supports_permission_prompt_tool: bool,
}

impl ClaudeCodeCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: None,
            sandbox: None,
            supports_permission_prompt_tool: detect_permission_prompt_tool_support(),
        })
    }

    pub fn with_working_dir(working_dir: PathBuf) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: None,
            supports_permission_prompt_tool: detect_permission_prompt_tool_support(),
        })
    }

    pub fn with_context(
        working_dir: PathBuf,
        sandbox: Arc<dyn Sandbox>,
    ) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: Some(sandbox),
            supports_permission_prompt_tool: detect_permission_prompt_tool_support(),
        })
    }

    fn validate_install() -> Result<(), ProviderError> {
        which::which("claude").map_err(|_| ProviderError::CliNotInstalled {
            name: "claude".to_string(),
            install_hint: "Install from: https://claude.ai/download or `npm install -g @anthropic-ai/claude-code`".to_string(),
        })?;
        Ok(())
    }

    fn build_stream_json_args(permission_bridge: Option<&ClaudePermissionBridge>) -> Vec<String> {
        let mut args = vec![
            "--print".to_string(),
            "--verbose".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--input-format".to_string(),
            "stream-json".to_string(),
            "--replay-user-messages".to_string(),
        ];

        if let Some(bridge) = permission_bridge {
            args.push("--strict-mcp-config".to_string());
            args.push("--mcp-config".to_string());
            args.push(bridge.mcp_config_json.clone());
            args.push("--permission-prompt-tool".to_string());
            args.push(CLAUDE_PERMISSION_TOOL_NAME.to_string());
        } else {
            args.push("--dangerously-skip-permissions".to_string());
        }

        args
    }

    fn supports_native_approvals(&self) -> bool {
        self.sandbox.is_none() && self.supports_permission_prompt_tool
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
        let mut has_streamed_deltas = false;

        while let Some(line) = lines.next_line().await.map_err(ProviderError::Io)? {
            let trimmed = line.trim();
            if trimmed.is_empty() || !trimmed.starts_with('{') {
                continue;
            }
            for event in parse_stream_json_line(trimmed, &mut tool_name_registry) {
                match event {
                    StreamJsonEvent::TextDelta(t) => {
                        has_streamed_deltas = true;
                        on_chunk(StreamChunk::text(t.clone()));
                        full_text.push_str(&t);
                    }
                    StreamJsonEvent::Text(t) => {
                        // Skip final block text if we already streamed deltas.
                        if !has_streamed_deltas {
                            let chunk = format!("{}\n", t);
                            on_chunk(StreamChunk::text(chunk.clone()));
                            full_text.push_str(&chunk);
                        }
                    }
                    StreamJsonEvent::ToolCall {
                        id,
                        name,
                        input_summary,
                        input: _,
                    } => {
                        on_chunk(StreamChunk::event(ProviderEvent::ToolCall {
                            item_id: id,
                            tool_name: name,
                            input_summary,
                        }));
                    }
                    StreamJsonEvent::ToolResult {
                        id,
                        tool_name,
                        summary,
                    } => {
                        on_chunk(StreamChunk::event(ProviderEvent::ToolResult {
                            item_id: id,
                            tool_name,
                            output_summary: summary,
                            success: None,
                        }));
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

        on_chunk(StreamChunk::finished());

        let usage =
            final_usage.unwrap_or_else(|| estimate_usage_from_text(&full_text, prompt.len()));
        Ok((full_text, usage))
    }

    async fn spawn_stream_json_session(
        &self,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        let permission_bridge = if self.supports_native_approvals() {
            Some(ClaudePermissionBridge::new()?)
        } else {
            None
        };
        let mut command = tokio::process::Command::new("claude");
        command
            .args(Self::build_stream_json_args(permission_bridge.as_ref()))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = &self.working_dir {
            command.current_dir(dir);
        }

        let mut child = command.spawn().map_err(ProviderError::Io)?;
        let stdin = child.stdin.take().expect("stdin is piped");
        let stdout = child.stdout.take().expect("stdout is piped");
        let stderr = child.stderr.take().expect("stderr is piped");
        let child = Arc::new(Mutex::new(child));

        let stderr_handle = tokio::spawn(async move {
            let mut buf = String::new();
            BufReader::new(stderr).read_to_string(&mut buf).await.ok();
            buf
        });

        let (sender, receiver) = mpsc::unbounded_channel::<Result<ProviderSessionEvent>>();
        let pending_approvals = Arc::new(Mutex::new(HashSet::<String>::new()));
        let permission_tool_name = permission_bridge
            .as_ref()
            .map(|bridge| bridge.tool_name.clone());
        if let Some(bridge) = permission_bridge.as_ref() {
            tokio::spawn(run_claude_permission_bridge_poller(
                bridge.requests_dir(),
                Arc::clone(&pending_approvals),
                sender.clone(),
            ));
        }
        tokio::spawn(async move {
            let mut tool_name_registry: HashMap<String, String> = HashMap::new();
            let mut lines = BufReader::new(stdout).lines();
            let mut turn_output = String::new();
            let mut has_streamed_deltas = false;

            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() || !trimmed.starts_with('{') {
                            continue;
                        }
                        for event in parse_stream_json_line(trimmed, &mut tool_name_registry) {
                            match event {
                                StreamJsonEvent::TextDelta(text) => {
                                    has_streamed_deltas = true;
                                    turn_output.push_str(&text);
                                    let _ = sender.send(Ok(ProviderSessionEvent::Event(
                                        ProviderEvent::MessageDelta { text },
                                    )));
                                }
                                StreamJsonEvent::Text(text) => {
                                    // Skip final block text if already streamed via deltas.
                                    if !has_streamed_deltas {
                                        let chunk = format!("{}\n", text);
                                        turn_output.push_str(&chunk);
                                        let _ = sender.send(Ok(ProviderSessionEvent::Event(
                                            ProviderEvent::MessageDelta { text: chunk },
                                        )));
                                    }
                                }
                                StreamJsonEvent::ToolCall {
                                    id,
                                    name,
                                    input_summary,
                                    input,
                                } => {
                                    if permission_tool_name.as_deref() == Some(name.as_str()) {
                                        continue;
                                    }
                                    if let Some(questions) =
                                        parse_claude_user_input_questions(&name, &input)
                                    {
                                        let _ = sender.send(Ok(ProviderSessionEvent::Event(
                                            ProviderEvent::UserInputRequest {
                                                item_id: Some(id.unwrap_or_else(|| {
                                                    format!("claude-user-{}", name)
                                                })),
                                                questions,
                                            },
                                        )));
                                    } else {
                                        let _ = sender.send(Ok(ProviderSessionEvent::Event(
                                            ProviderEvent::ToolCall {
                                                item_id: id,
                                                tool_name: name,
                                                input_summary,
                                            },
                                        )));
                                    }
                                }
                                StreamJsonEvent::ToolResult {
                                    id,
                                    tool_name,
                                    summary,
                                } => {
                                    if permission_tool_name.as_deref() == Some(tool_name.as_str()) {
                                        continue;
                                    }
                                    let _ = sender.send(Ok(ProviderSessionEvent::Event(
                                        ProviderEvent::ToolResult {
                                            item_id: id,
                                            tool_name,
                                            output_summary: summary,
                                            success: None,
                                        },
                                    )));
                                }
                                StreamJsonEvent::Usage {
                                    input_tokens,
                                    output_tokens,
                                    ..
                                } => {
                                    let usage = CompletionUsage {
                                        prompt_tokens: input_tokens,
                                        completion_tokens: output_tokens,
                                    };
                                    let output = std::mem::take(&mut turn_output);
                                    let _ = sender
                                        .send(Ok(ProviderSessionEvent::Finished { output, usage }));
                                }
                                StreamJsonEvent::Other => {}
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = sender.send(Err(ProviderError::Io(error).into()));
                        return;
                    }
                }
            }

            let stderr_content = stderr_handle.await.unwrap_or_default();
            if check_claude_session(&stderr_content) {
                let _ = sender.send(Err(ProviderError::CliSessionExpired {
                    auth_command: "claude auth login".to_string(),
                }
                .into()));
            } else if !stderr_content.trim().is_empty() {
                let _ = sender.send(Err(ProviderError::HttpError {
                    status: 1,
                    body: stderr_content,
                }
                .into()));
            }
        });

        let session = ClaudeStreamJsonSession {
            stdin: Mutex::new(stdin),
            child,
            receiver,
            pending_approvals,
            permission_bridge,
        };
        session
            .send_user_message(flatten_messages_to_prompt(&messages))
            .await?;
        Ok(Box::new(session))
    }
}

struct ClaudePermissionBridge {
    tempdir: TempDir,
    tool_name: String,
    mcp_config_json: String,
}

impl ClaudePermissionBridge {
    fn new() -> Result<Self> {
        let tempdir = tempfile::tempdir()?;
        std::fs::create_dir_all(tempdir.path().join("requests"))?;
        std::fs::create_dir_all(tempdir.path().join("responses"))?;

        let command = env::current_exe()
            .ok()
            .and_then(|path| path.into_os_string().into_string().ok())
            .unwrap_or_else(|| "koklo".to_string());
        let bridge_dir = tempdir.path().display().to_string();
        let mcp_config_json = serde_json::json!({
            "mcpServers": {
                "koklo-permission-bridge": {
                    "command": command,
                    "args": [
                        "internal",
                        "claude-permission-bridge",
                        "--bridge-dir",
                        bridge_dir
                    ],
                    "env": {}
                }
            }
        })
        .to_string();

        Ok(Self {
            tempdir,
            tool_name: CLAUDE_PERMISSION_TOOL_NAME.to_string(),
            mcp_config_json,
        })
    }

    fn requests_dir(&self) -> PathBuf {
        self.tempdir.path().join("requests")
    }

    fn responses_dir(&self) -> PathBuf {
        self.tempdir.path().join("responses")
    }
}

#[derive(Debug, Deserialize)]
struct ClaudeApprovalRequestFile {
    request_id: String,
    kind: String,
    description: String,
    details: serde_json::Value,
}

async fn run_claude_permission_bridge_poller(
    requests_dir: PathBuf,
    pending_approvals: Arc<Mutex<HashSet<String>>>,
    sender: mpsc::UnboundedSender<Result<ProviderSessionEvent>>,
) {
    let mut seen = HashSet::new();
    loop {
        let Ok(entries) = std::fs::read_dir(&requests_dir) else {
            break;
        };

        let mut paths = entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
            .collect::<Vec<_>>();
        paths.sort();

        for path in paths {
            if !seen.insert(path.clone()) {
                continue;
            }

            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            let Ok(request) = serde_json::from_slice::<ClaudeApprovalRequestFile>(&bytes) else {
                continue;
            };
            pending_approvals
                .lock()
                .await
                .insert(request.request_id.clone());
            let _ = sender.send(Ok(ProviderSessionEvent::Event(
                ProviderEvent::ApprovalRequest {
                    item_id: None,
                    request_id: request.request_id,
                    kind: parse_claude_approval_kind(&request.kind),
                    description: request.description,
                    details: request.details,
                },
            )));
        }

        sleep(Duration::from_millis(100)).await;
    }
}

fn parse_claude_approval_kind(kind: &str) -> ProviderApprovalKind {
    match kind {
        "command_execution" => ProviderApprovalKind::CommandExecution,
        "file_change" => ProviderApprovalKind::FileChange,
        _ => ProviderApprovalKind::Permissions,
    }
}

fn detect_permission_prompt_tool_support() -> bool {
    let Ok(output) = std::process::Command::new("claude")
        .args([
            "--permission-prompt-tool",
            CLAUDE_PERMISSION_TOOL_NAME,
            "--help",
        ])
        .output()
    else {
        return false;
    };

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    output.status.success()
        && !stderr.contains("unknown option")
        && !stderr.contains("Unknown option")
        && !stdout.contains("Unknown option")
}

struct ClaudeStreamJsonSession {
    stdin: Mutex<ChildStdin>,
    child: Arc<Mutex<Child>>,
    receiver: mpsc::UnboundedReceiver<Result<ProviderSessionEvent>>,
    pending_approvals: Arc<Mutex<HashSet<String>>>,
    permission_bridge: Option<ClaudePermissionBridge>,
}

impl ClaudeStreamJsonSession {
    async fn send_user_message(&self, text: String) -> Result<()> {
        let line = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": text,
                    }
                ]
            }
        })
        .to_string();

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(ProviderError::Io)?;
        stdin.write_all(b"\n").await.map_err(ProviderError::Io)?;
        stdin.flush().await.map_err(ProviderError::Io)?;
        Ok(())
    }
}

#[async_trait]
impl ProviderSession for ClaudeStreamJsonSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        match self.receiver.recv().await {
            Some(result) => result,
            None => anyhow::bail!("claude stream-json session ended unexpectedly"),
        }
    }

    async fn send_user_input(&mut self, input: UserInputPayload) -> Result<()> {
        let message = input.answers.join("\n");
        self.send_user_message(message).await
    }

    async fn resolve_approval(&mut self, approval: ProviderApprovalPayload) -> Result<()> {
        let Some(request_id) = approval.request_id else {
            anyhow::bail!("missing Claude approval request id")
        };
        let Some(bridge) = self.permission_bridge.as_ref() else {
            anyhow::bail!("Claude session does not have a permission bridge")
        };

        let mut pending = self.pending_approvals.lock().await;
        if !pending.remove(&request_id) {
            anyhow::bail!("unknown Claude approval request id: {}", request_id);
        }
        drop(pending);

        let decision = match approval.decision {
            ProviderApprovalDecision::Approve => "approve",
            ProviderApprovalDecision::Reject => "reject",
            ProviderApprovalDecision::Edit { .. } => "reject",
        };
        let response_path = bridge.responses_dir().join(format!("{request_id}.json"));
        std::fs::write(
            response_path,
            serde_json::to_vec_pretty(&serde_json::json!({ "decision": decision }))?,
        )?;
        Ok(())
    }

    async fn cancel(&mut self) -> Result<()> {
        self.child
            .lock()
            .await
            .kill()
            .await
            .map_err(ProviderError::Io)?;
        Ok(())
    }
}

// ── LlmProvider impl ─────────────────────────────────────────────────────────

#[async_trait]
impl LlmProvider for ClaudeCodeCliProvider {
    async fn start_session(
        self: Arc<Self>,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        // Always use the stream-json session for real-time streaming.
        // The sandbox is only used as a fallback in complete_stream (exec mode).
        self.spawn_stream_json_session(messages).await
    }

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
            on_chunk(StreamChunk::text(text.clone()));
            on_chunk(StreamChunk::finished());
            let usage = estimate_usage_from_text(&text, prompt.len());
            return Ok((text, usage));
        }

        // ── stream-json subprocess ──────────────────────────────────────────
        self.run_stream_json(&prompt, on_chunk).await
    }

    fn compute_cost(&self, usage: &CompletionUsage) -> Option<CostDisplay> {
        claude_cost_display(usage)
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming_text: true,
            usage_native: true,
            tool_calls_native: true,
            approvals_native: self.supports_native_approvals(),
            user_input_native: true,
            reasoning_visible: false,
            interaction_mode: if self.supports_native_approvals() {
                ProviderInteractionMode::Native
            } else {
                ProviderInteractionMode::Normalized
            },
        }
    }

    fn provider_name(&self) -> &str {
        "claude-code-cli"
    }
}

// ── stream-json parsing ───────────────────────────────────────────────────────

enum StreamJsonEvent {
    /// Complete text from a final "assistant" block (end-of-turn).
    Text(String),
    /// Incremental text from a `content_block_delta` (streaming token).
    TextDelta(String),
    ToolCall {
        id: Option<String>,
        name: String,
        input_summary: String,
        input: serde_json::Value,
    },
    ToolResult {
        id: Option<String>,
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

    // Claude Code stream-json wraps API events in {"type":"stream_event","event":{...}}.
    // Unwrap the envelope if present; otherwise use the top-level value directly.
    let val = if val["type"].as_str() == Some("stream_event") {
        if let Some(inner) = val.get("event") {
            inner
        } else {
            return vec![];
        }
    } else {
        &val
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
                        let id = item["id"].as_str().map(str::to_string);
                        // Register id → name for matching tool results later.
                        if let Some(tool_use_id) = &id {
                            tool_name_registry.insert(tool_use_id.clone(), name.clone());
                        }
                        let input = item["input"].clone();
                        let input_summary = extract_input_summary(&input, &name);
                        events.push(StreamJsonEvent::ToolCall {
                            id,
                            name,
                            input_summary,
                            input,
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
        // Streaming content deltas — emitted during generation before the final
        // "assistant" block.  Handling these gives the TUI live text updates.
        "content_block_delta" => {
            match val["delta"]["type"].as_str().unwrap_or("") {
                "text_delta" => {
                    if let Some(t) = val["delta"]["text"].as_str() {
                        if !t.is_empty() {
                            return vec![StreamJsonEvent::TextDelta(t.to_string())];
                        }
                    }
                }
                _ => {}
            }
            vec![]
        }
        "content_block_start" => {
            // tool_use blocks arrive here; register the id→name mapping early.
            if val["content_block"]["type"].as_str() == Some("tool_use") {
                let name = val["content_block"]["name"]
                    .as_str()
                    .unwrap_or("tool")
                    .to_string();
                if let Some(id) = val["content_block"]["id"].as_str() {
                    tool_name_registry.insert(id.to_string(), name);
                }
            }
            vec![]
        }
        // message_delta carries usage info at end of message
        "message_delta" => {
            if let Some(usage) = val.get("usage") {
                let input_tokens = usage["input_tokens"].as_u64().unwrap_or(0) as u32;
                let output_tokens = usage["output_tokens"].as_u64().unwrap_or(0) as u32;
                return vec![StreamJsonEvent::Usage {
                    input_tokens,
                    output_tokens,
                    cost_usd: None,
                }];
            }
            vec![]
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
            vec![StreamJsonEvent::ToolResult {
                id: (!tool_use_id.is_empty()).then_some(tool_use_id),
                tool_name,
                summary,
            }]
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

fn parse_claude_user_input_questions(
    tool_name: &str,
    input: &serde_json::Value,
) -> Option<Vec<UserInputQuestion>> {
    if tool_name != "SendUserMessage" {
        return None;
    }

    let prompt = input
        .get("message")
        .and_then(|value| value.as_str())
        .or_else(|| input.get("prompt").and_then(|value| value.as_str()))
        .or_else(|| input.get("question").and_then(|value| value.as_str()))
        .filter(|value| !value.trim().is_empty())?;

    Some(vec![UserInputQuestion {
        id: "claude_reply".to_string(),
        header: "Claude".to_string(),
        question: prompt.to_string(),
        options: None,
        is_secret: false,
    }])
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
            matches!(&events[0], StreamJsonEvent::ToolCall { name, input_summary, .. }
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
            matches!(&events[0], StreamJsonEvent::ToolResult { id, tool_name, summary }
                if id.as_deref() == Some("abc") && tool_name == "Write" && summary == "ok")
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

    #[test]
    fn test_parse_send_user_message_questions() {
        let questions = parse_claude_user_input_questions(
            "SendUserMessage",
            &serde_json::json!({ "message": "Which file should I edit?" }),
        )
        .unwrap();
        assert_eq!(questions.len(), 1);
        assert_eq!(questions[0].question, "Which file should I edit?");
        assert_eq!(questions[0].header, "Claude");
    }

    #[test]
    fn test_parse_content_block_delta_text() {
        // Bare format (without stream_event envelope)
        let line = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamJsonEvent::TextDelta(t) if t == "Hello "));
    }

    #[test]
    fn test_parse_stream_event_envelope_text_delta() {
        // Real Claude Code format: stream_event wrapping content_block_delta
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], StreamJsonEvent::TextDelta(t) if t == "world"));
    }

    #[test]
    fn test_parse_stream_event_envelope_content_block_start() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"Bash","input":{}}}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert!(events.is_empty());
        assert_eq!(reg.get("t1").unwrap(), "Bash");
    }

    #[test]
    fn test_parse_content_block_start_tool_use_registers_name() {
        let line = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"xyz","name":"Read","input":{}}}"#;
        let mut reg = HashMap::new();
        let events = parse_stream_json_line(line, &mut reg);
        assert!(events.is_empty());
        assert_eq!(reg.get("xyz").unwrap(), "Read");
    }
}
