//! Sandboxed shell execution.
//!
//! The current implementation focuses on OS-level write isolation:
//! - `LandlockSandbox`: read-only workspace profile
//! - `BubblewrapSandbox`: workspace-write profile
//! - `ControlledShell`: human approval wrapper
use anyhow::{Context, Result};
use async_trait::async_trait;
use std::collections::BTreeSet;
use std::env;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Program + args executed inside a sandbox.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub clear_env: bool,
}

impl CommandSpec {
    pub fn new(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            env: Vec::new(),
            clear_env: false,
        }
    }

    pub fn shell(command: impl Into<String>) -> Self {
        Self {
            program: "sh".to_string(),
            args: vec!["-c".to_string(), command.into()],
            env: Vec::new(),
            clear_env: false,
        }
    }

    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.args = args.into_iter().map(Into::into).collect();
        self
    }

    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }

    pub fn clear_env(mut self) -> Self {
        self.clear_env = true;
        self
    }
}

/// Output from running a command inside a sandbox.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// A sandboxed execution environment.
#[async_trait]
pub trait Sandbox: Send + Sync {
    /// Run a program in the sandbox, return its output.
    async fn run_command(&self, command: &CommandSpec, workdir: &Path) -> Result<SandboxOutput>;

    /// Run a shell command in the sandbox, return its output.
    async fn run(&self, command: &str, workdir: &Path) -> Result<SandboxOutput> {
        self.run_command(&CommandSpec::shell(command), workdir)
            .await
    }
}

/// Read-only sandbox using process-level restrictions.
/// When `bwrap` is available, writes are denied outside `/tmp`.
pub struct LandlockSandbox {
    pub allowed_read_paths: Vec<PathBuf>,
    pub network: bool,
}

impl LandlockSandbox {
    pub fn new(allowed_read_paths: Vec<PathBuf>) -> Self {
        Self {
            allowed_read_paths,
            network: true,
        }
    }

    pub fn with_network(allowed_read_paths: Vec<PathBuf>, network: bool) -> Self {
        Self {
            allowed_read_paths,
            network,
        }
    }
}

#[async_trait]
impl Sandbox for LandlockSandbox {
    async fn run_command(&self, command: &CommandSpec, workdir: &Path) -> Result<SandboxOutput> {
        tracing::info!(
            "LandlockSandbox running: {:?} {:?}",
            command.program,
            command.args
        );
        if bwrap_available() {
            run_with_bwrap(
                command,
                workdir,
                &self.allowed_read_paths,
                &[],
                self.network,
            )
            .await
        } else {
            tracing::warn!("bwrap not found, falling back to unsandboxed read-only profile");
            run_direct(command, workdir).await
        }
    }
}

/// Read-write sandbox using bubblewrap (bwrap).
pub struct BubblewrapSandbox {
    pub allowed_read_paths: Vec<PathBuf>,
    pub writable_paths: Vec<PathBuf>,
    pub network: bool,
}

impl BubblewrapSandbox {
    pub fn new(network: bool) -> Self {
        Self {
            allowed_read_paths: default_read_only_paths(),
            writable_paths: Vec::new(),
            network,
        }
    }

    pub fn with_writable_paths(writable_paths: Vec<PathBuf>, network: bool) -> Self {
        Self {
            allowed_read_paths: default_read_only_paths(),
            writable_paths,
            network,
        }
    }

    pub fn with_paths(
        allowed_read_paths: Vec<PathBuf>,
        writable_paths: Vec<PathBuf>,
        network: bool,
    ) -> Self {
        Self {
            allowed_read_paths,
            writable_paths,
            network,
        }
    }
}

#[async_trait]
impl Sandbox for BubblewrapSandbox {
    async fn run_command(&self, command: &CommandSpec, workdir: &Path) -> Result<SandboxOutput> {
        tracing::info!(
            "BubblewrapSandbox running: {:?} {:?}",
            command.program,
            command.args
        );
        if bwrap_available() {
            run_with_bwrap(
                command,
                workdir,
                &self.allowed_read_paths,
                &self.writable_paths,
                self.network,
            )
            .await
        } else {
            tracing::warn!("bwrap not found, falling back to unsandboxed write profile");
            run_direct(command, workdir).await
        }
    }
}

