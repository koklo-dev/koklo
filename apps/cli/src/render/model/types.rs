#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderTone {
    Default,
    Muted,
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RenderBlockKind {
    Assistant,
    Reasoning,
    Plan,
    Tool,
    Command,
    FileChange,
    Approval,
    UserInput,
    Usage,
    Lifecycle,
    Metadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RenderBlockBody {
    Markdown(String),
    Lines(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderBlock {
    pub kind: RenderBlockKind,
    pub tone: RenderTone,
    pub source_kind: String,
    pub status: Option<String>,
    pub item_key: Option<String>,
    pub seq: i64,
    pub created_at: Option<String>,
    pub body: RenderBlockBody,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TranscriptRenderModel {
    pub agent_name: Option<String>,
    pub blocks: Vec<RenderBlock>,
}
