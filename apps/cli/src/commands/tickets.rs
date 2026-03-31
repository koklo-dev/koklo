use anyhow::{bail, Result};
use koklo_ticket_system::{TicketPriority, TicketStatus, TicketStore};

use crate::home_dirs;

async fn open_ticket_store() -> Result<TicketStore> {
    let db_path = home_dirs::koklo_db_path();
    TicketStore::open(&db_path).await
}

fn current_project_path() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub(crate) async fn cmd_tickets_list(status: Option<String>) -> Result<()> {
    let store = open_ticket_store().await?;
    let status_filter = status
        .as_deref()
        .map(|s| {
            TicketStatus::parse(s).ok_or_else(|| {
                anyhow::anyhow!("Unknown status '{s}'. Valid: open, in-progress, done, closed")
            })
        })
        .transpose()?;
    let tickets = store.list(status_filter).await?;
    if tickets.is_empty() {
        println!("No tickets found.");
    } else {
        println!("{:<10} {:<12} {:<10} TITLE", "ID", "STATUS", "PRIORITY");
        println!("{}", "-".repeat(60));
        for ticket in &tickets {
            println!(
                "{:<10} {:<12} {:<10} {}",
                &ticket.id[..8],
                ticket.status,
                ticket.priority,
                ticket.title
            );
        }
        println!("\n{} ticket(s)", tickets.len());
    }
    Ok(())
}

pub(crate) async fn cmd_tickets_create(
    title: &str,
    description: Option<String>,
    priority: Option<String>,
    tags: Option<String>,
) -> Result<()> {
    let store = open_ticket_store().await?;
    let prio = priority
        .as_deref()
        .map(|s| {
            TicketPriority::parse(s).ok_or_else(|| {
                anyhow::anyhow!("Unknown priority '{s}'. Valid: low, medium, high, critical")
            })
        })
        .transpose()?
        .unwrap_or(TicketPriority::Medium);
    let id = store
        .create(
            title,
            description.as_deref().unwrap_or(""),
            prio,
            tags.as_deref().unwrap_or(""),
            &current_project_path(),
        )
        .await?;
    println!("Created ticket {}", &id[..8]);
    Ok(())
}

pub(crate) async fn cmd_tickets_show(id: &str) -> Result<()> {
    let store = open_ticket_store().await?;
    match store.get(id).await? {
        Some(ticket) => {
            println!("ID:          {}", ticket.id);
            println!("Title:       {}", ticket.title);
            println!("Status:      {}", ticket.status);
            println!("Priority:    {}", ticket.priority);
            if !ticket.description.is_empty() {
                println!("Description: {}", ticket.description);
            }
            if !ticket.tags.is_empty() {
                println!("Tags:        {}", ticket.tags);
            }
            if let Some(ref sid) = ticket.session_id {
                println!("Session:     {}", sid);
            }
            println!("Project:     {}", ticket.project_path);
            println!("Created:     {}", ticket.created_at);
            println!("Updated:     {}", ticket.updated_at);
        }
        None => bail!("Ticket not found: {id}"),
    }
    Ok(())
}

pub(crate) async fn cmd_tickets_update(id: &str, status: &str) -> Result<()> {
    let store = open_ticket_store().await?;
    let st = TicketStatus::parse(status).ok_or_else(|| {
        anyhow::anyhow!("Unknown status '{status}'. Valid: open, in-progress, done, closed")
    })?;
    if store.update_status(id, st).await? {
        println!("Updated ticket {} → {}", id, st);
    } else {
        bail!("Ticket not found: {id}");
    }
    Ok(())
}

pub(crate) async fn cmd_tickets_close(id: &str) -> Result<()> {
    let store = open_ticket_store().await?;
    if store.close(id).await? {
        println!("Closed ticket {id}");
    } else {
        bail!("Ticket not found: {id}");
    }
    Ok(())
}
