//! Desktop bootstrap library for Koklo Community.

pub mod account;
pub mod bridge;
pub(crate) mod config;
pub mod gates;
pub mod handlers;
pub mod ipc;
pub mod providers;
pub mod runtime;
pub mod sessions;

pub fn app_name() -> &'static str {
    "koklo-desktop"
}

pub fn run() {
    runtime::run();
}
