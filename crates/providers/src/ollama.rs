//! Ollama local LLM provider.
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{
    normalized_session, CommandDetails, FileChangeDetails, FileChangeEntry, LlmProvider, Message,
    ProviderApprovalDecision, ProviderApprovalKind, ProviderApprovalPayload, ProviderCapabilities,
    ProviderEvent, ProviderInteractionMode, ProviderSession, ProviderSessionEvent, StreamChunk,
    UserInputPayload,
};
use anyhow::Result;
use async_trait::async_trait;
use futures_util::StreamExt;
use koklo_events::{CompletionUsage, CostDisplay, UserInputQuestion};
use koklo_shell::{CommandSpec, Sandbox, SandboxOutput};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct OllamaProvider {
    pub base_url: String,
    pub model: String,
    client: reqwest::Client,
    working_dir: Option<PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
}

impl OllamaProvider {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>) -> Self {
        Self::new_with_context(base_url.into(), model.into(), None, None)
    }

    fn new_with_context(
        base_url: String,
        model: String,
        working_dir: Option<PathBuf>,
        sandbox: Option<Arc<dyn Sandbox>>,
    ) -> Self {
        Self {
            base_url,
            model,
            client: reqwest::Client::new(),
            working_dir,
            sandbox,
        }
    }

    pub fn from_env() -> Self {
        let base_url = std::env::var("OLLAMA_BASE_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
        let model =
            std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "qwen2.5-coder:7b".to_string());
        Self::new(base_url, model)
    }

    pub fn from_config(entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        Self::from_config_with_context(entry, None, None)
    }

    pub fn with_working_dir_from_config(
        entry: &ProviderTomlEntry,
        working_dir: PathBuf,
    ) -> Result<Self, ProviderError> {
        Self::from_config_with_context(entry, Some(working_dir), None)
    }

    pub fn with_context_from_config(
        entry: &ProviderTomlEntry,
        working_dir: PathBuf,
        sandbox: Arc<dyn Sandbox>,
    ) -> Result<Self, ProviderError> {
        Self::from_config_with_context(entry, Some(working_dir), Some(sandbox))
    }

    fn from_config_with_context(
        entry: &ProviderTomlEntry,
        working_dir: Option<PathBuf>,
        sandbox: Option<Arc<dyn Sandbox>>,
    ) -> Result<Self, ProviderError> {
        let base_url = entry
            .base_url
            .clone()
            .or_else(|| std::env::var("OLLAMA_BASE_URL").ok())
            .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
        let model = entry
            .model
            .clone()
            .or_else(|| std::env::var("OLLAMA_MODEL").ok())
            .unwrap_or_else(|| "qwen2.5-coder:7b".to_string());
        Ok(Self::new_with_context(
            base_url,
            model,
            working_dir,
            sandbox,
        ))
    }

    /// Fetch available model names from `/api/tags`.
    async fn fetch_available_models(&self) -> Result<Vec<String>> {
        let resp = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Ok(vec![]);
        }
        let json: serde_json::Value = resp.json().await?;
        let models = json["models"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["name"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        Ok(models)
    }

    fn workspace_root(&self) -> Result<&Path> {
        self.working_dir
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("ollama synthetic loop requires a workspace root"))
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SyntheticAction {
    Finish {
        message: String,
    },
    Message {
        message: String,
    },
    ReadFile {
        path: String,
        #[serde(default)]
        start_line: Option<usize>,
        #[serde(default)]
        max_lines: Option<usize>,
    },
    RunCommand {
        command: String,
        #[serde(default)]
        cwd: Option<String>,
    },
    AskUser {
        question: String,
        #[serde(default)]
        header: Option<String>,
    },
    WriteFile {
        path: String,
        content: String,
    },
    EditFile {
        path: String,
        old_string: String,
        new_string: String,
        #[serde(default)]
        replace_all: bool,
    },
}

#[derive(Debug, Clone)]
struct PendingCommandApproval {
    request_id: String,
    item_id: String,
    command: String,
    cwd: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingFileApproval {
    request_id: String,
    item_id: String,
    path: String,
    summary: String,
    content: PendingFileContent,
}

#[derive(Debug, Clone)]
enum PendingFileContent {
    Write {
        content: String,
    },
    Edit {
        old_string: String,
        new_string: String,
        replace_all: bool,
    },
}

#[derive(Debug, Clone)]
enum PendingApproval {
    Command(PendingCommandApproval),
    File(PendingFileApproval),
}

#[derive(Debug, Clone)]
enum SessionState {
    Ready,
    AwaitingUserInput {
        request_id: String,
        question: String,
        header: String,
    },
    AwaitingApproval(PendingApproval),
    Done,
}

struct OllamaSyntheticSession {
    provider: Arc<OllamaProvider>,
    messages: Vec<Message>,
    pending: VecDeque<Result<ProviderSessionEvent>>,
    state: SessionState,
    total_usage: CompletionUsage,
    turn_count: usize,
    next_id: usize,
    final_output: String,
}

impl OllamaSyntheticSession {
    fn new(provider: Arc<OllamaProvider>, messages: Vec<Message>) -> Self {
        Self {
            provider,
            messages,
            pending: VecDeque::new(),
            state: SessionState::Ready,
            total_usage: CompletionUsage::default(),
            turn_count: 0,
            next_id: 0,
            final_output: String::new(),
        }
    }

    fn next_request_id(&mut self, prefix: &str) -> String {
        self.next_id += 1;
        format!("ollama-{prefix}-{}", self.next_id)
    }

    fn build_turn_messages(&self) -> Vec<Message> {
        let mut messages = Vec::with_capacity(self.messages.len() + 1);
        messages.push(Message::system(synthetic_tool_loop_prompt()));
        messages.extend(self.messages.clone());
        messages
    }

    async fn decode_action(&mut self, raw_output: &str) -> Result<(SyntheticAction, String)> {
        if let Some(action) = parse_synthetic_action(raw_output) {
            return Ok((action, raw_output.to_string()));
        }

        let mut repair_messages = self.build_turn_messages();
        repair_messages.push(Message::assistant(raw_output.to_string()));
        repair_messages.push(Message::user(synthetic_repair_prompt(raw_output)));
        let (repaired_output, usage) = self
            .provider
            .complete_stream(repair_messages, &mut |_| {})
            .await?;
        self.total_usage.prompt_tokens += usage.prompt_tokens;
        self.total_usage.completion_tokens += usage.completion_tokens;

        if let Some(action) = parse_synthetic_action(&repaired_output) {
            return Ok((action, repaired_output));
        }

        Ok((
            SyntheticAction::Finish {
                message: raw_output.trim().to_string(),
            },
            raw_output.to_string(),
        ))
    }

    async fn advance(&mut self) -> Result<()> {
        if !matches!(self.state, SessionState::Ready) {
            return Ok(());
        }
        self.turn_count += 1;
        if self.turn_count > 12 {
            anyhow::bail!("ollama synthetic loop exceeded 12 turns");
        }

        let (raw_output, usage) = self
            .provider
            .complete_stream(self.build_turn_messages(), &mut |_| {})
            .await?;
        self.total_usage.prompt_tokens += usage.prompt_tokens;
        self.total_usage.completion_tokens += usage.completion_tokens;

        let (action, history_output) = self.decode_action(&raw_output).await?;
        self.messages.push(Message::assistant(history_output));
        self.apply_action(action).await
    }

    async fn apply_action(&mut self, action: SyntheticAction) -> Result<()> {
        match action {
            SyntheticAction::Finish { message } | SyntheticAction::Message { message } => {
                self.final_output = message.clone();
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::MessageDelta {
                        text: message.clone(),
                    },
                )));
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::MessageCompleted,
                )));
                self.pending.push_back(Ok(ProviderSessionEvent::Finished {
                    output: message,
                    usage: self.total_usage.clone(),
                }));
                self.state = SessionState::Done;
                Ok(())
            }
            SyntheticAction::AskUser { question, header } => {
                let request_id = self.next_request_id("user");
                let header = header.unwrap_or_else(|| "Need Input".to_string());
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::UserInputRequest {
                        item_id: Some(request_id.clone()),
                        questions: vec![UserInputQuestion {
                            id: "ollama_reply".to_string(),
                            header: header.clone(),
                            question: question.clone(),
                            options: None,
                            is_secret: false,
                        }],
                    },
                )));
                self.state = SessionState::AwaitingUserInput {
                    request_id,
                    question,
                    header,
                };
                Ok(())
            }
            SyntheticAction::ReadFile {
                path,
                start_line,
                max_lines,
            } => {
                let content = read_workspace_file(
                    self.provider.workspace_root()?,
                    &path,
                    start_line.unwrap_or(1),
                    max_lines.unwrap_or(200),
                )?;
                self.pending
                    .push_back(Ok(ProviderSessionEvent::Event(ProviderEvent::ToolCall {
                        item_id: None,
                        tool_name: "Read".to_string(),
                        input_summary: path.clone(),
                    })));
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::ToolResult {
                        item_id: None,
                        tool_name: "Read".to_string(),
                        output_summary: summarize_read_result(&content),
                        success: Some(true),
                    },
                )));
                self.messages
                    .push(Message::user(format_read_result_for_history(
                        &path, &content,
                    )));
                Ok(())
            }
            SyntheticAction::RunCommand { command, cwd } => {
                let request_id = self.next_request_id("approval");
                let item_id = self.next_request_id("command");
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::ApprovalRequest {
                        item_id: Some(item_id.clone()),
                        request_id: request_id.clone(),
                        kind: ProviderApprovalKind::CommandExecution,
                        description: format!("Run command: {}", command),
                        details: serde_json::json!({
                            "command": command,
                            "cwd": cwd,
                        }),
                    },
                )));
                self.state = SessionState::AwaitingApproval(PendingApproval::Command(
                    PendingCommandApproval {
                        request_id,
                        item_id,
                        command,
                        cwd,
                    },
                ));
                Ok(())
            }
            SyntheticAction::WriteFile { path, content } => {
                let request_id = self.next_request_id("approval");
                let item_id = self.next_request_id("file");
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::ApprovalRequest {
                        item_id: Some(item_id.clone()),
                        request_id: request_id.clone(),
                        kind: ProviderApprovalKind::FileChange,
                        description: format!("Write file: {}", path),
                        details: serde_json::json!({
                            "path": path,
                            "operation": "write",
                        }),
                    },
                )));
                self.state =
                    SessionState::AwaitingApproval(PendingApproval::File(PendingFileApproval {
                        request_id,
                        item_id,
                        summary: path.clone(),
                        path,
                        content: PendingFileContent::Write { content },
                    }));
                Ok(())
            }
            SyntheticAction::EditFile {
                path,
                old_string,
                new_string,
                replace_all,
            } => {
                let request_id = self.next_request_id("approval");
                let item_id = self.next_request_id("file");
                self.pending.push_back(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::ApprovalRequest {
                        item_id: Some(item_id.clone()),
                        request_id: request_id.clone(),
                        kind: ProviderApprovalKind::FileChange,
                        description: format!("Edit file: {}", path),
                        details: serde_json::json!({
                            "path": path,
                            "operation": "edit",
                            "replace_all": replace_all,
                        }),
                    },
                )));
                self.state =
                    SessionState::AwaitingApproval(PendingApproval::File(PendingFileApproval {
                        request_id,
                        item_id,
                        summary: path.clone(),
                        path,
                        content: PendingFileContent::Edit {
                            old_string,
                            new_string,
                            replace_all,
                        },
                    }));
                Ok(())
            }
        }
    }
}

