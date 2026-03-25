mod args;
mod dispatch;

use anyhow::Result;
use clap::Parser;

pub(crate) use args::*;

pub(crate) async fn run() -> Result<()> {
    let cli = Cli::parse();
    dispatch::dispatch(cli).await
}
