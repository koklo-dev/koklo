//! Sandboxed shell execution.
//!
//! - LandlockSandbox: read-only phases (Spec, Plan, Review)
//! - BubblewrapSandbox: read-write phases (Implement, Test)
//! - ControlledShell: shows command to human before executing
use anyhow::Result;
use async_trait::async_trait;
use std::path::PathBuf;

/// Output from running a command inside a sandbox.
#[derive(Debug, Clone)]
pub struct SandboxOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// A sandboxed execution environment.
#[async_trait]
pub trait Sandbox: Send + Sync {
    /// Run a shell command in the sandbox, return its output.
    async fn run(&self, command: &str, workdir: &PathBuf) -> Result<SandboxOutput>;
}

/// Read-only sandbox using process-level restrictions.
/// For production: uses Landlock LSM. Falls back to basic restrictions.
pub struct LandlockSandbox {
    pub allowed_read_paths: Vec<PathBuf>,
}

impl LandlockSandbox {
    pub fn new(allowed_read_paths: Vec<PathBuf>) -> Self {
        Self { allowed_read_paths }
    }
}

#[async_trait]
impl Sandbox for LandlockSandbox {
    async fn run(&self, command: &str, workdir: &PathBuf) -> Result<SandboxOutput> {
        tracing::info!("LandlockSandbox running: {}", command);
        // In production, apply Landlock rules before spawning.
        // For now: run with restricted env vars and no write access checks.
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(workdir)
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .output()
            .await?;
        Ok(SandboxOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
}

/// Read-write sandbox using bubblewrap (bwrap).
pub struct BubblewrapSandbox {
    pub network: bool,
}

impl BubblewrapSandbox {
    pub fn new(network: bool) -> Self {
        Self { network }
    }
}

#[async_trait]
impl Sandbox for BubblewrapSandbox {
    async fn run(&self, command: &str, workdir: &PathBuf) -> Result<SandboxOutput> {
        tracing::info!("BubblewrapSandbox running: {}", command);
        // Build bwrap command with appropriate restrictions
        let mut bwrap_args = vec![
            "--bind", "/", "/",
            "--proc", "/proc",
            "--dev", "/dev",
            "--tmpfs", "/tmp",
        ];
        if !self.network {
            bwrap_args.push("--unshare-net");
        }
        bwrap_args.extend_from_slice(&["--", "sh", "-c", command]);

        let bwrap_available = which_bwrap();
        if bwrap_available {
            let output = tokio::process::Command::new("bwrap")
                .args(&bwrap_args)
                .current_dir(workdir)
                .output()
                .await?;
            Ok(SandboxOutput {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(-1),
            })
        } else {
            tracing::warn!("bwrap not found, falling back to unsandboxed execution");
            let output = tokio::process::Command::new("sh")
                .arg("-c")
                .arg(command)
                .current_dir(workdir)
                .output()
                .await?;
            Ok(SandboxOutput {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(-1),
            })
        }
    }
}

fn which_bwrap() -> bool {
    std::process::Command::new("which")
        .arg("bwrap")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
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
    async fn run(&self, command: &str, workdir: &PathBuf) -> Result<SandboxOutput> {
        // Print command for human review
        println!("\n[CONTROLLED SHELL] About to execute:");
        println!("  $ {}", command);
        println!("  workdir: {}", workdir.display());
        println!("  [Press Enter to approve, Ctrl-C to abort]");

        // Wait for human confirmation
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        self.inner.run(command, workdir).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
