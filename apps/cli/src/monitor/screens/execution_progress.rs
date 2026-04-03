//! Page 9: Execution Progress — real-time progress with live logs.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    Frame,
};

use crate::monitor::components::phase_progress::{self, PhaseSegment};
use crate::monitor::types::MonitorApp;

impl MonitorApp {
    pub(crate) fn render_execution_progress(&self, frame: &mut Frame, area: Rect) {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // Phase progress bar
                Constraint::Min(8),    // Live logs (reuse existing render_logs)
            ])
            .split(area);

        // Phase progress bar
        let segments: Vec<PhaseSegment> = self
            .state
            .phases
            .iter()
            .map(|p| PhaseSegment::new(&p.phase, &p.status))
            .collect();
        phase_progress::render_phase_bar(frame, sections[0], &segments);

        // Reuse the existing logs renderer
        self.render_logs(frame, sections[1]);
    }
}
