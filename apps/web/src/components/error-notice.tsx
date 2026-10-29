import { Alert, AlertDescription, AlertTitle, Button, Icon, type IconName } from "@koklo/ui";
import type { ComponentProps, ReactNode } from "react";

interface ErrorNoticeProps extends Omit<ComponentProps<typeof Alert>, "title" | "variant"> {
  title?: string;
  children: ReactNode;
  icon?: IconName;
  onRetry?: () => void;
}

/** Erreur globale d'un écran : `Alert` destructive, icône + titre + texte (jamais la couleur seule). */
export function ErrorNotice({
  title,
  children,
  icon = "warning",
  onRetry,
  ...props
}: ErrorNoticeProps) {
  return (
    <Alert variant="destructive" {...props}>
      <Icon name={icon} size={20} />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{children}</p>
        {onRetry ? (
          <Button variant="outline" className="h-11 md:h-9" onClick={onRetry}>
            Réessayer
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
