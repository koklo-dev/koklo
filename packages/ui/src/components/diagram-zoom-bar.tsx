import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { zoomPercent } from "../lib/diagram-zoom.ts";

export interface DiagramZoomBarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  /** Plein écran (B479) : présent, la barre gagne le bouton bascule « Plein écran » (`aria-pressed`). */
  fullscreen?: { active: boolean; onToggle: () => void } | undefined;
}

const BUTTON =
  "inline-flex size-[30px] items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:size-11";

function ZoomButton({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={BUTTON}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/**
 * Barre de zoom flottante du lecteur (maquette 11 l.199-205) : « − », pourcentage, « + », filet, « Ajuster », et
 * « Plein écran » quand le lecteur le propose (B479).
 */
export function DiagramZoomBar({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  fullscreen,
}: DiagramZoomBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Zoom du diagramme"
      className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border border-border bg-background p-[3px] shadow-floating"
    >
      <ZoomButton icon="remove" label="Dézoomer" onClick={onZoomOut} />
      <button
        type="button"
        // Le nom reprend le texte visible (WCAG 2.5.3) : « 50 % » y figure.
        aria-label={`${zoomPercent(zoom)} %, revenir à 100 %`}
        title="Revenir à 100 %"
        onClick={onReset}
        className={cn(BUTTON, "w-auto min-w-14 px-1.5 font-mono text-caption font-normal")}
      >
        {zoomPercent(zoom)} %
      </button>
      <ZoomButton icon="add" label="Zoomer" onClick={onZoomIn} />
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      <ZoomButton icon="fit_screen" label="Ajuster à l'écran" onClick={onFit} />
      {fullscreen ? (
        <ZoomButton
          icon={fullscreen.active ? "fullscreen_exit" : "fullscreen"}
          label="Plein écran"
          pressed={fullscreen.active}
          onClick={fullscreen.onToggle}
        />
      ) : null}
    </div>
  );
}
