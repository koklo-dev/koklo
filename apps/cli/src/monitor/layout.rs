use super::*;

pub(crate) fn terminal_layout(area: Rect) -> TerminalLayout {
    if area.width < 72 || area.height < 22 {
        TerminalLayout::Compact
    } else if area.width < 110 || area.height < 30 {
        TerminalLayout::Stacked
    } else {
        TerminalLayout::Wide
    }
}

pub(crate) fn centered_overlay_rect(
    area: Rect,
    width_percent: u16,
    desired_height: u16,
    min_width: u16,
) -> Rect {
    let max_width = area.width.saturating_sub(2).max(1);
    let max_height = area.height.saturating_sub(2).max(1);
    let desired_width = area
        .width
        .saturating_mul(width_percent)
        .saturating_div(100)
        .max(min_width);
    let width = desired_width.min(max_width);
    let height = desired_height.min(max_height);
    let x = area.x + area.width.saturating_sub(width) / 2;
    let y = area.y + area.height.saturating_sub(height) / 2;
    Rect::new(x, y, width, height)
}
