//! OpenAI Codex CLI provider (subprocess, real-time streaming).
use super::{check_claude_session, flatten_messages_to_prompt, CliMode};
use crate::config::ProviderTomlEntry;
use crate::error::ProviderError;
use crate::{
    CommandDetails, FileChangeDetails, FileChangeEntry, LlmProvider, Message,
    ProviderApprovalDecision, ProviderApprovalKind, ProviderApprovalPayload, ProviderCapabilities,
    ProviderEvent, ProviderInteractionMode, ProviderSession, ProviderSessionEvent, StreamChunk,
    UserInputPayload,
};
use anyhow::Result;
use async_trait::async_trait;
use koklo_events::{CompletionUsage, UserInputQuestion};
use koklo_shell::Sandbox;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{mpsc, oneshot, Mutex};

pub struct CodexCliProvider {
    #[allow(dead_code)] // used when `pty` feature is enabled
    mode: CliMode,
    working_dir: Option<PathBuf>,
    sandbox: Option<Arc<dyn Sandbox>>,
}

impl CodexCliProvider {
    pub fn from_config(_entry: &ProviderTomlEntry) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: None,
            sandbox: None,
        })
    }

    pub fn with_working_dir(working_dir: PathBuf) -> Result<Self, ProviderError> {
        Self::validate_install()?;
        Ok(Self {
            mode: CliMode::detect_from_env(),
            working_dir: Some(working_dir),
            sandbox: None,
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
        })
    }

    fn validate_install() -> Result<(), ProviderError> {
        which::which("codex").map_err(|_| ProviderError::CliNotInstalled {
            name: "codex".to_string(),
            install_hint:
                "Install from: https://github.com/openai/codex or `npm install -g @openai/codex`"
                    .to_string(),
        })?;
        Ok(())
    }

    #[allow(dead_code)] // used by PTY mode / future home-dir resolution
    fn resolve_home_dir() -> Result<PathBuf, ProviderError> {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(PathBuf::from)
            .map_err(|_| ProviderError::Config("HOME/USERPROFILE env var not set".to_string()))
    }

    fn build_exec_args(prompt: String) -> Vec<String> {
        vec![
            "exec".to_string(),
            "--json".to_string(),
            "--ephemeral".to_string(),
            prompt,
        ]
    }

    fn build_app_server_args() -> Vec<String> {
        vec![
            "app-server".to_string(),
            "--listen".to_string(),
            "stdio://".to_string(),
            "--session-source".to_string(),
            "cli".to_string(),
        ]
    }

    async fn spawn_app_server_session(
        &self,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        let mut command = tokio::process::Command::new("codex");
        command
            .args(Self::build_app_server_args())
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

        let pending_responses = Arc::new(Mutex::new(HashMap::<
            String,
            oneshot::Sender<Result<Value>>,
        >::new()));
        let pending_user_inputs =
            Arc::new(Mutex::new(HashMap::<String, CodexPendingUserInput>::new()));
        let pending_approvals =
            Arc::new(Mutex::new(HashMap::<String, CodexPendingApproval>::new()));
        let next_id = Arc::new(AtomicU64::new(1));
        let (sender, receiver) = mpsc::unbounded_channel::<Result<ProviderSessionEvent>>();

        let stderr_handle = tokio::spawn(async move {
            let mut buf = String::new();
            BufReader::new(stderr).read_to_string(&mut buf).await.ok();
            buf
        });

        tokio::spawn(run_codex_app_server_stdout(
            stdout,
            sender,
            Arc::clone(&pending_responses),
            Arc::clone(&pending_user_inputs),
            Arc::clone(&pending_approvals),
            stderr_handle,
        ));

        let session = CodexAppServerSession {
            stdin: Mutex::new(stdin),
            child,
            receiver,
            pending_responses,
            pending_user_inputs,
            pending_approvals,
            next_id,
            thread_id: Mutex::new(None),
        };

        session
            .send_request(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "koklo",
                        "version": env!("CARGO_PKG_VERSION"),
                    },
                    "capabilities": {
                        "experimentalApi": true,
                    },
                }),
            )
            .await?;

        let thread = session
            .send_request(
                "thread/start",
                json!({
                    "approvalPolicy": "untrusted",
                    "cwd": self.working_dir.as_ref().map(|dir| dir.display().to_string()),
                    "ephemeral": true,
                    "personality": "pragmatic",
                    "sandbox": "workspace-write",
                }),
            )
            .await?;
        let thread_id = thread
            .get("thread")
            .and_then(|value| value.get("id"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                ProviderError::Config("Codex app-server did not return a thread id".to_string())
            })?
            .to_string();
        *session.thread_id.lock().await = Some(thread_id.clone());

        session
            .send_request(
                "turn/start",
                json!({
                    "threadId": thread_id,
                    "input": [
                        {
                            "type": "text",
                            "text": flatten_messages_to_prompt(&messages),
                        }
                    ],
                }),
            )
            .await?;

        Ok(Box::new(session))
    }
}

#[derive(Default)]
struct CodexTurnState {
    output: String,
    usage: Option<CompletionUsage>,
}

struct CodexPendingUserInput {
    rpc_id: Value,
    question_ids: Vec<String>,
}

enum CodexPendingApprovalKind {
    CommandExecution,
    FileChange,
    Permissions { permissions: Value },
    PatchApply,
    ExecCommand,
}

struct CodexPendingApproval {
    rpc_id: Value,
    kind: CodexPendingApprovalKind,
}