fn synthetic_tool_loop_prompt() -> &'static str {
    "You are operating inside Koklo's synthetic tool loop.\n\
Return exactly one JSON object and nothing else.\n\
Valid actions:\n\
{\"type\":\"finish\",\"message\":\"final answer for the user\"}\n\
{\"type\":\"message\",\"message\":\"final answer for the user\"}\n\
{\"type\":\"read_file\",\"path\":\"relative/path.rs\",\"start_line\":1,\"max_lines\":200}\n\
{\"type\":\"run_command\",\"command\":\"cargo test -p koklo-cli\",\"cwd\":\".\"}\n\
{\"type\":\"ask_user\",\"question\":\"Which file should I edit?\",\"header\":\"Need input\"}\n\
{\"type\":\"write_file\",\"path\":\"notes/todo.md\",\"content\":\"new file contents\"}\n\
{\"type\":\"edit_file\",\"path\":\"src/lib.rs\",\"old_string\":\"before\",\"new_string\":\"after\",\"replace_all\":false}\n\
Rules:\n\
- Prefer read_file before run_command when you need repository context.\n\
- Prefer edit_file over write_file when modifying an existing file.\n\
- Use workspace-relative paths.\n\
- Do not use Markdown fences.\n\
- Use finish when you have enough information."
}

