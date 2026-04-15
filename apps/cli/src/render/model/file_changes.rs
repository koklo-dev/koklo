use super::*;

pub(super) fn format_file_change(
    payload: &Option<Value>,
    record: &TranscriptItemRecord,
) -> Vec<String> {
    if let Some(lines) = payload
        .as_ref()
        .map(extract_file_change_details)
        .filter(|lines| !lines.is_empty())
    {
        return lines;
    }

    if let Some(files) = payload
        .as_ref()
        .and_then(|payload| payload.get("files"))
        .and_then(Value::as_array)
    {
        let file_lines: Vec<String> = files
            .iter()
            .filter_map(Value::as_str)
            .map(|path| format!("Δ {}", path))
            .collect();
        if !file_lines.is_empty() {
            let mut lines = if file_change_summary_has_signal(&record.summary) {
                format_file_change_summary(&record.summary)
            } else {
                Vec::new()
            };
            lines.extend(file_lines);
            return lines;
        }
    }
    format_file_change_summary(&record.summary)
}

pub(super) fn should_prefer_file_change_lines(current: &[String], next: &[String]) -> bool {
    let current_signal = file_change_line_score(current);
    let next_signal = file_change_line_score(next);
    next_signal > current_signal || (next_signal == current_signal && next.len() >= current.len())
}

fn file_change_line_score(lines: &[String]) -> usize {
    lines.iter().fold(0, |score, line| {
        score
            + if looks_like_diff_line(line) {
                4
            } else if line.starts_with("● ") {
                2
            } else if !line.trim().is_empty() {
                1
            } else {
                0
            }
    })
}

fn format_file_change_summary(summary: &str) -> Vec<String> {
    let lines = summary
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return vec!["Δ file changes".to_string()];
    }

    if lines.iter().any(|line| looks_like_diff_line(line)) {
        return lines
            .into_iter()
            .enumerate()
            .map(|(idx, line)| {
                if idx == 0 && !looks_like_diff_line(line) {
                    format!("● {}", truncate_path(line))
                } else {
                    line.to_string()
                }
            })
            .collect();
    }

    lines.into_iter().map(|line| format!("Δ {line}")).collect()
}

fn extract_file_change_details(payload: &Value) -> Vec<String> {
    let mut lines = Vec::new();
    let mut saw_detail = false;

    if let Some(delta) = payload
        .get("details")
        .and_then(|details| details.get("delta"))
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        lines.extend(format_file_change_summary(delta));
        saw_detail = true;
    }

    let changes = payload
        .get("changes")
        .or_else(|| {
            payload
                .get("details")
                .and_then(|details| details.get("changes"))
        })
        .and_then(Value::as_array);

    if let Some(changes) = changes {
        for change in changes {
            let mut change_lines = extract_change_entry_lines(change);
            if !change_lines.is_empty() {
                saw_detail = true;
                lines.append(&mut change_lines);
            }
        }
    }

    if saw_detail {
        dedupe_adjacent_lines(lines)
    } else {
        Vec::new()
    }
}

fn extract_change_entry_lines(change: &Value) -> Vec<String> {
    let mut lines = Vec::new();

    if let Some(path) = change
        .get("path")
        .or_else(|| change.get("filePath"))
        .and_then(Value::as_str)
        .filter(|path| !path.trim().is_empty())
    {
        let verb = change
            .get("kind")
            .or_else(|| change.get("status"))
            .or_else(|| change.get("action"))
            .and_then(Value::as_str)
            .unwrap_or("Update");
        lines.push(format!(
            "● {}({})",
            title_case_word(verb),
            truncate_path(path)
        ));
    }

    if let Some(diff) = change
        .get("patch")
        .or_else(|| change.get("diff"))
        .or_else(|| change.get("unifiedDiff"))
        .and_then(Value::as_str)
    {
        lines.extend(diff.lines().map(str::to_string));
    }

    if let Some(snippet_lines) = change
        .get("lines")
        .or_else(|| change.get("preview"))
        .and_then(Value::as_array)
    {
        for line in snippet_lines {
            if let Some(text) = line.as_str().filter(|text| !text.trim().is_empty()) {
                lines.push(text.to_string());
            } else if let Some(text) = line
                .get("text")
                .or_else(|| line.get("line"))
                .and_then(Value::as_str)
                .filter(|text| !text.trim().is_empty())
            {
                lines.push(text.to_string());
            }
        }
    }

    if let Some(removed) = change.get("removed").and_then(Value::as_array) {
        for line in removed.iter().filter_map(Value::as_str) {
            lines.push(format!("- {}", line));
        }
    }

    if let Some(added) = change.get("added").and_then(Value::as_array) {
        for line in added.iter().filter_map(Value::as_str) {
            lines.push(format!("+ {}", line));
        }
    }

    lines
}

fn dedupe_adjacent_lines(lines: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::with_capacity(lines.len());
    for line in lines {
        if deduped.last() != Some(&line) {
            deduped.push(line);
        }
    }
    deduped
}

fn title_case_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => {
            let mut out = String::new();
            out.extend(first.to_uppercase());
            out.push_str(&chars.as_str().to_ascii_lowercase());
            out
        }
        None => "Update".to_string(),
    }
}

fn file_change_summary_has_signal(summary: &str) -> bool {
    summary
        .lines()
        .any(|line| !line.trim().is_empty() && !looks_like_file_path(line.trim()))
}

fn looks_like_diff_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with('+')
        || trimmed.starts_with('-')
        || trimmed.starts_with("@@")
        || trimmed.starts_with("…")
        || trimmed.starts_with("⎿")
}

fn looks_like_file_path(line: &str) -> bool {
    line.contains('/') || line.ends_with(".rs") || line.ends_with(".toml") || line.ends_with(".md")
}

/// Shorten long paths by keeping the last meaningful segments.
/// `/home/user/.koklo/worktrees/app-very-long-hash/src/Entity/Funding.php`
/// becomes `…/src/Entity/Funding.php`.
fn truncate_path(path: &str) -> &str {
    const MAX_PATH_LEN: usize = 60;
    if path.len() <= MAX_PATH_LEN {
        return path;
    }
    // Walk backwards through '/' separators to find a short-enough suffix
    let bytes = path.as_bytes();
    let mut last_slash = path.len();
    for i in (0..bytes.len()).rev() {
        if bytes[i] == b'/' {
            if path.len() - i < MAX_PATH_LEN {
                // "…" + suffix fits
                last_slash = i;
            } else {
                break;
            }
        }
    }
    if last_slash < path.len() {
        &path[last_slash..]
    } else {
        // No good break point — just return the last MAX_PATH_LEN chars
        let start = path.len().saturating_sub(MAX_PATH_LEN - 1);
        &path[start..]
    }
}
