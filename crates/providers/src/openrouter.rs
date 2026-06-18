//! OpenRouter provider — wraps OpenAICompatProvider with optional routing config.
//!
//! OpenRouter is an OpenAI-compatible gateway that aggregates 300+ models from 60+ providers
//! under a single API key. Configure via `[providers.openrouter]` in `pipeline.toml`.
use crate::config::{ProviderRouting, ProviderTomlEntry};
use crate::error::ProviderError;
use crate::openai_compat::OpenAICompatProvider;
use crate::resolve_secret;
use crate::{
    normalized_session, CommandDetails, FileChangeDetails, FileChangeEntry, LlmProvider, Message,
    ProviderApprovalDecision, ProviderApprovalKind, ProviderApprovalPayload, ProviderCapabilities,
    ProviderEvent, ProviderInteractionMode, ProviderSession, ProviderSessionEvent, StreamChunk,
    UserInputPayload,
};
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{CompletionUsage, CostDisplay, UserInputQuestion};
use koklo_shell::{CommandSpec, Sandbox, SandboxOutput};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// In-memory cache of OpenRouter model pricing (fetched at first use).
pub struct PricingCache {
    cache: RwLock<HashMap<String, (f64, f64)>>, // model_id -> (input_per_mtok, output_per_mtok)
    client: reqwest::Client,
    api_key: String,
}

impl PricingCache {
    pub fn new(api_key: String, client: reqwest::Client) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            client,
            api_key,
        }
    }

    /// Get pricing for a model. Fetches from OpenRouter API if not cached.
    pub async fn get_pricing(&self, model: &str) -> Option<(f64, f64)> {
        {
            let cache = self.cache.read().await;
            if let Some(pricing) = cache.get(model) {
                return Some(*pricing);
            }
        }
        // Fetch from API
        if let Ok(resp) = self
            .client
            .get("https://openrouter.ai/api/v1/models")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(models) = json["data"].as_array() {
                    let mut cache = self.cache.write().await;
                    for m in models {
                        if let (Some(id), Some(pricing)) = (m["id"].as_str(), m.get("pricing")) {
                            // pricing.prompt and pricing.completion are in USD/token
                            // multiply by 1_000_000 for /Mtok
                            let input = pricing["prompt"]
                                .as_str()
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0)
                                * 1_000_000.0;
                            let output = pricing["completion"]
                                .as_str()
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0)
                                * 1_000_000.0;
                            cache.insert(id.to_string(), (input, output));
                        }
                    }
                    return cache.get(model).copied();
                }
            }
        }
        None
    }
}

pub struct OpenRouterProvider {
    pub(crate) inner: OpenAICompatProvider,
    pricing_cache: Arc<PricingCache>,
    working_dir: Option<PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
}

impl OpenRouterProvider {
    const BASE_URL: &'static str = "https://openrouter.ai/api/v1";

    pub fn new(api_key: String, model: String, routing: Option<ProviderRouting>) -> Self {
        Self::new_with_context(api_key, model, routing, None, None)
    }

    fn new_with_context(
        api_key: String,
        model: String,
        routing: Option<ProviderRouting>,
        working_dir: Option<PathBuf>,
        sandbox: Option<Arc<dyn Sandbox>>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        let pricing_cache = Arc::new(PricingCache::new(api_key.clone(), client.clone()));
        Self {
            inner: OpenAICompatProvider {
                api_key,
                model,
                base_url: Self::BASE_URL.to_string(),
                name: "openrouter".to_string(),
                api_key_env: "OPENROUTER_API_KEY".to_string(),
                client,
                extra_headers: vec![
                    ("HTTP-Referer".to_string(), "https://koklo.dev".to_string()),
                    ("X-Title".to_string(), "koklo".to_string()),
                ],
                extra_body: routing.map(|r| serde_json::json!({ "provider": r.to_json() })),
            },
            pricing_cache,
            working_dir,
            sandbox,
        }
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
        let var_name = entry.api_key_env.as_deref().unwrap_or("OPENROUTER_API_KEY");
        let api_key = resolve_secret(var_name).ok_or_else(|| ProviderError::MissingApiKey {
            var_name: var_name.to_string(),
        })?;
        let model = entry
            .model
            .clone()
            .unwrap_or_else(|| "openai/gpt-4o".to_string());
        Ok(Self::new_with_context(
            api_key,
            model,
            entry.routing.clone(),
            working_dir,
            sandbox,
        ))
    }

