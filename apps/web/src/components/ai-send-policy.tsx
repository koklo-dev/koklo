import { Alert, Icon } from "@koklo/ui";

/**
 * Bloc permanent « Ce qui est envoyé à Anthropic » (S-framing §3.2) : affichage seul, jamais replié, sans case à
 * cocher ni consentement mémorisé. Toujours dans le document avant le bouton d'appel de l'étape.
 * `reminder` : rappel d'une ligne sous la barre d'enregistrement.
 */
export function AiSendPolicy({ variant = "full" }: { variant?: "full" | "reminder" }) {
  if (variant === "reminder") {
    return (
      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <Icon name="lock" size={16} className="mt-0.5" />
        <span>Ces propositions viennent d'Anthropic et ne sont pas encore enregistrées.</span>
      </p>
    );
  }
  return (
    <Alert role="note" data-slot="ai-send-policy">
      <Icon name="lock" size={16} />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Ce qui est envoyé à Anthropic</h3>
        <p className="text-[13px]">
          Le texte saisi sur cet écran (idée, précisions, brief) et les titres, statuts et priorités
          des fonctionnalités déjà présentes dans le projet sont envoyés à Anthropic (États-Unis),
          avec la clé de votre organisation.
        </p>
        <p className="text-[13px]">Ne saisissez pas de données personnelles.</p>
        <p className="text-[13px]">
          Jamais envoyés : clés, identifiants de personnes, noms de l'organisation, du projet ou des
          dépôts.
        </p>
        <p className="text-[13px]">
          Rien n'est enregistré dans votre projet avant votre confirmation.
        </p>
        <p className="text-[13px] text-muted-foreground">
          Les appels sont comptés pour votre organisation.
        </p>
      </div>
    </Alert>
  );
}
