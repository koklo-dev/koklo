use anyhow::Result;
use koklo_events::UserInputQuestion;
use uuid::Uuid;

const USER_INPUT_OPEN_TAG: &str = "<koklo:ui>";
const USER_INPUT_CLOSE_TAG: &str = "</koklo:ui>";
const LEGACY_USER_INPUT_OPEN_TAG: &str = "<koklo:user-input>";
const LEGACY_USER_INPUT_CLOSE_TAG: &str = "</koklo:user-input>";

pub(crate) fn with_user_input_protocol(system_prompt: String) -> String {
    format!(
        "{system_prompt}\n\n---\n\n\
If blocked on missing user input, reply with ONLY:\n\
<koklo:ui>{{\"q\":[{{\"q\":\"Your question here\"}}]}}</koklo:ui>\n\
Use 1-3 questions. Optional fields per question: `i` id, `h` header, `o` options, `s` secret. After Koklo answers, continue normally."
    )
}

pub(crate) fn format_user_input_request_for_history(questions: &[UserInputQuestion]) -> String {
    let formatted = questions
        .iter()
        .map(|question| {
            let mut line = format!("- {}", question.question);
            if let Some(options) = &question.options {
                if !options.is_empty() {
                    line.push_str(&format!(" [options: {}]", options.join(" | ")));
                }
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("User input requested:\n{}", formatted)
}

pub(crate) fn format_user_input_answers_for_history(
    questions: &[UserInputQuestion],
    answers: &[String],
) -> String {
    let answers = questions
        .iter()
        .zip(answers.iter())
        .map(|(question, answer)| format!("- {} => {}", question.question, answer))
        .collect::<Vec<_>>()
        .join("\n");
    format!("User input answers:\n{}", answers)
}

#[derive(Debug)]
pub(crate) enum TextSegment {
    Visible(String),
}

#[derive(Debug, Default)]
pub(crate) struct SyntheticUserInputParser {
    buffer: String,
    request: Option<SyntheticUserInputRequest>,
}

#[derive(Debug, Clone)]
pub(crate) struct SyntheticUserInputRequest {
    pub(crate) request_id: String,
    pub(crate) questions: Vec<UserInputQuestion>,
}

impl SyntheticUserInputParser {
    pub(crate) fn push(&mut self, chunk: &str) -> Vec<TextSegment> {
        self.buffer.push_str(chunk);
        let mut visible = Vec::new();

        loop {
            if let Some((open_tag, close_tag, start)) = find_user_input_tag(&self.buffer) {
                if start > 0 {
                    visible.push(TextSegment::Visible(self.buffer[..start].to_string()));
                    self.buffer.drain(..start);
                }

                if let Some(end) = self.buffer.find(close_tag) {
                    let json_start = open_tag.len();
                    let json_text = self.buffer[json_start..end].trim().to_string();
                    self.buffer.drain(..end + close_tag.len());
                    if let Ok(request) = parse_synthetic_user_input_request(&json_text) {
                        self.request = Some(request);
                    } else {
                        visible.push(TextSegment::Visible(format!("{open_tag}{json_text}{close_tag}")));
                    }
                    continue;
                }
                break;
            }

            let keep = USER_INPUT_OPEN_TAG
                .len()
                .max(LEGACY_USER_INPUT_OPEN_TAG.len())
                .saturating_sub(1);
            let flush_len = self.buffer.len().saturating_sub(keep);
            if flush_len > 0 {
                visible.push(TextSegment::Visible(self.buffer[..flush_len].to_string()));
                self.buffer.drain(..flush_len);
            }
            break;
        }

        visible
    }

    pub(crate) fn finish(&mut self) -> String {
        std::mem::take(&mut self.buffer)
    }

    pub(crate) fn take_request(&mut self) -> Option<SyntheticUserInputRequest> {
        self.request.take()
    }
}

fn parse_synthetic_user_input_request(json_text: &str) -> Result<SyntheticUserInputRequest> {
    #[derive(serde::Deserialize)]
    struct Payload {
        #[serde(default, alias = "q")]
        questions: Vec<UserInputQuestion>,
    }

    #[derive(serde::Deserialize)]
    struct CompactPayload {
        #[serde(default, alias = "questions")]
        q: Vec<CompactQuestion>,
    }

    #[derive(serde::Deserialize)]
    struct CompactQuestion {
        #[serde(default, alias = "id")]
        i: Option<String>,
        #[serde(default, alias = "header")]
        h: Option<String>,
        #[serde(alias = "question")]
        q: String,
        #[serde(default, alias = "options")]
        o: Option<Vec<String>>,
        #[serde(default, alias = "is_secret")]
        s: bool,
    }

    let questions = if let Ok(payload) = serde_json::from_str::<Payload>(json_text) {
        payload.questions
    } else {
        let payload: CompactPayload = serde_json::from_str(json_text)?;
        payload
            .q
            .into_iter()
            .map(|question| UserInputQuestion {
                id: question.i.unwrap_or_else(|| "clarify".to_string()),
                header: question.h.unwrap_or_else(|| "Clarification".to_string()),
                question: question.q,
                options: question.o,
                is_secret: question.s,
            })
            .collect()
    };
    if questions.is_empty() {
        anyhow::bail!("empty questions");
    }
    Ok(SyntheticUserInputRequest {
        request_id: synthetic_request_id(),
        questions,
    })
}

fn synthetic_request_id() -> String {
    let raw = Uuid::new_v4().simple().to_string();
    format!("ui-{}", &raw[..12])
}

fn find_user_input_tag(buffer: &str) -> Option<(&'static str, &'static str, usize)> {
    match (
        buffer.find(USER_INPUT_OPEN_TAG),
        buffer.find(LEGACY_USER_INPUT_OPEN_TAG),
    ) {
        (Some(compact), Some(legacy)) if compact <= legacy => {
            Some((USER_INPUT_OPEN_TAG, USER_INPUT_CLOSE_TAG, compact))
        }
        (Some(_), Some(legacy)) => Some((
            LEGACY_USER_INPUT_OPEN_TAG,
            LEGACY_USER_INPUT_CLOSE_TAG,
            legacy,
        )),
        (Some(compact), None) => Some((USER_INPUT_OPEN_TAG, USER_INPUT_CLOSE_TAG, compact)),
        (None, Some(legacy)) => Some((
            LEGACY_USER_INPUT_OPEN_TAG,
            LEGACY_USER_INPUT_CLOSE_TAG,
            legacy,
        )),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_parser_extracts_request_block() {
        let mut parser = SyntheticUserInputParser::default();
        let out = parser.push("before <koklo:ui>{\"q\":[{\"q\":\"Which path?\"}]}</koklo:ui> after");
        let visible = out
            .into_iter()
            .map(|segment| match segment {
                TextSegment::Visible(text) => text,
            })
            .collect::<Vec<_>>()
            .join("");
        assert_eq!(visible, "before ");
        let request = parser.take_request().unwrap();
        assert_eq!(request.questions.len(), 1);
        assert_eq!(request.questions[0].question, "Which path?");
        assert_eq!(parser.finish(), " after");
    }

    #[test]
    fn synthetic_parser_accepts_legacy_request_block() {
        let mut parser = SyntheticUserInputParser::default();
        parser.push("<koklo:user-input>{\"questions\":[{\"id\":\"a\",\"header\":\"Need\",\"question\":\"Legacy?\",\"options\":null,\"is_secret\":false}]}</koklo:user-input>");
        let request = parser.take_request().unwrap();
        assert_eq!(request.questions[0].question, "Legacy?");
    }

    #[test]
    fn history_format_is_compact() {
        let questions = vec![UserInputQuestion {
            id: "clarify".to_string(),
            header: "Clarification".to_string(),
            question: "Which module?".to_string(),
            options: Some(vec!["billing".to_string(), "auth".to_string()]),
            is_secret: false,
        }];
        assert_eq!(
            format_user_input_request_for_history(&questions),
            "User input requested:\n- Which module? [options: billing | auth]"
        );
        assert_eq!(
            format_user_input_answers_for_history(&questions, &["billing".to_string()]),
            "User input answers:\n- Which module? => billing"
        );
    }
}