fn synthetic_repair_prompt(raw_output: &str) -> String {
    format!(
        "Your previous response was invalid for Koklo's action protocol.\n\
Return exactly one valid JSON object matching one of the documented action shapes and nothing else.\n\
Do not include explanations, prose, or Markdown fences.\n\
Previous response:\n```text\n{raw_output}\n```"
    )
}

fn parse_synthetic_action(text: &str) -> Option<SyntheticAction> {
    let trimmed = text.trim();
    try_parse_synthetic_action(trimmed).or_else(|| {
        extract_first_json_object(trimmed).and_then(|json| try_parse_synthetic_action(&json))
    })
}

fn try_parse_synthetic_action(text: &str) -> Option<SyntheticAction> {
    let json_text = strip_code_fences(text);
    serde_json::from_str::<SyntheticAction>(json_text).ok()
}

fn strip_code_fences(text: &str) -> &str {
    text.strip_prefix("```json")
        .and_then(|rest| rest.strip_suffix("```"))
        .map(str::trim)
        .or_else(|| {
            text.strip_prefix("```")
                .and_then(|rest| rest.strip_suffix("```"))
                .map(str::trim)
        })
        .unwrap_or(text)
}

fn extract_first_json_object(text: &str) -> Option<String> {
    let mut start = None;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (idx, ch) in text.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => {
                if depth == 0 {
                    start = Some(idx);
                }
                depth += 1;
            }
            '}' => {
                if depth == 0 {
                    continue;
                }
                depth -= 1;
                if depth == 0 {
                    let start = start?;
                    return Some(text[start..=idx].to_string());
                }
            }
            _ => {}
        }
    }

    None
}

