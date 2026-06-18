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

/// Read one MCP message. The MCP stdio transport is newline-delimited JSON
/// (one JSON-RPC object per line) — NOT LSP-style `Content-Length` framing.
/// Using the wrong framing meant Claude Code never completed the handshake,
/// so the server exposed zero tools ("Available MCP tools: none").
fn read_message(reader: &mut impl BufRead) -> Result<Option<Value>> {
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            return Ok(None);
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value =
            serde_json::from_str(trimmed).context("invalid JSON-RPC message on MCP stdio")?;
        return Ok(Some(value));
    }
}

fn write_message(writer: &mut impl Write, value: &Value) -> Result<()> {
    let body = serde_json::to_vec(value)?;
    writer.write_all(&body)?;
    writer.write_all(b"\n")?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn write_message_is_newline_delimited_json() {
        // MCP stdio framing is one JSON object per line, no Content-Length headers.
        let mut buf = Vec::new();
        write_message(&mut buf, &json!({"jsonrpc": "2.0", "id": 1})).unwrap();
        let text = String::from_utf8(buf).unwrap();
        assert!(!text.contains("Content-Length"));
        assert!(text.ends_with('\n'));
        assert_eq!(text.matches('\n').count(), 1);
        assert_eq!(text.trim(), r#"{"id":1,"jsonrpc":"2.0"}"#);
    }

    #[test]
    fn read_message_round_trips_and_skips_blank_lines() {
        let input = "\n{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/list\"}\n";
        let mut reader = Cursor::new(input.as_bytes());
        let msg = read_message(&mut reader).unwrap().expect("a message");
        assert_eq!(msg.get("id").and_then(Value::as_u64), Some(7));
        assert_eq!(
            msg.get("method").and_then(Value::as_str),
            Some("tools/list")
        );
        // EOF after the message yields None.
        assert!(read_message(&mut reader).unwrap().is_none());
    }

    #[test]
    fn tools_list_exposes_the_permission_tool() {
        let dir = std::env::temp_dir();
        let response = handle_request(
            &dir,
            &json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
        )
        .unwrap();
        let names: Vec<&str> = response["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert_eq!(names, vec![TOOL_NAME]);
    }
}
