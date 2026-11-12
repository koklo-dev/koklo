import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

export interface ProposalGenerationBannerProps {
  /** Texte de l'état (« L'agent rédige… Cela peut prendre une minute. Vous pouvez quitter la page. »). */
  children: string;
  /** « Annuler l'attente » : quitte l'attente seulement, rien n'est annulé côté serveur. */
  onLeave?: () => void;
  /** Sans `role="status"` : quand la page porte déjà sa région d'état (relecture), une seule annonce reste. */
  silent?: boolean;
  className?: string;
}

/** Bandeau de génération (maquette 10 l.107-108) : bande pleine largeur `--diff-bg`, bordure basse, `progress_activity` primaire, `role="status"`. */
export function ProposalGenerationBanner({
  children,
  onLeave,
  silent = false,
  className,
}: ProposalGenerationBannerProps) {
  return (
    <div
      role={silent ? undefined : "status"}
      data-slot="proposal-generation-banner"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border bg-diff-bg px-4 py-2.5 text-meta md:px-7",
        className,
      )}
    >
      <Icon
        name="progress_activity"
        size={18}
        tone="primary"
        className="motion-safe:animate-spin"
      />
      <span className="min-w-0 flex-1">{children}</span>
      {onLeave ? (
        <Button variant="text" onClick={onLeave} className="h-11 font-semibold md:h-7">
          Annuler l'attente
        </Button>
      ) : null}
    </div>
  );
}
