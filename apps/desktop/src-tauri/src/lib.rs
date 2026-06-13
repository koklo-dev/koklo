//! Desktop bootstrap library for Koklo Community.

pub mod gates;
pub mod handlers;
pub mod ipc;
pub mod providers;

pub fn app_name() -> &'static str {
    "koklo-desktop"
}
