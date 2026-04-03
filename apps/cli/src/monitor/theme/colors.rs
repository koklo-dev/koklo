//! Color palette — "L'Aube Africaine" adapted for terminal RGB.

use ratatui::style::Color;

// ── Brand ──────────────────────────────────────────────────────────
pub const PRIMARY: Color = Color::Rgb(30, 58, 95); // #1E3A5F deep blue
pub const PRIMARY_DARK: Color = Color::Rgb(22, 48, 79); // #16304F
pub const PRIMARY_LIGHT: Color = Color::Rgb(219, 234, 254); // #DBEAFE
pub const ACCENT: Color = Color::Rgb(245, 158, 11); // #F59E0B amber
pub const ACCENT_HOVER: Color = Color::Rgb(217, 119, 6); // #D97706
pub const ACCENT_LIGHT: Color = Color::Rgb(252, 211, 77); // #FCD34D
pub const BMAD: Color = Color::Rgb(139, 92, 246); // #8B5CF6 violet

// ── Semantic ───────────────────────────────────────────────────────
pub const SUCCESS: Color = Color::Rgb(22, 163, 74); // #16A34A
pub const SUCCESS_LIGHT: Color = Color::Rgb(220, 252, 231); // #DCFCE7
pub const WARNING: Color = Color::Rgb(217, 119, 6); // #D97706
pub const WARNING_LIGHT: Color = Color::Rgb(254, 243, 199); // #FEF3C7
pub const DANGER: Color = Color::Rgb(220, 38, 38); // #DC2626
pub const DANGER_LIGHT: Color = Color::Rgb(254, 226, 226); // #FEE2E2
pub const INFO: Color = Color::Rgb(8, 145, 178); // #0891B2

// ── Surfaces ───────────────────────────────────────────────────────
pub const BG: Color = Color::Reset; // terminal default
pub const SURFACE: Color = Color::Rgb(28, 25, 23); // #1C1917
pub const SURFACE_HOVER: Color = Color::Rgb(41, 37, 36); // #292524
pub const BORDER: Color = Color::DarkGray;
pub const BORDER_FOCUS: Color = ACCENT;

// ── Text ───────────────────────────────────────────────────────────
pub const TEXT: Color = Color::White;
pub const TEXT_SECONDARY: Color = Color::Gray;
pub const TEXT_MUTED: Color = Color::DarkGray;

// ── Sidebar ────────────────────────────────────────────────────────
pub const SIDEBAR_BG: Color = PRIMARY;
pub const SIDEBAR_TEXT: Color = Color::Rgb(231, 229, 228); // #E7E5E4
pub const SIDEBAR_ACTIVE: Color = ACCENT;
