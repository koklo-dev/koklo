//! Pipeline event bus — tokio broadcast channel.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::broadcast;

/// Pipeline execution phases.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Phase {
    // ── SDD (default) ────────────────────────────────────────────────────
    /// Product spec authored by the PM agent.
    Spec,
    /// Technical plan authored by the Architect agent.
    Plan,
    /// Code implementation authored by the Developer agent.
    Implement,
    /// Test suite authored/run by the QA agent.
    Test,
    /// Code review + PR authored by the Reviewer agent.
    Review,
    // ── BMAD additions ───────────────────────────────────────────────────
    /// Business analysis authored by the Analyst agent (BMAD phase 1).
    Analysis,
    /// OWASP security review authored by the Security agent.
    Security,
    /// Documentation update authored by the Doc-writer agent.
    Docs,
    // ── Spec Kit additions ───────────────────────────────────────────────
    /// Project constitution authored by the Constitution-writer agent.
    Constitution,
    /// Atomic task decomposition authored by the Task-planner agent.
    Tasks,
}

impl std::fmt::Display for Phase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Phase::Spec => write!(f, "spec"),
            Phase::Plan => write!(f, "plan"),
            Phase::Implement => write!(f, "implement"),
            Phase::Test => write!(f, "test"),
            Phase::Review => write!(f, "review"),
            Phase::Analysis => write!(f, "analysis"),
            Phase::Security => write!(f, "security"),
            Phase::Docs => write!(f, "docs"),
            Phase::Constitution => write!(f, "constitution"),
            Phase::Tasks => write!(f, "tasks"),
        }
    }
}

/// Human gate decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GateAction {
    Approve,
    Reject,
    Edit(PathBuf),
}

/// Events emitted by the pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineEvent {
    PhaseStarted {
        phase: Phase,
        session_id: String,
    },
    PhaseCompleted {
        phase: Phase,
        session_id: String,
    },
    PhaseFailed {
        phase: Phase,
        session_id: String,
        error: String,
    },
    AgentLog {
        phase: Phase,
        message: String,
    },
    GateRequired {
        phase: Phase,
        session_id: String,
        description: String,
    },
    GateResolved {
        phase: Phase,
        session_id: String,
        action: GateAction,
    },
    PrCreated {
        session_id: String,
        url: String,
        title: String,
    },
}

/// Wrapper around a tokio broadcast channel.
#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<PipelineEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PipelineEvent> {
        self.sender.subscribe()
    }

    /// Send an event; returns the number of active receivers.
    pub fn send(&self, event: PipelineEvent) -> usize {
        self.sender.send(event).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_send_receive() {
        let bus = EventBus::new(16);
        let mut rx = bus.subscribe();

        bus.send(PipelineEvent::PhaseStarted {
            phase: Phase::Spec,
            session_id: "test-session".to_string(),
        });

        let event = rx.recv().await.unwrap();
        match event {
            PipelineEvent::PhaseStarted { phase, session_id } => {
                assert_eq!(phase, Phase::Spec);
                assert_eq!(session_id, "test-session");
            }
            _ => panic!("unexpected event"),
        }
    }

    #[test]
    fn test_phase_display() {
        assert_eq!(Phase::Spec.to_string(), "spec");
        assert_eq!(Phase::Plan.to_string(), "plan");
        assert_eq!(Phase::Implement.to_string(), "implement");
        assert_eq!(Phase::Test.to_string(), "test");
        assert_eq!(Phase::Review.to_string(), "review");
        assert_eq!(Phase::Analysis.to_string(), "analysis");
        assert_eq!(Phase::Security.to_string(), "security");
        assert_eq!(Phase::Docs.to_string(), "docs");
        assert_eq!(Phase::Constitution.to_string(), "constitution");
        assert_eq!(Phase::Tasks.to_string(), "tasks");
    }

    #[test]
    fn test_phase_is_copy() {
        let p = Phase::Spec;
        let _q = p; // copy
        let _r = p; // still usable after copy
    }
}
