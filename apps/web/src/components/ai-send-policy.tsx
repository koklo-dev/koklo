import { Icon, InlineAlert } from "@koklo/ui";

/** Ligne du bloc d'envoi (S-framing §3.2 v2, B15) : jamais le nom du fournisseur ni son pays. */
export const SEND_LINE = "Votre texte est envoyé à l'agent IA avec la clé de l'organisation.";

/** Détail dépliable : ce qui part, ce qui ne part jamais, rien d'enregistré sans confirmation (B24). */
export function SendPolicyDetails() {
  return (
    <div className="flex flex-col gap-2">
      <p>
        Le texte saisi sur cet écran (idée, précisions, brief) et les titres, statuts et priorités
        des fonctionnalités déjà présentes dans le projet sont envoyés à l'agent IA, avec la clé de
        votre organisation.
      </p>
      <p>Ne saisissez pas de données personnelles.</p>
      <p>
        Jamais envoyés : clés, identifiants de personnes, noms de l'organisation, du projet ou des
        dépôts.
      </p>
      <p>Rien n'est enregistré dans votre projet avant votre confirmation.</p>
      <p className="text-muted-foreground">Les appels sont comptés pour votre organisation.</p>
    </div>
  );
}

/**
 * Bloc d'envoi à l'agent IA (S-framing §3.2 v2, S-ai-settings) : `InlineAlert` neutre d'une ligne et
 * « Détails » replié par défaut, sans case à cocher ni consentement mémorisé. Toujours dans le document avant
 * le bouton d'appel de l'étape, donc avant toute requête. `reminder` : rappel d'une ligne sous la barre
 * d'enregistrement, sans action (ce n'est pas une seconde alerte).
 */
export function AiSendPolicy({ variant = "full" }: { variant?: "full" | "reminder" }) {
  if (variant === "reminder") {
    return (
      <p className="flex items-start gap-2 text-meta text-muted-foreground">
        <Icon name="lock" size={16} className="mt-0.5" />
        <span>Ces propositions viennent de l'agent IA et ne sont pas encore enregistrées.</span>
      </p>
    );
  }
  return (
    <InlineAlert variant="neutral" icon="lock" details={<SendPolicyDetails />}>
      {SEND_LINE}
    </InlineAlert>
  );
}