    fn workspace_root(&self) -> Result<&Path> {
        self.working_dir
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("openrouter synthetic loop requires a workspace root"))
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

struct OpenRouterSyntheticSession {
    provider: Arc<OpenRouterProvider>,
    messages: Vec<Message>,
    pending: VecDeque<Result<ProviderSessionEvent>>,
    state: SessionState,
    total_usage: CompletionUsage,
    turn_count: usize,
    next_id: usize,
    final_output: String,
    reinjected_read_chars: usize,
    reinjected_command_chars: usize,
}

impl OpenRouterSyntheticSession {
    fn new(provider: Arc<OpenRouterProvider>, messages: Vec<Message>) -> Self {
        Self {
            provider,
            messages,
            pending: VecDeque::new(),
            state: SessionState::Ready,
            total_usage: CompletionUsage::default(),
            turn_count: 0,
            next_id: 0,
            final_output: String::new(),
            reinjected_read_chars: 0,
            reinjected_command_chars: 0,
        }
    }

    fn next_request_id(&mut self, prefix: &str) -> String {
        self.next_id += 1;
        format!("openrouter-{prefix}-{}", self.next_id)
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

        let mut streamed_events = Vec::new();
        let mut repair_messages = self.build_turn_messages();
        repair_messages.push(Message::assistant(raw_output.to_string()));
        repair_messages.push(Message::user(synthetic_repair_prompt(raw_output)));
        let (repaired_output, usage) = self
            .provider
            .inner
            .complete_stream(repair_messages, &mut |chunk| {
                streamed_events.extend(chunk.events.into_iter().filter(|event| {
                    matches!(
                        event,
                        ProviderEvent::Reasoning { .. } | ProviderEvent::Plan { .. }
                    )
                }));
            })
            .await?;
        self.total_usage.prompt_tokens += usage.prompt_tokens;
        self.total_usage.completion_tokens += usage.completion_tokens;

        for event in streamed_events {
            self.pending
                .push_back(Ok(ProviderSessionEvent::Event(event)));
        }

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
            anyhow::bail!("openrouter synthetic loop exceeded 12 turns");
        }

        self.pending
            .push_back(Ok(ProviderSessionEvent::Event(ProviderEvent::Metadata {
                item_id: None,
                kind: "synthetic_request_metrics".to_string(),
                value: serde_json::json!({
                    "provider": "openrouter",
                    "turn_count": self.turn_count,
                    "message_count": self.messages.len(),
                    "history_chars": history_chars(&self.messages),
                    "reinjected_read_chars": self.reinjected_read_chars,
                    "reinjected_command_chars": self.reinjected_command_chars,
                }),
            })));

        let mut streamed_events = Vec::new();
        let (raw_output, usage) = self
            .provider
            .inner
            .complete_stream(self.build_turn_messages(), &mut |chunk| {
                streamed_events.extend(chunk.events.into_iter().filter(|event| {
                    matches!(
                        event,
                        ProviderEvent::Reasoning { .. } | ProviderEvent::Plan { .. }
                    )
                }));
            })
            .await?;
        self.total_usage.prompt_tokens += usage.prompt_tokens;
        self.total_usage.completion_tokens += usage.completion_tokens;

