import { Alert, AlertDescription, AlertTitle, Button, Icon } from "@koklo/ui";
import type { FailureNotice } from "../lib/kanban-failure.ts";

interface KanbanNoticeProps {
  notice: FailureNotice;
  onAction: () => void;
  onClose: () => void;
}

/** Refus ou échec d'un déplacement : un seul message à la fois, fermable, jamais la couleur seule. */
export function KanbanNotice({ notice, onAction, onClose }: KanbanNoticeProps) {
  return (
    <Alert variant="destructive" className="pr-14">
      <Icon name={notice.icon} size={20} />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{notice.text}</p>
        {notice.action ? (
          <Button variant="outline" className="h-11 md:h-9" onClick={onAction}>
            {notice.action === "reload" ? "Recharger" : "Réessayer"}
          </Button>
        ) : null}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Fermer le message"
        className="absolute top-1 right-1 size-11 md:size-9"
        onClick={onClose}
      >
        <Icon name="close" size={20} />
      </Button>
    </Alert>
  );
}
