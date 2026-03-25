use super::*;

impl MonitorApp {
    pub(crate) fn render_user_input_overlay(&self, frame: &mut Frame) {
        let Some(pending) = &self.ui.pending_user_input else {
            return;
        };
        let Some(question) = pending.current_question() else {
            return;
        };

        let area = frame.size();
        let overlay_area = centered_overlay_rect(area, 65, 11, 36);
        frame.render_widget(Clear, overlay_area);

        let mut lines = vec![
            format!(
                "Question {}/{}",
                pending.answers.len() + 1,
                pending.questions.len()
            ),
            String::new(),
            question.question.clone(),
        ];
        if question.is_secret {
            lines.push(String::new());
            lines.push("Answer will be recorded as provided.".to_string());
        }
        if let Some(options) = &question.options {
            if !options.is_empty() {
                lines.push(String::new());
                lines.push(format!("Options: {}", options.join(" | ")));
            }
        }
        if overlay_area.height >= 9 {
            lines.push(String::new());
            lines.push("Submit with Enter or use /reply <text>.".to_string());
        } else {
            lines.push(String::new());
            lines.push("Enter to submit.".to_string());
        }

        let para = Paragraph::new(lines.join("\n")).block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!("User Input — {}", question.header))
                .style(Style::default().fg(Color::Yellow)),
        );
        frame.render_widget(para, overlay_area);
    }
}
