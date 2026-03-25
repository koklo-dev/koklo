use anyhow::Result;
use koklo_events::UserInputQuestion;
use uuid::Uuid;

const USER_INPUT_OPEN_TAG: &str = "<koklo:user-input>";
const USER_INPUT_CLOSE_TAG: &str = "</koklo:user-input>";

pub(crate) fn with_user_input_protocol(system_prompt: String) -> String {
    format!(
        "{system_prompt}\n\n---\n\n\
If you need clarification or a decision from the user before you can continue, \
respond with ONLY one XML block in this exact form and no surrounding prose:\n\
<koklo:user-input>{{\"questions\":[{{\"id\":\"clarify\",\"header\":\"Clarification\",\"question\":\"Your question here\",\"options\":null,\"is_secret\":false}}]}}</koklo:user-input>\n\
You may include 1 to 3 questions. Once Koklo provides the answers, continue the task normally."
    )
}

pub(crate) fn format_user_input_request_for_history(questions: &[UserInputQuestion]) -> String {
    let formatted = questions
        .iter()
        .map(|question| format!("- {}: {}", question.header, question.question))
        .collect::<Vec<_>>()
        .join("\n");
    format!("Requesting user input:\n{}", formatted)
}

pub(crate) fn format_user_input_answers_for_history(
    questions: &[UserInputQuestion],
    answers: &[String],
) -> String {
    questions
        .iter()
        .zip(answers.iter())
        .map(|(question, answer)| format!("{}: {}", question.header, answer))
        .collect::<Vec<_>>()
        .join("\n")
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
            if let Some(start) = self.buffer.find(USER_INPUT_OPEN_TAG) {
                if start > 0 {
                    visible.push(TextSegment::Visible(self.buffer[..start].to_string()));
                    self.buffer.drain(..start);
                }

                if let Some(end) = self.buffer.find(USER_INPUT_CLOSE_TAG) {
                    let json_start = USER_INPUT_OPEN_TAG.len();
                    let json_text = self.buffer[json_start..end].trim().to_string();
                    self.buffer.drain(..end + USER_INPUT_CLOSE_TAG.len());
                    if let Ok(request) = parse_synthetic_user_input_request(&json_text) {
                        self.request = Some(request);
                    } else {
                        visible.push(TextSegment::Visible(format!(
                            "{}{}{}",
                            USER_INPUT_OPEN_TAG, json_text, USER_INPUT_CLOSE_TAG
                        )));
                    }
                    continue;
                }
                break;
            }

            let keep = USER_INPUT_OPEN_TAG.len().saturating_sub(1);
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
        questions: Vec<UserInputQuestion>,
    }

    let payload: Payload = serde_json::from_str(json_text)?;
    if payload.questions.is_empty() {
        anyhow::bail!("empty questions");
    }
    Ok(SyntheticUserInputRequest {
        request_id: Uuid::new_v4().to_string(),
        questions: payload.questions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_parser_extracts_request_block() {
        let mut parser = SyntheticUserInputParser::default();
        let out = parser.push("before <koklo:user-input>{\"questions\":[{\"id\":\"a\",\"header\":\"Need\",\"question\":\"Which path?\",\"options\":null,\"is_secret\":false}]}</koklo:user-input> after");
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
        assert_eq!(parser.finish(), " after");
    }
}
