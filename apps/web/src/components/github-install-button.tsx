import { Button, Icon } from "@koklo/ui";
import { REDIRECTING_LABEL } from "../lib/github-labels.ts";

export const INSTALL_LABEL = "Installer l'application GitHub";
export const INSTALL_HELP =
  "Vous serez redirigé vers GitHub, puis ramené ici. Il faut être propriétaire du compte GitHub, ou administrateur de l'organisation GitHub.";

interface InstallButtonProps {
  onInstall: () => void;
  /** Une redirection est en cours (toute la page est figée). */
  locked: boolean;
  /** C'est ce bouton qui a lancé la redirection. */
  redirecting: boolean;
}

/** Bouton principal d'installation, avec son texte d'aide. */
export function InstallButton({ onInstall, locked, redirecting }: InstallButtonProps) {
  return (
    <div className="flex flex-col gap-2 md:items-start">
      <Button
        className="h-11 w-full md:h-9 md:w-auto"
        disabled={locked}
        aria-busy={redirecting || undefined}
        onClick={onInstall}
      >
        {redirecting ? null : <Icon name="add" size={20} />}
        {redirecting ? REDIRECTING_LABEL : INSTALL_LABEL}
      </Button>
      <p className="text-[13px] text-muted-foreground">{INSTALL_HELP}</p>
    </div>
  );
}