struct CodexAppServerSession {
    stdin: Mutex<ChildStdin>,
    child: Arc<Mutex<Child>>,
    receiver: mpsc::UnboundedReceiver<Result<ProviderSessionEvent>>,
    pending_responses: Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value>>>>>,
    pending_user_inputs: Arc<Mutex<HashMap<String, CodexPendingUserInput>>>,
    pending_approvals: Arc<Mutex<HashMap<String, CodexPendingApproval>>>,
    next_id: Arc<AtomicU64>,
    thread_id: Mutex<Option<String>>,
}

impl CodexAppServerSession {
    async fn send_request(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();
        let (tx, rx) = oneshot::channel();
        self.pending_responses.lock().await.insert(id.clone(), tx);

        let line = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        })
        .to_string();

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(ProviderError::Io)?;
        stdin.write_all(b"\n").await.map_err(ProviderError::Io)?;
        stdin.flush().await.map_err(ProviderError::Io)?;
        drop(stdin);

        rx.await
            .map_err(|_| anyhow::anyhow!("Codex app-server request channel closed"))?
    }

    async fn send_response(&self, id: Value, result: Value) -> Result<()> {
        let line = json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
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
impl ProviderSession for CodexAppServerSession {
    async fn next_event(&mut self) -> Result<ProviderSessionEvent> {
        match self.receiver.recv().await {
            Some(result) => result,
            None => anyhow::bail!("codex app-server session ended unexpectedly"),
        }
    }

    async fn send_user_input(&mut self, input: UserInputPayload) -> Result<()> {
        let Some(request_key) = input.request_id else {
            anyhow::bail!("missing codex user-input request id")
        };
        let Some(pending) = self.pending_user_inputs.lock().await.remove(&request_key) else {
            anyhow::bail!("unknown codex user-input request id: {}", request_key)
        };

        let answers = input
            .answers
            .into_iter()
            .zip(pending.question_ids)
            .map(|(answer, question_id)| {
                (
                    question_id,
                    json!({
                        "answers": [answer],
                    }),
                )
            })
            .collect::<serde_json::Map<_, _>>();

        self.send_response(pending.rpc_id, json!({ "answers": answers }))
            .await
    }

    async fn resolve_approval(&mut self, approval: ProviderApprovalPayload) -> Result<()> {
        let Some(request_key) = approval.request_id else {
            anyhow::bail!("missing codex approval request id")
        };
        let Some(pending) = self.pending_approvals.lock().await.remove(&request_key) else {
            anyhow::bail!("unknown codex approval request id: {}", request_key)
        };

        let result = match pending.kind {
            CodexPendingApprovalKind::CommandExecution => json!({
                "decision": match approval.decision {
                    ProviderApprovalDecision::Approve => "accept",
                    ProviderApprovalDecision::Reject | ProviderApprovalDecision::Edit { .. } => "decline",
                }
            }),
            CodexPendingApprovalKind::FileChange => json!({
                "decision": match approval.decision {
                    ProviderApprovalDecision::Approve => "accept",
                    ProviderApprovalDecision::Reject | ProviderApprovalDecision::Edit { .. } => "decline",
                }
            }),
            CodexPendingApprovalKind::Permissions { permissions } => {
                let granted = match approval.decision {
                    ProviderApprovalDecision::Approve => permissions,
                    ProviderApprovalDecision::Reject | ProviderApprovalDecision::Edit { .. } => {
                        json!({})
                    }
                };
                json!({
                    "permissions": granted,
                    "scope": "turn",
                })
            }
            CodexPendingApprovalKind::PatchApply | CodexPendingApprovalKind::ExecCommand => json!({
                "decision": match approval.decision {
                    ProviderApprovalDecision::Approve => "approved",
                    ProviderApprovalDecision::Reject | ProviderApprovalDecision::Edit { .. } => "denied",
                }
            }),
        };

        self.send_response(pending.rpc_id, result).await
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

async fn run_codex_app_server_stdout(
    stdout: tokio::process::ChildStdout,
    sender: mpsc::UnboundedSender<Result<ProviderSessionEvent>>,
    pending_responses: Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value>>>>>,
    pending_user_inputs: Arc<Mutex<HashMap<String, CodexPendingUserInput>>>,
    pending_approvals: Arc<Mutex<HashMap<String, CodexPendingApproval>>>,
    stderr_handle: tokio::task::JoinHandle<String>,
) {
    let mut lines = BufReader::new(stdout).lines();
    let mut turns = HashMap::<String, CodexTurnState>::new();

    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let trimmed = line.trim();
                if trimmed.is_empty() || !trimmed.starts_with('{') {
                    continue;
                }

                let Ok(message) = serde_json::from_str::<Value>(trimmed) else {
                    continue;
                };

                if let Some(id) = message.get("id") {
                    if let Some(method) = message.get("method").and_then(|value| value.as_str()) {
                        handle_codex_server_request(
                            method,
                            id.clone(),
                            message.get("params").cloned().unwrap_or_else(|| json!({})),
                            &sender,
                            &pending_user_inputs,
                            &pending_approvals,
                        )
                        .await;
                        continue;
                    }

                    let request_id = id_to_key(id);
                    let result = if let Some(error) = message.get("error") {
                        Err(anyhow::anyhow!("Codex app-server error: {}", error))
                    } else {
                        Ok(message.get("result").cloned().unwrap_or_else(|| json!({})))
                    };
                    if let Some(tx) = pending_responses.lock().await.remove(&request_id) {
                        let _ = tx.send(result);
                    }
                    continue;
                }

                if let Some(method) = message.get("method").and_then(|value| value.as_str()) {
                    handle_codex_notification(
                        method,
                        message.get("params").cloned().unwrap_or_else(|| json!({})),
                        &sender,
                        &mut turns,
                    );
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
            auth_command: "codex login".to_string(),
        }
        .into()));
    } else if !stderr_content.trim().is_empty() {
        let _ = sender.send(Err(ProviderError::HttpError {
            status: 1,
            body: stderr_content,
        }
        .into()));
    }
}