fn file_change_details_for_pending(path: &str, content: &PendingFileContent) -> FileChangeDetails {
    let entry = match content {
        PendingFileContent::Write { content } => FileChangeEntry {
            path: Some(path.to_string()),
            kind: Some("write".to_string()),
            added: limited_text_lines(content),
            ..FileChangeEntry::default()
        },
        PendingFileContent::Edit {
            old_string,
            new_string,
            ..
        } => FileChangeEntry {
            path: Some(path.to_string()),
            kind: Some("update".to_string()),
            removed: limited_text_lines(old_string),
            added: limited_text_lines(new_string),
            ..FileChangeEntry::default()
        },
    };
    FileChangeDetails {
        changes: vec![entry],
        ..FileChangeDetails::default()
    }
}

fn limited_text_lines(text: &str) -> Vec<String> {
    const MAX_LINES: usize = 24;

    let mut lines = text.lines().map(str::to_string).collect::<Vec<_>>();
    if lines.len() > MAX_LINES {
        lines.truncate(MAX_LINES);
        lines.push("...".to_string());
    }
    lines
}

fn apply_file_change(workspace_root: &Path, pending: &PendingFileApproval) -> Result<String> {
    let path = resolve_workspace_path(workspace_root, &pending.path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match &pending.content {
        PendingFileContent::Write { content } => {
            std::fs::write(&path, content)?;
        }
        PendingFileContent::Edit {
            old_string,
            new_string,
            replace_all,
        } => {
            let current = std::fs::read_to_string(&path)?;
            let updated = if *replace_all {
                current.replace(old_string, new_string)
            } else if current.contains(old_string) {
                current.replacen(old_string, new_string, 1)
            } else {
                anyhow::bail!("target string not found in {}", pending.path);
            };
            if updated == current {
                anyhow::bail!("edit produced no changes for {}", pending.path);
            }
            std::fs::write(&path, updated)?;
        }
    }
    Ok(path.display().to_string())
}

fn read_workspace_file(
    workspace_root: &Path,
    raw_path: &str,
    start_line: usize,
    max_lines: usize,
) -> Result<String> {
    let path = resolve_existing_workspace_path(workspace_root, raw_path)?;
    let text = std::fs::read_to_string(&path)?;
    let start_idx = start_line.saturating_sub(1);
    let selected = text
        .lines()
        .skip(start_idx)
        .take(max_lines.max(1))
        .enumerate()
        .map(|(idx, line)| format!("{:>4} {}", start_idx + idx + 1, line))
        .collect::<Vec<_>>();
    Ok(selected.join("\n"))
}

fn summarize_read_result(content: &str) -> String {
    let line_count = content.lines().count();
    if line_count == 0 {
        "empty file".to_string()
    } else {
        format!("{line_count} line(s)")
    }
}

fn format_read_result_for_history(path: &str, content: &str) -> String {
    format!("Tool result: read_file\npath: {path}\n\n```text\n{content}\n```")
}

fn format_user_input_for_history(question: &str, answer: &[String]) -> String {
    format!(
        "Tool result: ask_user\nquestion: {question}\nanswer:\n{}",
        answer.join("\n")
    )
}

fn format_command_result_for_history(command: &str, cwd: &Path, output: &SandboxOutput) -> String {
    format!(
        "Tool result: run_command\ncommand: {command}\ncwd: {}\nexit_code: {}\nstdout:\n{}\nstderr:\n{}",
        cwd.display(),
        output.exit_code,
        output.stdout,
        output.stderr
    )
}

fn resolve_existing_workspace_path(workspace_root: &Path, raw_path: &str) -> Result<PathBuf> {
    let workspace_root = workspace_root.canonicalize()?;
    let candidate = if Path::new(raw_path).is_absolute() {
        PathBuf::from(raw_path)
    } else {
        workspace_root.join(raw_path)
    };
    let resolved = candidate.canonicalize()?;
    if !resolved.starts_with(&workspace_root) {
        anyhow::bail!("path escapes workspace: {}", raw_path);
    }
    Ok(resolved)
}

fn resolve_workspace_path(workspace_root: &Path, raw_path: &str) -> Result<PathBuf> {
    let workspace_root = workspace_root.canonicalize()?;
    let candidate = if Path::new(raw_path).is_absolute() {
        PathBuf::from(raw_path)
    } else {
        workspace_root.join(raw_path)
    };

    if candidate.exists() {
        let resolved = candidate.canonicalize()?;
        if !resolved.starts_with(&workspace_root) {
            anyhow::bail!("path escapes workspace: {}", raw_path);
        }
        return Ok(resolved);
    }

    let mut existing_ancestor = candidate
        .parent()
        .ok_or_else(|| anyhow::anyhow!("invalid path: {}", raw_path))?;
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| anyhow::anyhow!("invalid path: {}", raw_path))?;
    }
    let resolved_ancestor = existing_ancestor.canonicalize()?;
    if !resolved_ancestor.starts_with(&workspace_root) {
        anyhow::bail!("path escapes workspace: {}", raw_path);
    }
    let suffix = candidate
        .strip_prefix(existing_ancestor)
        .map_err(|_| anyhow::anyhow!("invalid path: {}", raw_path))?;
    Ok(resolved_ancestor.join(suffix))
}

