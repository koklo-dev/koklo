use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const TOOL_NAME: &str = "koklo_permission_prompt";
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn run_claude_permission_bridge(bridge_dir: &Path) -> Result<()> {
    fs::create_dir_all(requests_dir(bridge_dir))?;
    fs::create_dir_all(responses_dir(bridge_dir))?;

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = stdout.lock();

    while let Some(message) = read_message(&mut reader)? {
        if let Some(id) = message.get("id").cloned() {
            let response = handle_request(bridge_dir, &message)
                .unwrap_or_else(|error| jsonrpc_error(id.clone(), -32000, &error.to_string()));
            write_message(&mut writer, &response)?;
        }
    }

    Ok(())
}

fn handle_request(bridge_dir: &Path, message: &Value) -> Result<Value> {
    let id = message
        .get("id")
        .cloned()
        .context("missing JSON-RPC id in MCP request")?;
    let method = message
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match method {
        "initialize" => Ok(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "koklo-claude-permission-bridge",
                    "version": env!("CARGO_PKG_VERSION"),
                }
            }
        })),
        "notifications/initialized" => Ok(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {}
        })),
        "tools/list" => Ok(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "tools": [
                    {
                        "name": TOOL_NAME,
                        "description": "Forward Claude Code permission prompts to Koklo for approval.",
                        "inputSchema": {
                            "type": "object",
                            "additionalProperties": true,
                            "properties": {
                                "tool_name": { "type": "string" },
                                "tool": { "type": "string" },
                                "command": { "type": "string" },
                                "reason": { "type": "string" },
                                "file_path": { "type": "string" },
                                "path": { "type": "string" },
                                "paths": {
                                    "type": "array",
                                    "items": { "type": "string" }
                                }
                            }
                        }
                    }
                ]
            }
        })),
        "tools/call" => handle_tool_call(bridge_dir, id, message),
        _ => Ok(jsonrpc_error(
            id,
            -32601,
            "method not supported by Koklo MCP bridge",
        )),
    }
}

fn handle_tool_call(bridge_dir: &Path, id: Value, message: &Value) -> Result<Value> {
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
    let tool_name = params
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if tool_name != TOOL_NAME {
        return Ok(jsonrpc_error(id, -32601, "unknown MCP tool"));
    }

    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let request_id = next_request_id();
    let request_path = requests_dir(bridge_dir).join(format!("{request_id}.json"));
    let request_payload = json!({
        "request_id": request_id,
        "kind": infer_kind(&arguments),
        "description": infer_description(&arguments),
        "details": arguments,
    });
    fs::write(&request_path, serde_json::to_vec_pretty(&request_payload)?)?;

    let response_path = responses_dir(bridge_dir).join(format!("{request_id}.json"));
    let decision = wait_for_response(&response_path)?;
    let text = decision
        .get("decision")
        .and_then(Value::as_str)
        .unwrap_or("reject");

    Ok(json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": format!("Koklo approval decision: {text}"),
                }
            ],
            "isError": false,
        }
    }))
}

fn wait_for_response(path: &Path) -> Result<Value> {
    loop {
        if path.exists() {
            let bytes = fs::read(path)?;
            let payload = serde_json::from_slice(&bytes)?;
            return Ok(payload);
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn infer_kind(arguments: &Value) -> &'static str {
    if arguments.get("command").is_some() {
        "command_execution"
    } else if arguments.get("file_path").is_some()
        || arguments.get("path").is_some()
        || arguments.get("paths").is_some()
    {
        "file_change"
    } else {
        "permissions"
    }
}

fn infer_description(arguments: &Value) -> String {
    if let Some(command) = arguments.get("command").and_then(Value::as_str) {
        if let Some(reason) = arguments.get("reason").and_then(Value::as_str) {
            return format!("Approve Claude command: {command}\nReason: {reason}");
        }
        return format!("Approve Claude command: {command}");
    }

    if let Some(path) = arguments
        .get("file_path")
        .and_then(Value::as_str)
        .or_else(|| arguments.get("path").and_then(Value::as_str))
    {
        return format!("Approve Claude file access: {path}");
    }

    if let Some(tool) = arguments
        .get("tool_name")
        .and_then(Value::as_str)
        .or_else(|| arguments.get("tool").and_then(Value::as_str))
    {
        return format!("Approve Claude tool: {tool}");
    }

    "Approve Claude permission request".to_string()
}

fn requests_dir(bridge_dir: &Path) -> PathBuf {
    bridge_dir.join("requests")
}

fn responses_dir(bridge_dir: &Path) -> PathBuf {
    bridge_dir.join("responses")
}

fn next_request_id() -> String {
    let counter = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("claude-approval-{nanos}-{counter}")
}

fn read_message(reader: &mut impl BufRead) -> Result<Option<Value>> {
    let mut content_length = None;
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            if content_length.is_none() {
                return Ok(None);
            }
            anyhow::bail!("unexpected EOF while reading MCP headers");
        }

        if line == "\r\n" {
            break;
        }

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if let Some(value) = trimmed.strip_prefix("Content-Length:") {
            content_length = Some(value.trim().parse::<usize>()?);
        }
    }

    let len = content_length.context("missing Content-Length header")?;
    let mut body = vec![0_u8; len];
    reader.read_exact(&mut body)?;
    let value = serde_json::from_slice(&body)?;
    Ok(Some(value))
}

fn write_message(writer: &mut impl Write, value: &Value) -> Result<()> {
    let body = serde_json::to_vec(value)?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()?;
    Ok(())
}

fn jsonrpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        }
    })
}