fn id_to_key(id: &Value) -> String {
    match id {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

async fn handle_codex_server_request(
    method: &str,
    rpc_id: Value,
    params: Value,
    sender: &mpsc::UnboundedSender<Result<ProviderSessionEvent>>,
    pending_user_inputs: &Arc<Mutex<HashMap<String, CodexPendingUserInput>>>,
    pending_approvals: &Arc<Mutex<HashMap<String, CodexPendingApproval>>>,
) {
    match method {
        "item/tool/requestUserInput" => {
            if let Some((item_id, question_ids, questions)) =
                parse_codex_user_input_request(&params)
            {
                pending_user_inputs.lock().await.insert(
                    item_id.clone(),
                    CodexPendingUserInput {
                        rpc_id,
                        question_ids,
                    },
                );
                let _ = sender.send(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::UserInputRequest {
                        item_id: Some(item_id),
                        questions,
                    },
                )));
            }
        }
        "item/commandExecution/requestApproval"
        | "item/fileChange/requestApproval"
        | "item/permissions/requestApproval"
        | "applyPatchApproval"
        | "execCommandApproval" => {
            if let Some(request) = parse_codex_approval_request(method, &params) {
                pending_approvals.lock().await.insert(
                    request.request_id.clone(),
                    CodexPendingApproval {
                        rpc_id,
                        kind: request.pending_kind,
                    },
                );
                let _ = sender.send(Ok(ProviderSessionEvent::Event(
                    ProviderEvent::ApprovalRequest {
                        item_id: request.item_id,
                        request_id: request.request_id,
                        kind: request.kind,
                        description: request.description,
                        details: request.details,
                    },
                )));
            }
        }
        _ => {}
    }
}

struct CodexApprovalRequest {
    request_id: String,
    item_id: Option<String>,
    kind: ProviderApprovalKind,
    pending_kind: CodexPendingApprovalKind,
    description: String,
    details: Value,
}

fn handle_codex_notification(
    method: &str,
    params: Value,
    sender: &mpsc::UnboundedSender<Result<ProviderSessionEvent>>,
    turns: &mut HashMap<String, CodexTurnState>,
) {
    match method {
        "agentMessage/delta" | "item/agentMessage/delta" => {
            let Some(turn_id) = params.get("turnId").and_then(|value| value.as_str()) else {
                return;
            };
            let Some(delta) = params.get("delta").and_then(|value| value.as_str()) else {
                return;
            };
            turns
                .entry(turn_id.to_string())
                .or_default()
                .output
                .push_str(delta);
            let _ = sender.send(Ok(ProviderSessionEvent::Event(
                ProviderEvent::MessageDelta {
                    text: delta.to_string(),
                },
            )));
        }
        "reasoningText/delta"
        | "reasoningSummaryText/delta"
        | "item/reasoning/textDelta"
        | "item/reasoning/summaryTextDelta" => {
            if let (Some(item_id), Some(delta)) = (
                params.get("itemId").and_then(|value| value.as_str()),
                params.get("delta").and_then(|value| value.as_str()),
            ) {
                let _ = sender.send(Ok(ProviderSessionEvent::Event(ProviderEvent::Reasoning {
                    item_id: Some(item_id.to_string()),
                    text: delta.to_string(),
                })));
            }
        }
        "plan/delta" | "item/plan/delta" => {
            if let Some(delta) = params.get("delta").and_then(|value| value.as_str()) {
                let item_id = params
                    .get("itemId")
                    .and_then(|value| value.as_str())
                    .map(str::to_string);
                let _ = sender.send(Ok(ProviderSessionEvent::Event(ProviderEvent::Plan {
                    item_id,
                    text: delta.to_string(),
                })));
            }
        }
        "turn/planUpdated" | "turn/plan/updated" => {
            let item_id = params
                .get("itemId")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            let plan_text = params
                .get("delta")
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .or_else(|| format_plan_from_steps(params.get("plan")));
            if let Some(text) = plan_text.filter(|text| !text.trim().is_empty()) {
                let _ = sender.send(Ok(ProviderSessionEvent::Event(ProviderEvent::Plan {
                    item_id,
                    text,
                })));
            }
        }
        "commandExecution/outputDelta"
        | "command/exec/outputDelta"
        | "item/commandExecution/outputDelta" => {
            if let (Some(item_id), Some(delta)) = (
                params.get("itemId").and_then(|value| value.as_str()),
                params.get("delta").and_then(|value| value.as_str()),
            ) {
                let _ = sender.send(Ok(ProviderSessionEvent::Event(ProviderEvent::Command {
                    item_id: Some(item_id.to_string()),
                    command: item_id.to_string(),
                    status: "updated".to_string(),
                    exit_code: None,
                    output: Some(delta.to_string()),
                    details: Some(CommandDetails {
                        aggregated_output: Some(delta.to_string()),
                        ..CommandDetails::default()
                    }),
                })));
            }
        }
        "item/fileChange/outputDelta" => {
            if let (Some(item_id), Some(delta)) = (
                params.get("itemId").and_then(|value| value.as_str()),
                params.get("delta").and_then(|value| value.as_str()),
            ) {
                let summary = delta.trim();
                if summary.is_empty() {
                    return;
                }
                let _ = sender.send(Ok(ProviderSessionEvent::Event(ProviderEvent::FileChange {
                    item_id: Some(item_id.to_string()),
                    summary: summary.to_string(),
                    files: Vec::new(),
                    status: "updated".to_string(),
                    details: Some(FileChangeDetails {
                        delta: Some(summary.to_string()),
                        ..FileChangeDetails::default()
                    }),
                })));
            }
        }
        "item/started" | "item/completed" => {
            if let Some(item) = params.get("item").cloned() {
                let event_type = if method == "item/started" {
                    "item.started"
                } else {
                    "item.completed"
                };
                if let Ok(item) = serde_json::from_value::<CodexExecItem>(item) {
                    for event in parse_codex_item_event(event_type, item) {
                        let _ = sender.send(Ok(ProviderSessionEvent::Event(event)));
                    }
                }
            }
        }
        "thread/tokenUsage/updated" => {
            if let (Some(turn_id), Some(last)) = (
                params.get("turnId").and_then(|value| value.as_str()),
                params.get("tokenUsage").and_then(|value| value.get("last")),
            ) {
                turns.entry(turn_id.to_string()).or_default().usage = Some(CompletionUsage {
                    prompt_tokens: last
                        .get("inputTokens")
                        .and_then(|value| value.as_u64())
                        .unwrap_or_default() as u32,
                    completion_tokens: last
                        .get("outputTokens")
                        .and_then(|value| value.as_u64())
                        .unwrap_or_default() as u32,
                });
            }
        }
        "turn/completed" => {
            let Some(turn_id) = params
                .get("turn")
                .and_then(|value| value.get("id"))
                .and_then(|value| value.as_str())
                .or_else(|| params.get("turnId").and_then(|value| value.as_str()))
            else {
                return;
            };
            let state = turns.remove(turn_id).unwrap_or_default();
            let _ = sender.send(Ok(ProviderSessionEvent::Finished {
                output: state.output,
                usage: state.usage.unwrap_or_default(),
            }));
        }
        _ => {}
    }
}