fn resolve_workspace_dir(workspace_root: &Path, raw_dir: Option<&str>) -> Result<PathBuf> {
    let workspace_root = workspace_root.canonicalize()?;
    let raw_dir = raw_dir.unwrap_or(".");
    let candidate = if Path::new(raw_dir).is_absolute() {
        PathBuf::from(raw_dir)
    } else {
        workspace_root.join(raw_dir)
    };
    let resolved = candidate.canonicalize()?;
    if !resolved.starts_with(&workspace_root) {
        anyhow::bail!("cwd escapes workspace: {}", raw_dir);
    }
    Ok(resolved)
}

async fn run_command_direct(command: &str, cwd: &Path) -> Result<SandboxOutput> {
    let output = tokio::process::Command::new("sh")
        .args(["-c", command])
        .current_dir(cwd)
        .output()
        .await?;
    Ok(SandboxOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code().unwrap_or(1),
    })
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn start_session(
        self: Arc<Self>,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        if self.working_dir.is_some() {
            Ok(Box::new(OllamaSyntheticSession::new(self, messages)))
        } else {
            Ok(normalized_session(self, messages))
        }
    }

    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)> {
        let api_messages: Vec<_> = messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let body = serde_json::json!({
            "model": self.model,
            "messages": api_messages,
            "stream": true
        });

        let resp = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if status == 404 || text.contains("model") {
                let available = self.fetch_available_models().await.unwrap_or_default();
                return Err(ProviderError::OllamaModelNotFound {
                    model: self.model.clone(),
                    available: if available.is_empty() {
                        "none found".to_string()
                    } else {
                        available.join(", ")
                    },
                }
                .into());
            }
            return Err(ProviderError::HttpError { status, body: text }.into());
        }

        let mut full_text = String::new();
        let mut usage = CompletionUsage::default();
        let mut stream = resp.bytes_stream();
        let mut line_buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            line_buffer.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = line_buffer.find('\n') {
                let line = line_buffer[..pos].to_string();
                line_buffer.drain(..=pos);
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(t) = json["message"]["content"].as_str() {
                        full_text.push_str(t);
                        on_chunk(StreamChunk::text(t));
                    }
                    if json["done"].as_bool().unwrap_or(false) {
                        // Parse usage from final chunk
                        if let Some(pt) = json["prompt_eval_count"].as_u64() {
                            usage.prompt_tokens = pt as u32;
                        }
                        if let Some(ct) = json["eval_count"].as_u64() {
                            usage.completion_tokens = ct as u32;
                        }
                        on_chunk(StreamChunk::finished());
                    }
                }
            }
        }

        if full_text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }
        Ok((full_text, usage))
    }

    fn compute_cost(&self, _usage: &CompletionUsage) -> Option<CostDisplay> {
        Some(CostDisplay::Free)
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming_text: true,
            usage_native: true,
            tool_calls_native: false,
            approvals_native: false,
            user_input_native: false,
            reasoning_visible: false,
            interaction_mode: ProviderInteractionMode::Synthetic,
        }
    }

    fn provider_name(&self) -> &str {
        "ollama"
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.model)
    }
}

#[async_trait]
impl ProviderSession for OllamaSyntheticSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        loop {
            if let Some(event) = self.pending.pop_front() {
                return event;
            }