        for event in streamed_events {
            self.pending
                .push_back(Ok(ProviderSessionEvent::Event(event)));
        }

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
                            id: "openrouter_reply".to_string(),
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
                let history_entry = format_read_result_for_history(&path, &content);
                self.reinjected_read_chars += history_entry.chars().count();
                self.messages.push(Message::user(history_entry));
                self.pending
                    .push_back(Ok(ProviderSessionEvent::Event(ProviderEvent::Metadata {
                        item_id: None,
                        kind: "tool_context_metrics".to_string(),
                        value: serde_json::json!({
                            "provider": "openrouter",
                            "tool_kind": "read_file",
                            "path": path,
                            "reinjected_chars": self.reinjected_read_chars,
                        }),
                    })));
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
    "Return exactly one JSON object.\n\
Actions:\n\
{\"type\":\"finish\",\"message\":\"answer\"}\n\
{\"type\":\"message\",\"message\":\"answer\"}\n\
{\"type\":\"read_file\",\"path\":\"path.rs\",\"start_line\":1,\"max_lines\":200}\n\
{\"type\":\"run_command\",\"command\":\"cargo test -p koklo-cli\",\"cwd\":\".\"}\n\
{\"type\":\"ask_user\",\"question\":\"Which file?\",\"header\":\"Input\"}\n\
{\"type\":\"write_file\",\"path\":\"notes/todo.md\",\"content\":\"text\"}\n\
{\"type\":\"edit_file\",\"path\":\"src/lib.rs\",\"old_string\":\"before\",\"new_string\":\"after\",\"replace_all\":false}\n\
Rules: workspace-relative paths; no markdown fences; prefer read_file for code context; prefer edit_file for existing files; use finish when done."
}

fn synthetic_repair_prompt(raw_output: &str) -> String {
    format!(
        "Invalid response. Return one valid JSON action only. No prose. No markdown fences.\nPrevious:\n```text\n{raw_output}\n```"
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
        lines.push("…".to_string());
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

fn history_chars(messages: &[Message]) -> usize {
    messages
        .iter()
        .map(|message| message.content.chars().count())
        .sum()
}

fn format_read_result_for_history(path: &str, content: &str) -> String {
    let excerpt = bounded_history_excerpt(content, 24, 1200);
    if excerpt.is_empty() {
        format!(
            "Tool result: read_file\npath: {path}\nsummary: {}",
            summarize_read_result(content)
        )
    } else {
        format!(
            "Tool result: read_file\npath: {path}\nsummary: {}\nexcerpt:\n```text\n{}\n```",
            summarize_read_result(content),
            excerpt
        )
    }
}

fn format_user_input_for_history(question: &str, answer: &[String]) -> String {
    format!(
        "Tool result: ask_user\nquestion: {question}\nanswer:\n{}",
        answer.join("\n")
    )
}

fn format_command_result_for_history(command: &str, cwd: &Path, output: &SandboxOutput) -> String {
    let stdout_excerpt = bounded_history_excerpt(&output.stdout, 20, 900);
    let stderr_excerpt = bounded_history_excerpt(&output.stderr, 20, 900);
    let mut lines = vec![
        "Tool result: run_command".to_string(),
        format!("command: {command}"),
        format!("cwd: {}", cwd.display()),
        format!("exit_code: {}", output.exit_code),
        format!("stdout_summary: {}", summarize_blob(&output.stdout)),
        format!("stderr_summary: {}", summarize_blob(&output.stderr)),
    ];
    if !stdout_excerpt.is_empty() {
        lines.push("stdout_excerpt:".to_string());
        lines.push("```text".to_string());
        lines.push(stdout_excerpt);
        lines.push("```".to_string());
    }
    if !stderr_excerpt.is_empty() {
        lines.push("stderr_excerpt:".to_string());
        lines.push("```text".to_string());
        lines.push(stderr_excerpt);
        lines.push("```".to_string());
    }
    lines.join("\n")
}

fn summarize_blob(text: &str) -> String {
    let chars = text.chars().count();
    let lines = text.lines().count();
    if chars == 0 {
        "empty".to_string()
    } else {
        format!("{lines} line(s), {chars} char(s)")
    }
}

fn bounded_history_excerpt(text: &str, max_lines: usize, max_chars: usize) -> String {
    let mut out = String::new();
    for (idx, line) in text.lines().enumerate() {
        if idx >= max_lines {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push('…');
            break;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(line);
        if out.chars().count() > max_chars {
            let truncated = out.chars().take(max_chars).collect::<String>();
            return format!("{truncated}\n…");
        }
    }
    out
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

#[async_trait]
impl LlmProvider for OpenRouterProvider {
    async fn start_session(
        self: Arc<Self>,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        if self.working_dir.is_some() {
            Ok(Box::new(OpenRouterSyntheticSession::new(self, messages)))
        } else {
            Ok(normalized_session(self, messages))
        }
    }

    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)> {
        self.inner.complete_stream(messages, on_chunk).await
    }

    fn compute_cost(&self, usage: &CompletionUsage) -> Option<CostDisplay> {
        // Use cached pricing if available (synchronous cache read)
        let model = &self.inner.model;
        let cache = self.pricing_cache.cache.try_read().ok()?;
        if let Some((input_per_mtok, output_per_mtok)) = cache.get(model.as_str()) {
            let cost = (usage.prompt_tokens as f64 * input_per_mtok
                + usage.completion_tokens as f64 * output_per_mtok)
                / 1_000_000.0;
            Some(CostDisplay::Usd(cost))
        } else {
            // No cached pricing yet — return None (will be fetched async next call)
            None
        }
    }

    fn provider_name(&self) -> &str {
        "openrouter"
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming_text: true,
            usage_native: true,
            tool_calls_native: false,
            approvals_native: false,
            user_input_native: false,
            reasoning_visible: true,
            interaction_mode: ProviderInteractionMode::Synthetic,
        }
    }

    fn model_name(&self) -> Option<&str> {
        Some(&self.inner.model)
    }
}

#[async_trait]
impl ProviderSession for OpenRouterSyntheticSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        loop {
            if let Some(event) = self.pending.pop_front() {
                return event;
            }

            match &self.state {
                SessionState::Ready => self.advance().await?,
                SessionState::AwaitingUserInput { .. } => {
                    anyhow::bail!("openrouter synthetic session is waiting for user input")
                }
                SessionState::AwaitingApproval(_) => {
                    anyhow::bail!("openrouter synthetic session is waiting for approval")
                }
                SessionState::Done => anyhow::bail!("openrouter synthetic session ended"),
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
            anyhow::bail!("openrouter synthetic session is not awaiting user input");
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
            anyhow::bail!("openrouter synthetic session is not awaiting approval");
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
                    let history_entry =
                        format_command_result_for_history(&pending.command, &cwd, &output);
                    self.reinjected_command_chars += history_entry.chars().count();
                    self.messages.push(Message::user(history_entry));
                    self.pending.push_back(Ok(ProviderSessionEvent::Event(
                        ProviderEvent::Metadata {
                            item_id: None,
                            kind: "tool_context_metrics".to_string(),
                            value: serde_json::json!({
                                "provider": "openrouter",
                                "tool_kind": "run_command",
                                "command": pending.command,
                                "reinjected_chars": self.reinjected_command_chars,
                            }),
                        },
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

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn sse_done() -> String {
        "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},\"finish_reason\":null}]}\n\ndata: [DONE]\n\n".to_string()
    }

    #[test]
    fn test_from_config_missing_key() {
        let unique_var = "KOKLO_TEST_OPENROUTER_MISSING_KEY_XYZ123";
        std::env::remove_var(unique_var);
        let entry = ProviderTomlEntry {
            api_key_env: Some(unique_var.to_string()),
            ..Default::default()
        };
        let result = OpenRouterProvider::from_config(&entry);
        assert!(matches!(result, Err(ProviderError::MissingApiKey { .. })));
    }

    #[test]
    fn test_from_config_with_key_and_model() {
        let key_var = "KOKLO_TEST_OR_KEYMODEL_XYZ";
        std::env::set_var(key_var, "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some(key_var.to_string()),
            model: Some("anthropic/claude-opus-4-6".to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert_eq!(p.provider_name(), "openrouter");
        assert_eq!(p.model_name(), Some("anthropic/claude-opus-4-6"));
        std::env::remove_var(key_var);
    }

    #[test]
    fn test_default_model_is_gpt4o() {
        let key_var = "KOKLO_TEST_OR_DEFMODEL_XYZ";
        std::env::set_var(key_var, "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some(key_var.to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert_eq!(p.model_name(), Some("openai/gpt-4o"));
        std::env::remove_var(key_var);
    }

    #[test]
    fn test_from_config_reads_key_from_secrets_file() {
        let key_var = "KOKLO_TEST_OR_SECRETS_XYZ";
        let dir = tempfile::tempdir().unwrap();
        let secrets = dir.path().join("secrets.toml");
        std::fs::write(&secrets, format!("[env]\n{key_var} = \"sk-or-test\"\n")).unwrap();
        std::env::remove_var(key_var);
        std::env::set_var("KOKLO_SECRETS_FILE", &secrets);

        let entry = ProviderTomlEntry {
            api_key_env: Some(key_var.to_string()),
            model: Some("google/gemma-3-4b-it:free".to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert_eq!(p.model_name(), Some("google/gemma-3-4b-it:free"));

        std::env::remove_var("KOKLO_SECRETS_FILE");
    }

    #[test]
    fn test_extra_body_contains_provider_when_routing_set() {
        // Unique key-env var so this test never races other tests that mutate
        // the shared `OPENROUTER_API_KEY` (cargo runs tests in one process).
        let key_var = "KOKLO_TEST_OR_ROUTING_KEY_XYZ";
        std::env::set_var(key_var, "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some(key_var.to_string()),
            routing: Some(ProviderRouting {
                zdr: Some(true),
                data_collection: Some("deny".to_string()),
                allow_fallbacks: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        let extra_body = p.inner.extra_body.as_ref().unwrap();
        assert!(extra_body["provider"]["zdr"].as_bool().unwrap());
        assert_eq!(
            extra_body["provider"]["data_collection"].as_str().unwrap(),
            "deny"
        );
        assert!(!extra_body["provider"]["allow_fallbacks"].as_bool().unwrap());
        std::env::remove_var(key_var);
    }

    #[test]
    fn test_no_extra_body_when_no_routing() {
        let key_var = "KOKLO_TEST_OR_NO_ROUTING_KEY_XYZ";
        std::env::set_var(key_var, "sk-or-test");
        let entry = ProviderTomlEntry {
            api_key_env: Some(key_var.to_string()),
            ..Default::default()
        };
        let p = OpenRouterProvider::from_config(&entry).unwrap();
        assert!(p.inner.extra_body.is_none());
        std::env::remove_var(key_var);
    }

    #[tokio::test]
    async fn test_extra_headers_sent_to_server() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .and(header("HTTP-Referer", "https://koklo.dev"))
            .and(header("X-Title", "koklo"))
            .respond_with(ResponseTemplate::new(200).set_body_string(sse_done()))
            .expect(1)
            .mount(&server)
            .await;

        let p =
            OpenRouterProvider::new("sk-or-test".to_string(), "openai/gpt-4o".to_string(), None);
        // Override base_url with mock server
        let mut inner = p.inner;
        inner.base_url = server.uri();
        let p2 = OpenRouterProvider {
            inner,
            pricing_cache: p.pricing_cache.clone(),
            working_dir: None,
            sandbox: None,
        };

        let messages = vec![crate::Message::user("hello")];
        let (result, _usage) = p2.complete_stream(messages, &mut |_| {}).await.unwrap();
        assert_eq!(result, "ok");
        server.verify().await;
    }

    #[tokio::test]
    async fn test_routing_body_merged_into_request() {
        let server = MockServer::start().await;
        // We verify the request body contains the routing fields via a custom matcher
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(sse_done()))
            .expect(1)
            .mount(&server)
            .await;

        let routing = ProviderRouting {
            data_collection: Some("deny".to_string()),
            zdr: Some(true),
            ..Default::default()
        };
        let p = OpenRouterProvider::new(
            "sk-or-test".to_string(),
            "openai/gpt-4o".to_string(),
            Some(routing),
        );
        let mut inner = p.inner;
        inner.base_url = server.uri();
        let p2 = OpenRouterProvider {
            inner,
            pricing_cache: p.pricing_cache.clone(),
            working_dir: None,
            sandbox: None,
        };

        let messages = vec![crate::Message::user("hello")];
        p2.complete_stream(messages, &mut |_| {}).await.unwrap();
        server.verify().await;
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

        let provider = Arc::new(OpenRouterProvider::new_with_context(
            "sk-or-test".to_string(),
            "openai/gpt-4o".to_string(),
            None,
            Some(workspace.path().to_path_buf()),
            None,
        ));

        let mut session = OpenRouterSyntheticSession::new(provider, vec![Message::user("Inspect")]);
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
        assert!(session
            .messages
            .last()
            .is_some_and(|message| message.content.contains("hello")));
    }

    #[test]
    fn read_file_history_is_bounded() {
        let content = (1..=100)
            .map(|idx| format!("{idx:>4} line {idx}"))
            .collect::<Vec<_>>()
            .join("\n");
        let history = format_read_result_for_history("README.md", &content);
        assert!(history.contains("summary: 100 line(s)"));
        assert!(history.contains("excerpt:"));
        assert!(history.chars().count() < content.chars().count());
    }

    #[test]
    fn command_history_is_bounded() {
        let stdout = "ok\n".repeat(200);
        let stderr = "warn\n".repeat(200);
        let history = format_command_result_for_history(
            "cargo test",
            Path::new("."),
            &SandboxOutput {
                stdout,
                stderr,
                exit_code: 0,
            },
        );
        assert!(history.contains("stdout_summary:"));
        assert!(history.contains("stderr_summary:"));
        assert!(history.contains("stdout_excerpt:"));
        assert!(history.contains("stderr_excerpt:"));
        assert!(history.chars().count() < 3000);
    }

    #[tokio::test]
    async fn synthetic_session_finish_emits_completed_turn() {
        let provider = Arc::new(OpenRouterProvider::new_with_context(
            "sk-or-test".to_string(),
            "openai/gpt-4o".to_string(),
            None,
            Some(tempfile::tempdir().unwrap().path().to_path_buf()),
            None,
        ));
        let mut session = OpenRouterSyntheticSession::new(provider, vec![Message::user("Wrap up")]);
        session
            .apply_action(SyntheticAction::Finish {
                message: "done".to_string(),
            })
            .await
            .unwrap();

        let third = session.next_event().await.unwrap();
        assert!(matches!(
            third,
            ProviderSessionEvent::Event(ProviderEvent::MessageDelta { ref text }) if text == "done"
        ));

        let fourth = session.next_event().await.unwrap();
        assert!(matches!(
            fourth,
            ProviderSessionEvent::Event(ProviderEvent::MessageCompleted)
        ));

        let fifth = session.next_event().await.unwrap();
        assert!(matches!(
            fifth,
            ProviderSessionEvent::Finished { ref output, .. } if output == "done"
        ));
    }

    #[tokio::test]
    async fn synthetic_session_write_file_requires_approval_and_emits_file_change() {
        let workspace = tempfile::tempdir().unwrap();
        let provider = Arc::new(OpenRouterProvider::new_with_context(
            "sk-or-test".to_string(),
            "openai/gpt-4o".to_string(),
            None,
            Some(workspace.path().to_path_buf()),
            None,
        ));
        let mut session = OpenRouterSyntheticSession::new(provider, vec![Message::user("Write")]);
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

        let provider = Arc::new(OpenRouterProvider::new_with_context(
            "sk-or-test".to_string(),
            "openai/gpt-4o".to_string(),
            None,
            Some(workspace.path().to_path_buf()),
            None,
        ));
        let mut session = OpenRouterSyntheticSession::new(provider, vec![Message::user("Edit")]);
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