fn parse_codex_approval_request(method: &str, params: &Value) -> Option<CodexApprovalRequest> {
    match method {
        "item/commandExecution/requestApproval" => {
            let item_id = params.get("itemId")?.as_str()?.to_string();
            let request_id = params
                .get("approvalId")
                .and_then(|value| value.as_str())
                .unwrap_or(&item_id)
                .to_string();
            let command = params
                .get("command")
                .and_then(|value| value.as_str())
                .unwrap_or("unknown command");
            let description = params
                .get("reason")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .map(|reason| format!("Approve Codex command: {command}\nReason: {reason}"))
                .unwrap_or_else(|| format!("Approve Codex command: {command}"));
            Some(CodexApprovalRequest {
                request_id,
                item_id: Some(item_id),
                kind: ProviderApprovalKind::CommandExecution,
                pending_kind: CodexPendingApprovalKind::CommandExecution,
                description,
                details: json!({
                    "method": method,
                    "command": params.get("command").cloned(),
                    "cwd": params.get("cwd").cloned(),
                    "reason": params.get("reason").cloned(),
                    "command_actions": params.get("commandActions").cloned(),
                }),
            })
        }
        "item/fileChange/requestApproval" => {
            let item_id = params.get("itemId")?.as_str()?.to_string();
            let request_id = item_id.clone();
            let description = params
                .get("reason")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .map(|reason| format!("Approve Codex file change request\nReason: {reason}"))
                .unwrap_or_else(|| "Approve Codex file change request".to_string());
            Some(CodexApprovalRequest {
                request_id,
                item_id: Some(item_id),
                kind: ProviderApprovalKind::FileChange,
                pending_kind: CodexPendingApprovalKind::FileChange,
                description,
                details: json!({
                    "method": method,
                    "grant_root": params.get("grantRoot").cloned(),
                    "reason": params.get("reason").cloned(),
                }),
            })
        }
        "item/permissions/requestApproval" => {
            let item_id = params.get("itemId")?.as_str()?.to_string();
            let request_id = item_id.clone();
            let permissions = params.get("permissions")?.clone();
            let description = params
                .get("reason")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .map(|reason| format!("Grant additional Codex permissions\nReason: {reason}"))
                .unwrap_or_else(|| "Grant additional Codex permissions".to_string());
            Some(CodexApprovalRequest {
                request_id,
                item_id: Some(item_id),
                kind: ProviderApprovalKind::Permissions,
                pending_kind: CodexPendingApprovalKind::Permissions {
                    permissions: permissions.clone(),
                },
                description,
                details: json!({
                    "method": method,
                    "permissions": permissions,
                    "reason": params.get("reason").cloned(),
                }),
            })
        }
        "applyPatchApproval" => {
            let call_id = params.get("callId")?.as_str()?.to_string();
            let description = params
                .get("reason")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .map(|reason| format!("Approve Codex patch application\nReason: {reason}"))
                .unwrap_or_else(|| "Approve Codex patch application".to_string());
            Some(CodexApprovalRequest {
                request_id: call_id.clone(),
                item_id: Some(call_id),
                kind: ProviderApprovalKind::PatchApply,
                pending_kind: CodexPendingApprovalKind::PatchApply,
                description,
                details: json!({
                    "method": method,
                    "file_changes": params.get("fileChanges").cloned(),
                    "grant_root": params.get("grantRoot").cloned(),
                    "reason": params.get("reason").cloned(),
                }),
            })
        }
        "execCommandApproval" => {
            let call_id = params.get("callId")?.as_str()?.to_string();
            let command = params
                .get("command")
                .and_then(|value| value.as_array())
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|part| part.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|text| !text.is_empty())
                .unwrap_or_else(|| "unknown command".to_string());
            let description = params
                .get("reason")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .map(|reason| format!("Approve Codex command: {command}\nReason: {reason}"))
                .unwrap_or_else(|| format!("Approve Codex command: {command}"));
            Some(CodexApprovalRequest {
                request_id: params
                    .get("approvalId")
                    .and_then(|value| value.as_str())
                    .unwrap_or(&call_id)
                    .to_string(),
                item_id: Some(call_id),
                kind: ProviderApprovalKind::CommandExecution,
                pending_kind: CodexPendingApprovalKind::ExecCommand,
                description,
                details: json!({
                    "method": method,
                    "command": params.get("command").cloned(),
                    "cwd": params.get("cwd").cloned(),
                    "reason": params.get("reason").cloned(),
                    "parsed_cmd": params.get("parsedCmd").cloned(),
                }),
            })
        }
        _ => None,
    }
}