pub fn bwrap_available() -> bool {
    static BWRAP_USABLE: OnceLock<bool> = OnceLock::new();
    *BWRAP_USABLE.get_or_init(|| {
        which::which("bwrap").is_ok()
            && std::process::Command::new("bwrap")
                .args(["--ro-bind", "/", "/", "--", "/bin/true"])
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false)
    })
}

/// A controlled shell that shows commands to the human before executing.
pub struct ControlledShell {
    inner: Box<dyn Sandbox>,
}

impl ControlledShell {
    pub fn new(inner: Box<dyn Sandbox>) -> Self {
        Self { inner }
    }
}

#[async_trait]
impl Sandbox for ControlledShell {
    async fn run_command(&self, command: &CommandSpec, workdir: &Path) -> Result<SandboxOutput> {
        println!("\n[CONTROLLED SHELL] About to execute:");
        println!("  $ {} {}", command.program, command.args.join(" "));
        println!("  workdir: {}", workdir.display());
        println!("  [Press Enter to approve, Ctrl-C to abort]");

        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        self.inner.run_command(command, workdir).await
    }
}

async fn run_direct(command: &CommandSpec, workdir: &Path) -> Result<SandboxOutput> {
    let mut process = tokio::process::Command::new(&command.program);
    process.args(&command.args).current_dir(workdir);
    if command.clear_env {
        process.env_clear();
    }
    for (key, value) in &command.env {
        process.env(key, value);
    }
    let output = process.output().await?;
    Ok(SandboxOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

async fn run_with_bwrap(
    command: &CommandSpec,
    workdir: &Path,
    allowed_read_paths: &[PathBuf],
    writable_paths: &[PathBuf],
    network: bool,
) -> Result<SandboxOutput> {
    let resolved_workdir = workdir
        .canonicalize()
        .with_context(|| format!("Failed to resolve sandbox workdir {}", workdir.display()))?;
    let resolved_program = resolve_program(&command.program)?;
    let mount_plan = build_mount_plan(
        &resolved_workdir,
        &resolved_program,
        allowed_read_paths,
        writable_paths,
    )?;

    let mut bwrap = tokio::process::Command::new("bwrap");
    bwrap.arg("--die-with-parent").arg("--new-session");
    for dir in &mount_plan.pre_tmp_create_dirs {
        bwrap.arg("--dir").arg(dir);
    }
    bwrap
        .arg("--proc")
        .arg("/proc")
        .arg("--dev")
        .arg("/dev")
        .arg("--tmpfs")
        .arg("/tmp");

    for dir in &mount_plan.post_tmp_create_dirs {
        bwrap.arg("--dir").arg(dir);
    }
    for path in &mount_plan.read_only_paths {
        bwrap.arg("--ro-bind").arg(path).arg(path);
    }
    for path in &mount_plan.writable_paths {
        bwrap.arg("--bind").arg(path).arg(path);
    }
    bwrap.arg("--chdir").arg(&resolved_workdir);

    if !network {
        bwrap.arg("--unshare-net");
    }

    if command.clear_env {
        bwrap.arg("--clearenv");
    }
    for (key, value) in &command.env {
        bwrap.arg("--setenv").arg(key).arg(value);
    }

    bwrap.arg("--").arg(&resolved_program).args(&command.args);
    let output = bwrap.output().await?;
    Ok(SandboxOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

fn resolve_program(program: &str) -> Result<PathBuf> {
    if program.contains('/') {
        return Ok(PathBuf::from(program));
    }
    which::which(program).with_context(|| format!("Command not found in PATH: {}", program))
}

#[derive(Debug, Default)]
struct MountPlan {
    pre_tmp_create_dirs: Vec<PathBuf>,
    post_tmp_create_dirs: Vec<PathBuf>,
    read_only_paths: Vec<PathBuf>,
    writable_paths: Vec<PathBuf>,
}

fn build_mount_plan(
    workdir: &Path,
    program: &Path,
    allowed_read_paths: &[PathBuf],
    writable_paths: &[PathBuf],
) -> Result<MountPlan> {
    let mut read_only_paths = BTreeSet::new();
    let mut writable_mounts = BTreeSet::new();

    for path in default_runtime_roots() {
        read_only_paths.insert(path);
    }

    for path in default_env_read_paths() {
        read_only_paths.insert(path);
    }

    read_only_paths.insert(canonicalize_existing(program)?);
    if let Some(parent) = program.parent() {
        if parent.exists() {
            read_only_paths.insert(canonicalize_existing(parent)?);
        }
    }

    if workdir.exists() {
        read_only_paths.insert(canonicalize_existing(workdir)?);
    }

    for path in allowed_read_paths {
        if path.exists() {
            read_only_paths.insert(canonicalize_existing(path)?);
        }
    }

    for path in writable_paths {
        let canonical = canonicalize_existing(path)?;
        writable_mounts.insert(canonical.clone());
        read_only_paths.remove(&canonical);
    }

    let create_dirs = collect_mount_parent_dirs(
        read_only_paths
            .iter()
            .chain(writable_mounts.iter())
            .cloned()
            .collect::<Vec<_>>()
            .iter(),
    );

    let (post_tmp_create_dirs, pre_tmp_create_dirs): (Vec<_>, Vec<_>) = create_dirs
        .into_iter()
        .partition(|path| is_under_tmp(path));

    Ok(MountPlan {
        pre_tmp_create_dirs,
        post_tmp_create_dirs,
        read_only_paths: read_only_paths.into_iter().collect(),
        writable_paths: writable_mounts.into_iter().collect(),
    })
}

fn canonicalize_existing(path: &Path) -> Result<PathBuf> {
    path.canonicalize()
        .with_context(|| format!("Failed to resolve sandbox path {}", path.display()))
}

fn default_read_only_paths() -> Vec<PathBuf> {
    let mut paths = default_runtime_roots();
    paths.extend(default_env_read_paths());
    paths
}

fn default_runtime_roots() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for raw in [
        "/bin",
        "/sbin",
        "/usr",
        "/lib",
        "/lib64",
        "/etc",
        "/opt",
        "/snap",
        "/run/systemd/resolve",
    ] {
        let path = PathBuf::from(raw);
        if path.exists() {
            paths.push(path);
        }
    }

    for raw in ["/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf"] {
        let path = Path::new(raw);
        if let Ok(target) = path.canonicalize() {
            paths.push(target);
        }
    }

    paths
}

fn default_env_read_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    for dir in path_dirs_from_env() {
        paths.push(dir);
    }

    if let Ok(home) = env::var("HOME") {
        let home = PathBuf::from(home);
        for suffix in [
            ".claude",
            ".codex",
            ".config",
            ".cache",
            ".local",
            ".npm",
            ".nvm",
            ".cargo",
            ".gitconfig",
        ] {
            let path = home.join(suffix);
            if path.exists() {
                paths.push(path);
            }
        }
    }

    for key in [
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_DATA_HOME",
        "XDG_STATE_HOME",
        "KOKLO_HOME",
    ] {
        if let Ok(value) = env::var(key) {
            let path = PathBuf::from(value);
            if path.exists() {
                paths.push(path);
            }
        }
    }

    paths
}

fn path_dirs_from_env() -> Vec<PathBuf> {
    env::var_os("PATH")
        .map(|value| {
            env::split_paths(&value)
                .filter(|path| path.exists())
                .collect()
        })
        .unwrap_or_default()
}

fn collect_mount_parent_dirs<'a, I>(paths: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = &'a PathBuf>,
{
    let mut parents = BTreeSet::new();
    for path in paths {
        for ancestor in path.ancestors().skip(1) {
            if ancestor.as_os_str().is_empty() || ancestor == Path::new("/") {
                continue;
            }
            parents.insert(ancestor.to_path_buf());
        }
    }

    let mut parents: Vec<_> = parents.into_iter().collect();
    parents.sort_by_key(|path| path_depth(path));
    parents
}

fn path_depth(path: &Path) -> usize {
    path.components()
        .filter(|component| component.as_os_str() != OsStr::new("/"))
        .count()
}

fn is_under_tmp(path: &Path) -> bool {
    let tmp_root = Path::new("/tmp");
    path == tmp_root || path.starts_with(tmp_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn require_bwrap() -> bool {
        bwrap_available()
    }

    #[tokio::test]
    async fn test_landlock_sandbox_echo() {
        let sandbox = LandlockSandbox::new(vec![]);
        let workdir = PathBuf::from("/tmp");
        let out = sandbox.run("echo hello", &workdir).await.unwrap();
        assert_eq!(out.stdout.trim(), "hello");
        assert_eq!(out.exit_code, 0);
    }

    #[tokio::test]
    async fn test_landlock_sandbox_exit_code() {
        let sandbox = LandlockSandbox::new(vec![]);
        let workdir = PathBuf::from("/tmp");
        let out = sandbox.run("exit 1", &workdir).await.unwrap();
        assert_eq!(out.exit_code, 1);
    }

    #[tokio::test]
    async fn test_bubblewrap_allows_workspace_writes() {
        if !require_bwrap() {
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let sandbox = BubblewrapSandbox::with_writable_paths(vec![workspace.clone()], true);

        let out = sandbox
            .run("touch sandbox-write.txt", &workspace)
            .await
            .unwrap();

        assert_eq!(out.exit_code, 0);
        assert!(workspace.join("sandbox-write.txt").exists());
    }

    #[tokio::test]
    async fn test_bubblewrap_denies_writes_outside_workspace() {
        if !require_bwrap() {
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path().join("workspace");
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let sandbox = BubblewrapSandbox::with_writable_paths(vec![workspace], true);
        let cmd = format!("touch {}", outside.join("nope.txt").display());

        let out = sandbox.run(&cmd, tmp.path()).await.unwrap();

        assert_ne!(out.exit_code, 0);
        assert!(!outside.join("nope.txt").exists());
    }

    #[tokio::test]
    async fn test_bubblewrap_denies_reads_outside_allowed_paths() {
        if !require_bwrap() {
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path().join("workspace");
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), "top-secret").unwrap();

        let sandbox = BubblewrapSandbox::with_paths(vec![workspace.clone()], vec![workspace], true);
        let cmd = format!("cat {}", outside.join("secret.txt").display());

        let out = sandbox.run(&cmd, tmp.path()).await.unwrap();

        assert_ne!(out.exit_code, 0);
        assert!(!out.stdout.contains("top-secret"));
    }

    #[tokio::test]
    async fn test_landlock_denies_workspace_writes() {
        if !require_bwrap() {
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let sandbox = LandlockSandbox::new(vec![workspace.clone()]);

        let out = sandbox.run("touch blocked.txt", &workspace).await.unwrap();

        assert_ne!(out.exit_code, 0);
        assert!(!workspace.join("blocked.txt").exists());
    }

    #[tokio::test]
    async fn test_landlock_allows_reads_inside_allowed_paths() {
        if !require_bwrap() {
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(workspace.join("visible.txt"), "inside").unwrap();
        let sandbox = LandlockSandbox::new(vec![workspace.clone()]);

        let out = sandbox.run("cat visible.txt", &workspace).await.unwrap();

        assert_eq!(out.exit_code, 0);
        assert_eq!(out.stdout.trim(), "inside");
    }

    #[tokio::test]
    async fn test_run_command_executes_direct_program() {
        let sandbox = LandlockSandbox::new(vec![]);
        let workdir = PathBuf::from("/tmp");
        let out = sandbox
            .run_command(&CommandSpec::new("pwd"), &workdir)
            .await
            .unwrap();
        assert_eq!(out.stdout.trim(), "/tmp");
    }
}