            match &self.state {
                SessionState::Ready => self.advance().await?,
                SessionState::AwaitingUserInput { .. } => {
                    anyhow::bail!("ollama synthetic session is waiting for user input")
                }
                SessionState::AwaitingApproval(_) => {
                    anyhow::bail!("ollama synthetic session is waiting for approval")
                }
                SessionState::Done => anyhow::bail!("ollama synthetic session ended"),
            }
        }
    }

    async fn send_user_input(&mut self, input: UserInputPayload) -> Result<()> {
        let SessionState::AwaitingUserInput {
            request_id,
            question,
            header,
        } = &self.state
        else {
            anyhow::bail!("ollama synthetic session is not awaiting user input");
        };
        if input.request_id.as_deref() != Some(request_id.as_str()) {
            anyhow::bail!("unexpected user input request id");
        }
        self.messages
            .push(Message::assistant(format!("Asked user: {}", header)));
        self.messages
            .push(Message::user(format_user_input_for_history(
                question,
                &input.answers,
            )));
        self.state = SessionState::Ready;
        Ok(())
    }

    async fn resolve_approval(&mut self, approval: ProviderApprovalPayload) -> Result<()> {
        let SessionState::AwaitingApproval(pending) = &self.state else {
            anyhow::bail!("ollama synthetic session is not awaiting approval");
        };
        let request_id = match pending {
            PendingApproval::Command(pending) => pending.request_id.as_str(),
            PendingApproval::File(pending) => pending.request_id.as_str(),
        };
        if approval.request_id.as_deref() != Some(request_id) {
            anyhow::bail!("unexpected approval request id");
        }

        let pending = pending.clone();
        match approval.decision {
            ProviderApprovalDecision::Approve => match pending {
                PendingApproval::Command(pending) => {
                    let workspace_root = self.provider.workspace_root()?;
                    let cwd = resolve_workspace_dir(workspace_root, pending.cwd.as_deref())?;
                    self.pending.push_back(Ok(ProviderSessionEvent::Event(
                        ProviderEvent::Command {
                            item_id: Some(pending.item_id.clone()),
                            command: pending.command.clone(),
                            status: "in_progress".to_string(),
                            exit_code: None,
                            output: None,
                            details: Some(CommandDetails {
                                argv: shell_words::split(&pending.command).unwrap_or_default(),
                                cwd: Some(cwd.display().to_string()),
                                aggregated_output: None,
                            }),
                        },
                    )));

                    let output = if let Some(sandbox) = &self.provider.sandbox {
                        sandbox
                            .run_command(&CommandSpec::shell(pending.command.clone()), &cwd)
                            .await
                            .map_err(|err| anyhow::anyhow!(err.to_string()))?
                    } else {
                        run_command_direct(&pending.command, &cwd).await?
                    };
                    let command_output = format!("{}{}", output.stdout, output.stderr);
                    let status = if output.exit_code == 0 {
                        "completed"
                    } else {
                        "failed"
                    };
                    self.pending.push_back(Ok(ProviderSessionEvent::Event(
                        ProviderEvent::Command {
                            item_id: Some(pending.item_id.clone()),
                            command: pending.command.clone(),
                            status: status.to_string(),
                            exit_code: Some(output.exit_code as i64),
                            output: (!command_output.is_empty()).then_some(command_output.clone()),
                            details: Some(CommandDetails {
                                argv: shell_words::split(&pending.command).unwrap_or_default(),
                                cwd: Some(cwd.display().to_string()),
                                aggregated_output: (!command_output.is_empty())
                                    .then_some(command_output.clone()),
                            }),
                        },
                    )));
                    self.messages.push(Message::assistant(format!(
                        "Approved command: {}",
                        pending.command
                    )));
                    self.messages
                        .push(Message::user(format_command_result_for_history(
                            &pending.command,
                            &cwd,
                            &output,
                        )));
                }
                PendingApproval::File(pending) => {
                    let workspace_root = self.provider.workspace_root()?;
                    let details = file_change_details_for_pending(&pending.path, &pending.content);
                    self.pending.push_back(Ok(ProviderSessionEvent::Event(
                        ProviderEvent::FileChange {
                            item_id: Some(pending.item_id.clone()),
                            summary: pending.summary.clone(),
                            files: vec![pending.path.clone()],
                            status: "in_progress".to_string(),
                            details: Some(details.clone()),
                        },
                    )));

                    let applied_path = apply_file_change(workspace_root, &pending)?;

                    self.pending.push_back(Ok(ProviderSessionEvent::Event(
                        ProviderEvent::FileChange {
                            item_id: Some(pending.item_id.clone()),
                            summary: pending.summary.clone(),
                            files: vec![pending.path.clone()],
                            status: "completed".to_string(),
                            details: Some(details),
                        },
                    )));
                    self.messages.push(Message::assistant(format!(
                        "Approved file change: {}",
                        pending.path
                    )));
                    self.messages.push(Message::user(format!(
                        "Tool result: file_change\npath: {}\nstatus: completed",
                        applied_path
                    )));
                }
            },
            ProviderApprovalDecision::Reject | ProviderApprovalDecision::Edit { .. } => {
                match pending {
                    PendingApproval::Command(pending) => {
                        self.messages.push(Message::assistant(format!(
                            "Command rejected: {}",
                            pending.command
                        )));
                        self.messages.push(Message::user(format!(
                            "Tool result: run_command\ncommand: {}\nstatus: rejected by user",
                            pending.command
                        )));
                    }
                    PendingApproval::File(pending) => {
                        self.messages.push(Message::assistant(format!(
                            "File change rejected: {}",
                            pending.path
                        )));
                        self.messages.push(Message::user(format!(
                            "Tool result: file_change\npath: {}\nstatus: rejected by user",
                            pending.path
                        )));
                    }
                }
            }
        }

        self.state = SessionState::Ready;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env() {
        let p = OllamaProvider::from_env();
        assert!(!p.base_url.is_empty());
        assert!(!p.model.is_empty());
        assert_eq!(p.provider_name(), "ollama");
    }

    #[test]
    fn test_from_config_defaults() {
        let entry = ProviderTomlEntry::default();
        let p = OllamaProvider::from_config(&entry).unwrap();
        assert_eq!(p.base_url, "http://127.0.0.1:11434");
        assert_eq!(p.model, "qwen2.5-coder:7b");
    }

    #[test]
    fn test_from_config_custom() {
        let entry = ProviderTomlEntry {
            base_url: Some("http://192.168.1.10:11434".to_string()),
            model: Some("llama3:8b".to_string()),
            ..Default::default()
        };
        let p = OllamaProvider::from_config(&entry).unwrap();
        assert_eq!(p.base_url, "http://192.168.1.10:11434");
        assert_eq!(p.model, "llama3:8b");
    }

    #[tokio::test]
    async fn test_ndjson_line_split_across_chunks() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        // Two NDJSON lines, the first one is split across TCP chunks
        let body = "{\"message\":{\"content\":\"hello\"},\"done\":false}\n\
                    {\"message\":{\"content\":\" world\"},\"done\":false}\n\
                    {\"message\":{\"content\":\"\"},\"done\":true,\"prompt_eval_count\":5,\"eval_count\":3}\n";
        Mock::given(method("POST"))
            .and(path("/api/chat"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let p = OllamaProvider::new(server.uri(), "test-model");
        let messages = vec![crate::Message::user("hi")];
        let mut chunks = vec![];
        let (result, usage) = p
            .complete_stream(messages, &mut |c| {
                if !c.text.is_empty() {
                    chunks.push(c.text.clone());
                }
            })
            .await
            .unwrap();
        assert_eq!(result, "hello world");
        assert_eq!(usage.prompt_tokens, 5);
        assert_eq!(usage.completion_tokens, 3);
    }

    #[test]
    fn test_parse_synthetic_action_from_code_fence() {
        let action = parse_synthetic_action(
            "```json\n{\"type\":\"read_file\",\"path\":\"Cargo.toml\",\"start_line\":1,\"max_lines\":10}\n```",
        )
        .unwrap();
        assert!(matches!(
            action,
            SyntheticAction::ReadFile {
                path,
                start_line: Some(1),
                max_lines: Some(10)
            } if path == "Cargo.toml"
        ));
    }

    #[test]
    fn test_parse_synthetic_action_from_wrapped_prose() {
        let action = parse_synthetic_action(
            "I will inspect the file first.\n{\"type\":\"read_file\",\"path\":\"src/lib.rs\",\"start_line\":3,\"max_lines\":20}\nThen I will continue.",
        )
        .unwrap();
        assert!(matches!(
            action,
            SyntheticAction::ReadFile {
                path,
                start_line: Some(3),
                max_lines: Some(20)
            } if path == "src/lib.rs"
        ));
    }

    #[tokio::test]
    async fn synthetic_session_applies_read_file_action() {
        let workspace = tempfile::tempdir().unwrap();
        std::fs::write(workspace.path().join("README.md"), "hello\nworld\n").unwrap();

        let provider = Arc::new(OllamaProvider::new_with_context(
            "http://127.0.0.1:11434".to_string(),
            "test-model".to_string(),
            Some(workspace.path().to_path_buf()),
            None,
        ));

        let mut session = OllamaSyntheticSession::new(provider, vec![Message::user("Inspect")]);
        session
            .apply_action(SyntheticAction::ReadFile {
                path: "README.md".to_string(),
                start_line: Some(1),
                max_lines: Some(5),
            })
            .await
            .unwrap();

        let first = session.next_event().await.unwrap();
        assert!(matches!(
            first,
            ProviderSessionEvent::Event(ProviderEvent::ToolCall { ref tool_name, ref input_summary, .. })
                if tool_name == "Read" && input_summary == "README.md"
        ));

        let second = session.next_event().await.unwrap();
        assert!(matches!(
            second,
            ProviderSessionEvent::Event(ProviderEvent::ToolResult { ref tool_name, ref output_summary, .. })
                if tool_name == "Read" && output_summary == "2 line(s)"
        ));
    }

    #[tokio::test]
    async fn synthetic_session_finish_emits_completed_turn() {
        let workspace = tempfile::tempdir().unwrap();
        let provider = Arc::new(OllamaProvider::new_with_context(
            "http://127.0.0.1:11434".to_string(),
            "test-model".to_string(),
            Some(workspace.path().to_path_buf()),
            None,
        ));
        let mut session = OllamaSyntheticSession::new(provider, vec![Message::user("Wrap up")]);
        session
            .apply_action(SyntheticAction::Finish {
                message: "done".to_string(),
            })
            .await
            .unwrap();

        let first = session.next_event().await.unwrap();
        assert!(matches!(
            first,
            ProviderSessionEvent::Event(ProviderEvent::MessageDelta { ref text }) if text == "done"
        ));

        let second = session.next_event().await.unwrap();
        assert!(matches!(
            second,
            ProviderSessionEvent::Event(ProviderEvent::MessageCompleted)
        ));

        let third = session.next_event().await.unwrap();
        assert!(matches!(
            third,
            ProviderSessionEvent::Finished { ref output, .. } if output == "done"
        ));
    }

    #[tokio::test]
    async fn synthetic_session_write_file_requires_approval_and_emits_file_change() {
        let workspace = tempfile::tempdir().unwrap();
        let provider = Arc::new(OllamaProvider::new_with_context(
            "http://127.0.0.1:11434".to_string(),
            "test-model".to_string(),
            Some(workspace.path().to_path_buf()),
            None,
        ));
        let mut session = OllamaSyntheticSession::new(provider, vec![Message::user("Write")]);
        session
            .apply_action(SyntheticAction::WriteFile {
                path: "notes/todo.md".to_string(),
                content: "hello\nworld\n".to_string(),
            })
            .await
            .unwrap();

        let first = session.next_event().await.unwrap();
        let request_id = match first {
            ProviderSessionEvent::Event(ProviderEvent::ApprovalRequest {
                request_id,
                kind,
                ..
            }) => {
                assert_eq!(kind, ProviderApprovalKind::FileChange);
                request_id
            }
            other => panic!("unexpected event: {other:?}"),
        };

        session
            .resolve_approval(ProviderApprovalPayload {
                request_id: Some(request_id),
                decision: ProviderApprovalDecision::Approve,
            })
            .await
            .unwrap();

        let second = session.next_event().await.unwrap();
        assert!(matches!(
            second,
            ProviderSessionEvent::Event(ProviderEvent::FileChange { ref status, .. })
                if status == "in_progress"
        ));

        let third = session.next_event().await.unwrap();
        assert!(matches!(
            third,
            ProviderSessionEvent::Event(ProviderEvent::FileChange { ref status, details: Some(_), .. })
                if status == "completed"
        ));
        assert_eq!(
            std::fs::read_to_string(workspace.path().join("notes").join("todo.md")).unwrap(),
            "hello\nworld\n"
        );
    }

    #[tokio::test]
    async fn synthetic_session_edit_file_replaces_requested_text() {
        let workspace = tempfile::tempdir().unwrap();
        let file = workspace.path().join("src").join("lib.rs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "before\nold line\nafter\n").unwrap();

        let provider = Arc::new(OllamaProvider::new_with_context(
            "http://127.0.0.1:11434".to_string(),
            "test-model".to_string(),
            Some(workspace.path().to_path_buf()),
            None,
        ));
        let mut session = OllamaSyntheticSession::new(provider, vec![Message::user("Edit")]);
        session
            .apply_action(SyntheticAction::EditFile {
                path: "src/lib.rs".to_string(),
                old_string: "old line".to_string(),
                new_string: "new line".to_string(),
                replace_all: false,
            })
            .await
            .unwrap();

        let first = session.next_event().await.unwrap();
        let request_id = match first {
            ProviderSessionEvent::Event(ProviderEvent::ApprovalRequest { request_id, .. }) => {
                request_id
            }
            other => panic!("unexpected event: {other:?}"),
        };

        session
            .resolve_approval(ProviderApprovalPayload {
                request_id: Some(request_id),
                decision: ProviderApprovalDecision::Approve,
            })
            .await
            .unwrap();

        let _ = session.next_event().await.unwrap();
        let second = session.next_event().await.unwrap();
        assert!(matches!(
            second,
            ProviderSessionEvent::Event(ProviderEvent::FileChange { details: Some(details), .. })
                if details.changes.iter().any(|change|
                    change.removed == vec!["old line".to_string()]
                        && change.added == vec!["new line".to_string()])
        ));
        assert_eq!(
            std::fs::read_to_string(file).unwrap(),
            "before\nnew line\nafter\n"
        );
    }
}