fn parse_codex_user_input_request(
    params: &Value,
) -> Option<(String, Vec<String>, Vec<UserInputQuestion>)> {
    let item_id = params.get("itemId")?.as_str()?.to_string();
    let questions = params
        .get("questions")?
        .as_array()?
        .iter()
        .filter_map(|question| {
            Some(UserInputQuestion {
                id: question.get("id")?.as_str()?.to_string(),
                header: question.get("header")?.as_str()?.to_string(),
                question: question.get("question")?.as_str()?.to_string(),
                options: question.get("options").and_then(|options| {
                    options.as_array().map(|items| {
                        items
                            .iter()
                            .filter_map(|option| {
                                option
                                    .get("label")
                                    .and_then(|value| value.as_str())
                                    .map(str::to_string)
                            })
                            .collect::<Vec<_>>()
                    })
                }),
                is_secret: question
                    .get("isSecret")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false),
            })
        })
        .collect::<Vec<_>>();
    if questions.is_empty() {
        return None;
    }
    let question_ids = questions
        .iter()
        .map(|question| question.id.clone())
        .collect();
    Some((item_id, question_ids, questions))
}

#[derive(Debug, Deserialize)]
struct CodexExecEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    item: Option<CodexExecItem>,
    #[serde(default)]
    usage: Option<CodexUsage>,
}

#[derive(Debug, Deserialize)]
struct CodexUsage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct CodexExecItem {
    #[serde(default)]
    id: Option<String>,
    #[serde(rename = "type")]
    item_type: String,
    #[serde(flatten)]
    rest: Value,
}

fn parse_command_text_and_argv(command: Option<&Value>) -> (String, Vec<String>) {
    if let Some(parts) = command.and_then(Value::as_array) {
        let argv = parts
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect::<Vec<_>>();
        let text = if argv.is_empty() {
            "command".to_string()
        } else {
            argv.join(" ")
        };
        return (text, argv);
    }

    let text = command
        .and_then(Value::as_str)
        .unwrap_or("command")
        .to_string();
    let argv = shell_words::split(&text).unwrap_or_default();
    (text, argv)
}

