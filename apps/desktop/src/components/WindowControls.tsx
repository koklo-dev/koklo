import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "@koklo/ui";
import { Icon } from "@koklo/ui";
import "./WindowControls.css";

function win() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function WindowControls() {
  return (
    <div className="kk-window-controls" role="group" aria-label="Window controls">
      <IconButton
        icon={<Icon name="Minus" size={13} />}
        label="Minimize"
        onClick={() => void win()?.minimize()}
      />
      <IconButton
        icon={<Icon name="Square" size={13} />}
        label="Maximize"
        onClick={() => void win()?.toggleMaximize()}
      />
      <IconButton
        icon={<Icon name="X" size={13} />}
        label="Close"
        className="kk-window-controls-close"
        onClick={() => void win()?.close()}
      />
    </div>
  );
}
