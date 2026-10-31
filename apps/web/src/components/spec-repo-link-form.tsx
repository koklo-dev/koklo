import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon } from "@koklo/ui";
import { type KeyboardEvent, useState } from "react";
import { FormField } from "./form-field.tsx";

interface LinkFormProps {
  ownerLogin: string;
  /** Nom saisi dans le champ « Nom du dépôt » au moment du dépliage. */
  initialName: string;
  pending: boolean;
  error: string | undefined;
  defaultOpen: boolean;
  onSubmit: (name: string) => void;
}

function LinkFields({
  ownerLogin,
  initialName,
  pending,
  error,
  onSubmit,
}: Omit<LinkFormProps, "defaultOpen">) {
  const [name, setName] = useState(initialName);
  // Entrée ne doit pas relancer la création du dépôt (formulaire du panneau) : elle relie.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onSubmit(name);
  };
  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-[13px] text-muted-foreground">
        Si ce dépôt est déjà prêt, indiquez son nom : Koklo le reliera à ce projet sans le modifier.
      </p>
      <p className="text-sm">
        Propriétaire : <span className="font-mono">{ownerLogin}</span>
      </p>
      <FormField
        label="Nom du dépôt existant"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKeyDown}
        readOnly={pending}
        error={error}
        autoComplete="off"
      />
      <Button
        className="h-11 md:h-9"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => onSubmit(name)}
      >
        Relier ce dépôt
      </Button>
    </div>
  );
}

/** Repli « Relier un dépôt existant » (design/screens/S-projects.md §5.3), replié par défaut. */
export function SpecRepoLinkForm({ defaultOpen, ...fields }: LinkFormProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="h-11 w-full md:h-9">
          <Icon name="link" size={20} />
          Relier un dépôt existant
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <LinkFields {...fields} />
      </CollapsibleContent>
    </Collapsible>
  );
}