fn parse_file_change_details(changes: Option<&Value>) -> Option<FileChangeDetails> {
    let entries = changes
        .and_then(Value::as_array)
        .map(|changes| {
            changes
                .iter()
                .map(|change| FileChangeEntry {
                    path: change
                        .get("path")
                        .or_else(|| change.get("filePath"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    kind: change
                        .get("kind")
                        .or_else(|| change.get("status"))
                        .or_else(|| change.get("action"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    patch: change
                        .get("patch")
                        .or_else(|| change.get("diff"))
                        .or_else(|| change.get("unifiedDiff"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    lines: collect_change_text_lines(
                        change.get("lines").or_else(|| change.get("preview")),
                    ),
                    added: collect_change_text_lines(change.get("added")),
                    removed: collect_change_text_lines(change.get("removed")),
                    summary: change
                        .get("summary")
                        .or_else(|| change.get("description"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if entries.is_empty() {
        None
    } else {
        Some(FileChangeDetails {
            changes: entries,
            ..FileChangeDetails::default()
        })
    }
}

fn collect_change_text_lines(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.as_str()
                        .map(str::to_string)
                        .or_else(|| item.get("text").and_then(Value::as_str).map(str::to_string))
                        .or_else(|| item.get("line").and_then(Value::as_str).map(str::to_string))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_codex_exec_output(stdout: &str) -> Result<String, ProviderError> {
    let mut last_message = None;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            continue;
        }

        let Ok(event) = serde_json::from_str::<CodexExecEvent>(trimmed) else {
            continue;
        };

        if event.event_type != "item.completed" {
            continue;
        }

        if let Some(item) = event.item {
            if matches!(item.item_type.as_str(), "agent_message" | "agentMessage") {
                if let Some(text) = item
                    .rest
                    .get("text")
                    .and_then(|value| value.as_str())
                    .filter(|text| !text.trim().is_empty())
                {
                    last_message = Some(text.to_string());
                }
            }
        }
    }

    last_message.ok_or(ProviderError::EmptyResponse)
}

fn format_plan_items(items: &[Value]) -> Option<String> {
    let summary = items
        .iter()
        .filter_map(|todo| {
            let text = todo.get("text").and_then(|value| value.as_str())?;
            let done = todo
                .get("completed")
                .or_else(|| todo.get("done"))
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            Some(format!("[{}] {}", if done { "x" } else { " " }, text))
        })
        .collect::<Vec<_>>()
        .join("\n");
    (!summary.trim().is_empty()).then_some(summary)
}

fn format_plan_from_steps(plan: Option<&Value>) -> Option<String> {
    let summary = plan?
        .as_array()?
        .iter()
        .filter_map(|step| {
            let text = step.get("step").and_then(|value| value.as_str())?;
            let status = step
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("pending");
            let marker = match status {
                "completed" => "x",
                "inProgress" | "in_progress" => "~",
                _ => " ",
            };
            Some(format!("[{marker}] {text}"))
        })
        .collect::<Vec<_>>()
        .join("\n");
    (!summary.trim().is_empty()).then_some(summary)
}

fn parse_codex_stream_line(line: &str) -> (Vec<ProviderEvent>, Option<CompletionUsage>) {
    let trimmed = line.trim();
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return (vec![], None);
    }

    let Ok(event) = serde_json::from_str::<CodexExecEvent>(trimmed) else {
        return (vec![], None);
    };

    if event.event_type == "turn.completed" {
        let usage = event.usage.map(|usage| CompletionUsage {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
        });
        return (vec![], usage);
    }

    if !matches!(
        event.event_type.as_str(),
        "item.started" | "item.updated" | "item.completed"
    ) {
        return (vec![], None);
    }

    let Some(item) = event.item else {
        return (vec![], None);
    };

    (parse_codex_item_event(&event.event_type, item), None)
}

fn parse_codex_item_event(event_type: &str, item: CodexExecItem) -> Vec<ProviderEvent> {
    let item_id = item.id.clone();
    let status = item
        .rest
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or(match event_type {
            "item.started" => "in_progress",
            "item.completed" => "completed",
            _ => "updated",
        })
        .to_string();

    let provider_event = match item.item_type.as_str() {
        "agent_message" | "agentMessage" => item
            .rest
            .get("text")
            .and_then(|value| value.as_str())
            .filter(|text| !text.trim().is_empty())
            .map(|text| ProviderEvent::MessageDelta {
                text: format!("{}\n", text),
            }),
        "reasoning" => item
            .rest
            .get("text")
            .and_then(|value| value.as_str())
            .map(str::to_string)
            .or_else(|| {
                item.rest
                    .get("summary")
                    .and_then(Value::as_array)
                    .map(|parts| {
                        parts
                            .iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
            })
            .or_else(|| {
                item.rest
                    .get("content")
                    .and_then(Value::as_array)
                    .map(|parts| {
                        parts
                            .iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
            })
            .filter(|text| !text.trim().is_empty())
            .map(|text| ProviderEvent::Reasoning { item_id, text }),
        "todo_list" => item
            .rest
            .get("items")
            .and_then(|value| value.as_array())
            .and_then(|items| format_plan_items(items))
            .map(|text| ProviderEvent::Plan { item_id, text }),
        "plan" => item
            .rest
            .get("text")
            .and_then(|value| value.as_str())
            .filter(|text| !text.trim().is_empty())
            .map(|text| ProviderEvent::Plan {
                item_id,
                text: text.to_string(),
            }),
        "command_execution" | "commandExecution" => {
            let (command, argv) = parse_command_text_and_argv(item.rest.get("command"));
            let output = item
                .rest
                .get("aggregated_output")
                .or_else(|| item.rest.get("aggregatedOutput"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            let exit_code = item
                .rest
                .get("exit_code")
                .or_else(|| item.rest.get("exitCode"))
                .and_then(|value| value.as_i64());
            Some(ProviderEvent::Command {
                item_id,
                command,
                status,
                exit_code,
                output,
                details: Some(CommandDetails {
                    argv,
                    cwd: item
                        .rest
                        .get("cwd")
                        .and_then(|value| value.as_str())
                        .map(str::to_string),
                    aggregated_output: item
                        .rest
                        .get("aggregated_output")
                        .or_else(|| item.rest.get("aggregatedOutput"))
                        .and_then(|value| value.as_str())
                        .map(str::to_string),
                }),
            })
        }
        "file_change" | "fileChange" => {
            let details = parse_file_change_details(item.rest.get("changes"));
            let files = item
                .rest
                .get("changes")
                .and_then(|value| value.as_array())
                .map(|changes| {
                    changes
                        .iter()
                        .filter_map(|change| change.get("path").and_then(|value| value.as_str()))
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let summary = if files.is_empty() {
                "file changes".to_string()
            } else {
                files.join(", ")
            };
            Some(ProviderEvent::FileChange {
                item_id,
                summary,
                files,
                status,
                details,
            })
        }
        "mcp_tool_call" | "mcpToolCall" => {
            let server = item
                .rest
                .get("server")
                .and_then(|value| value.as_str())
                .unwrap_or("mcp");
            let tool = item
                .rest
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("tool");
            if event_type == "item.completed" {
                let result_summary = item
                    .rest
                    .get("result")
                    .and_then(|value| value.as_object())
                    .map(|_| "completed".to_string())
                    .or_else(|| {
                        item.rest
                            .get("error")
                            .and_then(|value| value.get("message"))
                            .and_then(|value| value.as_str())
                            .map(str::to_string)
                    })
                    .unwrap_or_else(|| status.clone());
                Some(ProviderEvent::ToolResult {
                    item_id,
                    tool_name: format!("{server}/{tool}"),
                    output_summary: result_summary,
                    success: Some(item.rest.get("error").is_none()),
                })
            } else {
                let arguments = item
                    .rest
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                Some(ProviderEvent::ToolCall {
                    item_id,
                    tool_name: format!("{server}/{tool}"),
                    input_summary: arguments.to_string(),
                })
            }
        }
        "web_search" | "webSearch" => {
            item.rest
                .get("query")
                .and_then(|value| value.as_str())
                .map(|query| ProviderEvent::ToolCall {
                    item_id,
                    tool_name: "web_search".to_string(),
                    input_summary: query.to_string(),
                })
        }
        other => Some(ProviderEvent::Metadata {
            item_id,
            kind: other.to_string(),
            value: item.rest,
        }),
    };

    provider_event.into_iter().collect()
}

#[async_trait]
impl LlmProvider for CodexCliProvider {
    async fn start_session(
        self: Arc<Self>,
        messages: Vec<Message>,
    ) -> Result<Box<dyn ProviderSession>> {
        // Always use the app-server session for real-time streaming.
        // The sandbox is only used as a fallback in complete_stream (exec mode).
        self.spawn_app_server_session(messages).await
    }

    async fn complete_stream(
        &self,
        messages: Vec<Message>,
        on_chunk: &mut (dyn FnMut(StreamChunk) + Send),
    ) -> Result<(String, CompletionUsage)> {
        let prompt = flatten_messages_to_prompt(&messages);
        let args = Self::build_exec_args(prompt.clone());

        if let (Some(sandbox), Some(dir)) = (&self.sandbox, &self.working_dir) {
            let output = super::run_sandboxed_command(sandbox, dir, "codex", &args).await?;
            let stdout = output.stdout;
            let stderr = output.stderr;
            let combined = format!("{}{}", stdout, stderr);

            if check_claude_session(&combined) {
                return Err(ProviderError::CliSessionExpired {
                    auth_command: "codex login".to_string(),
                }
                .into());
            }

            if output.exit_code != 0 {
                return Err(ProviderError::HttpError {
                    status: output.exit_code.max(1) as u16,
                    body: stderr,
                }
                .into());
            }

            let text = parse_codex_exec_output(&stdout)?;
            if text.trim().is_empty() {
                return Err(ProviderError::EmptyResponse.into());
            }

            on_chunk(StreamChunk::text(text.clone()));
            on_chunk(StreamChunk::finished());
            let usage = CompletionUsage {
                prompt_tokens: (prompt.len() / 4) as u32,
                completion_tokens: (text.len() / 4) as u32,
            };
            return Ok((text, usage));
        }

        let mut command = tokio::process::Command::new("codex");
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

        // Drain stderr in background to prevent pipe deadlock.
        let stderr_handle = tokio::spawn(async move {
            let mut buf = String::new();
            BufReader::new(stderr).read_to_string(&mut buf).await.ok();
            buf
        });

        // Stream NDJSON line-by-line, emitting agent_message text in real time.
        let mut lines = BufReader::new(stdout).lines();
        let mut full_ndjson = String::new();
        let mut usage: Option<CompletionUsage> = None;
        while let Some(line) = lines.next_line().await.map_err(ProviderError::Io)? {
            let (events, line_usage) = parse_codex_stream_line(&line);
            if let Some(line_usage) = line_usage {
                usage = Some(line_usage);
            }
            for event in events {
                on_chunk(StreamChunk::event(event));
            }
            full_ndjson.push_str(&line);
            full_ndjson.push('\n');
        }

        let status = child.wait().await.map_err(ProviderError::Io)?;
        let stderr_content = stderr_handle.await.unwrap_or_default();
        let combined = format!("{}{}", full_ndjson, stderr_content);

        if check_claude_session(&combined) {
            return Err(ProviderError::CliSessionExpired {
                auth_command: "codex login".to_string(),
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

        // Use the full NDJSON to extract the final agent message.
        let text = parse_codex_exec_output(&full_ndjson)?;
        if text.trim().is_empty() {
            return Err(ProviderError::EmptyResponse.into());
        }

        on_chunk(StreamChunk::finished());
        let usage = usage.unwrap_or(CompletionUsage {
            prompt_tokens: (prompt.len() / 4) as u32,
            completion_tokens: (text.len() / 4) as u32,
        });
        Ok((text, usage))
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            streaming_text: true,
            usage_native: true,
            tool_calls_native: true,
            approvals_native: true,
            user_input_native: true,
            reasoning_visible: true,
            interaction_mode: ProviderInteractionMode::Native,
        }
    }

    fn provider_name(&self) -> &str {
        "codex-cli"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_exec_args_uses_non_interactive_codex_mode() {
        assert_eq!(
            CodexCliProvider::build_exec_args("Reply with OK".to_string()),
            vec![
                "exec".to_string(),
                "--json".to_string(),
                "--ephemeral".to_string(),
                "Reply with OK".to_string(),
            ]
        );
    }

    #[test]
    fn test_parse_codex_exec_output_reads_last_agent_message() {
        let stdout = r#"
{"type":"thread.started","thread_id":"abc"}
{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"first"}}
{"type":"item.completed","item":{"id":"2","type":"agent_message","text":"OK"}}
{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}
"#;

        assert_eq!(parse_codex_exec_output(stdout).unwrap(), "OK");
    }

    #[test]
    fn test_parse_codex_exec_output_ignores_non_json_noise() {
        let stdout = r#"
WARNING: cache issue
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"OK"}}
"#;

        assert_eq!(parse_codex_exec_output(stdout).unwrap(), "OK");
    }

    #[test]
    fn test_parse_codex_user_input_request() {
        let params = json!({
            "itemId": "item-1",
            "questions": [
                {
                    "id": "path",
                    "header": "Path",
                    "question": "Which file?",
                    "options": [
                        { "label": "src/lib.rs", "description": "main library" },
                        { "label": "src/main.rs", "description": "binary entrypoint" }
                    ],
                    "isSecret": false
                }
            ]
        });

        let (item_id, question_ids, questions) = parse_codex_user_input_request(&params).unwrap();
        assert_eq!(item_id, "item-1");
        assert_eq!(question_ids, vec!["path".to_string()]);
        assert_eq!(questions.len(), 1);
        assert_eq!(questions[0].options.as_ref().unwrap()[0], "src/lib.rs");
    }

    #[test]
    fn test_parse_codex_command_approval_request() {
        let params = json!({
            "itemId": "cmd-1",
            "approvalId": "approval-1",
            "command": "cargo test -p koklo-cli",
            "cwd": "/workspace",
            "reason": "Needs to verify the CLI changes"
        });

        let request =
            parse_codex_approval_request("item/commandExecution/requestApproval", &params).unwrap();
        assert_eq!(request.request_id, "approval-1");
        assert_eq!(request.item_id.as_deref(), Some("cmd-1"));
        assert_eq!(request.kind, ProviderApprovalKind::CommandExecution);
        assert!(request.description.contains("cargo test -p koklo-cli"));
    }

    #[test]
    fn test_parse_codex_stream_line_supports_camel_case_item_types() {
        let line = r#"{"type":"item.completed","item":{"id":"cmd-1","type":"commandExecution","command":"cargo test -p koklo-cli","aggregatedOutput":"ok\n","exitCode":0,"status":"completed"}}"#;

        let (events, usage) = parse_codex_stream_line(line);
        assert!(usage.is_none());
        assert!(matches!(
            events.as_slice(),
            [ProviderEvent::Command {
                item_id,
                command,
                status,
                exit_code,
                output,
                ..
            }] if item_id.as_deref() == Some("cmd-1")
                && command == "cargo test -p koklo-cli"
                && status == "completed"
                && *exit_code == Some(0)
                && output.as_deref() == Some("ok\n")
        ));
    }

    #[test]
    fn test_handle_codex_notification_supports_v2_methods() {
        let (sender, mut receiver) = mpsc::unbounded_channel();
        let mut turns = HashMap::new();

        handle_codex_notification(
            "turn/plan/updated",
            json!({
                "turnId": "turn-1",
                "threadId": "thread-1",
                "plan": [
                    { "step": "Inspect files", "status": "completed" },
                    { "step": "Patch renderer", "status": "inProgress" }
                ]
            }),
            &sender,
            &mut turns,
        );

        let event = receiver.try_recv().expect("plan event").expect("ok event");
        assert!(matches!(
            event,
            ProviderSessionEvent::Event(ProviderEvent::Plan { text, .. })
                if text == "[x] Inspect files\n[~] Patch renderer"
        ));
    }

    #[test]
    fn test_handle_codex_notification_emits_file_change_delta() {
        let (sender, mut receiver) = mpsc::unbounded_channel();
        let mut turns = HashMap::new();

        handle_codex_notification(
            "item/fileChange/outputDelta",
            json!({
                "itemId": "patch-1",
                "turnId": "turn-1",
                "threadId": "thread-1",
                "delta": "Updated apps/cli/src/monitor.rs"
            }),
            &sender,
            &mut turns,
        );

        let event = receiver
            .try_recv()
            .expect("file change event")
            .expect("ok event");
        assert!(matches!(
            event,
            ProviderSessionEvent::Event(ProviderEvent::FileChange {
                item_id,
                summary,
                status,
                ..
            }) if item_id.as_deref() == Some("patch-1")
                && summary == "Updated apps/cli/src/monitor.rs"
                && status == "updated"
        ));
    }

    #[test]
    fn parse_completed_file_change_preserves_change_details() {
        let item = CodexExecItem {
            id: Some("patch-2".to_string()),
            item_type: "file_change".to_string(),
            rest: json!({
                "status": "completed",
                "changes": [{
                    "path": "apps/cli/src/monitor.rs",
                    "kind": "update",
                    "patch": "@@ -1 +1 @@\n-old line\n+new line"
                }]
            }),
        };

        let events = parse_codex_item_event("item.completed", item);
        assert!(matches!(
            &events[0],
            ProviderEvent::FileChange {
                item_id,
                files,
                details: Some(details),
                ..
            } if item_id.as_deref() == Some("patch-2")
                && files == &vec!["apps/cli/src/monitor.rs".to_string()]
                && details.changes.len() == 1
        ));
    }
}
