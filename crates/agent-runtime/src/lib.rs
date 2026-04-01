//! Agent execution runtime — loads system prompts and dispatches LLM calls.
mod builtin_agents;
mod runtime;
mod synthetic_user_input;
mod system_prompt;

pub use builtin_agents::{
    builtin_agent_files, builtin_agent_profile_data, builtin_agent_prompt, builtin_agent_slugs,
    builtin_shared_project_prompt, BuiltinAgentFile,
};
pub use runtime::{
    set_stdout_streaming_enabled, AgentConfig, AgentRunResult, AgentRunner, ApprovalHandler,
    UserInputHandler,
};
pub use system_prompt::build_system_prompt;
