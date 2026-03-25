use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    koklo_cli::run().await
}
