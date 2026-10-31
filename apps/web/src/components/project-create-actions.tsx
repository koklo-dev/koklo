import { Button, SheetFooter } from "@koklo/ui";
import { REDIRECTING_LABEL } from "../lib/github-labels.ts";
import type { CreationPanel } from "../lib/use-creation-panel.ts";

interface ActionsProps {
  panel: CreationPanel;
  /** Identifiant du texte de chargement des comptes, relié au bouton quand il est désactivé. */
  loadingId: string;
}

function Busy({ children }: { children: string }) {
  return (
    <Button type="submit" className="h-11 md:h-9" disabled aria-busy="true">
      {children}
    </Button>
  );
}

function FailedActions({ panel }: { panel: CreationPanel }) {
  const { phase, selected } = panel.creation;
  if (phase.name !== "failed") return null;
  const login = selected?.ownerLogin ?? "";
  switch (phase.view.action) {
    case "retry":
      return (
        <Button type="submit" className="h-11 md:h-9">
          Réessayer
        </Button>
      );
    case "close":
      return null;
    case "authorize":
    case "reauthorize": {
      const verb = phase.view.action === "authorize" ? "Autoriser" : "Réautoriser";
      return panel.authorizing ? (
        <Button className="h-11 md:h-9" disabled aria-busy="true">
          {REDIRECTING_LABEL}
        </Button>
      ) : (
        <Button
          className="h-11 md:h-9"
          aria-label={`${verb} Koklo sur ${login}`}
          onClick={panel.authorize}
        >
          {verb} Koklo
        </Button>
      );
    }
  }
}

/** Boutons du pied du panneau, selon l'étape (design/screens/S-projects.md §4.1). */
export function ProjectCreateActions({ panel, loadingId }: ActionsProps) {
  const { phase } = panel.creation;
  const close = (label: string) => (
    <Button
      variant="outline"
      className="h-11 md:h-9"
      disabled={panel.busy}
      onClick={panel.requestClose}
    >
      {label}
    </Button>
  );
  switch (phase.name) {
    case "form": {
      const ready = panel.accounts.status === "ready";
      return (
        <SheetFooter>
          <Button
            type="submit"
            className="h-11 md:h-9"
            disabled={!ready}
            aria-describedby={panel.accounts.status === "loading" ? loadingId : undefined}
          >
            Créer le projet
          </Button>
          {close("Annuler")}
        </SheetFooter>
      );
    }
    case "creating-project":
      return (
        <SheetFooter>
          <Busy>Création du projet…</Busy>
          {close("Annuler")}
        </SheetFooter>
      );
    case "creating-repo":
      return (
        <SheetFooter>
          <Busy>{phase.retry ? "Nouvelle tentative…" : "Création du dépôt…"}</Busy>
          {close("Fermer")}
        </SheetFooter>
      );
    case "ready":
      return (
        <SheetFooter>
          <Button type="submit" className="h-11 md:h-9">
            Créer le dépôt
          </Button>
          {close("Fermer")}
        </SheetFooter>
      );
    case "failed":
      return (
        <SheetFooter>
          <FailedActions panel={panel} />
          {close("Fermer")}
        </SheetFooter>
      );
    default:
      return <SheetFooter>{close("Fermer")}</SheetFooter>;
  }
}
