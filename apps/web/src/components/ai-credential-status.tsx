import type { LlmCredentialStatusOutput } from "@koklo/contract";
import { Badge, Icon, type IconName, StatusBadge } from "@koklo/ui";
import { AI_SETTINGS_LABELS as L, longDate, verifiedNow } from "../lib/ai-settings-labels.ts";
import type { SessionState } from "../lib/ai-settings-session.ts";

type Status = LlmCredentialStatusOutput | undefined;

/** L'état affiché de la clé : la session (409, vérification) prime sur ce que `list` sait. */
export type CardState = "absent" | "configured" | "invalid" | "unreadable";

export function cardStateOf(item: Status, session: SessionState): CardState {
  // Un 409 à la vérification fait foi, même avant que `list` rechargée le confirme.
  if (session.unreadable) return "unreadable";
  if (session.invalidated || item?.invalid) return "invalid";
  return item ? "configured" : "absent";
}

function OutlineBadge({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="text-foreground">
      <span className="inline-flex items-center gap-1">
        <Icon name={icon} size={16} />
        {children}
      </span>
    </Badge>
  );
}

/** Statut de la clé : icône + texte, jamais la couleur seule. « Configurée » ne veut pas dire « vérifiée ». */
export function AiCredentialStatus({
  item,
  state,
  verifying,
}: {
  item: Status;
  state: CardState;
  verifying: boolean;
}) {
  if (verifying) return <OutlineBadge icon="schedule">{L.verifying}</OutlineBadge>;
  if (state === "configured") return <StatusBadge status="validated" label={L.configured} />;
  if (state === "unreadable") return <OutlineBadge icon="warning">{L.unreadable}</OutlineBadge>;
  if (state === "invalid") {
    const at = item?.invalidatedAt;
    return (
      <OutlineBadge icon="warning">{`${L.invalid}${at ? ` le ${longDate(at)}` : ""}`}</OutlineBadge>
    );
  }
  return <OutlineBadge icon="block">{L.absent}</OutlineBadge>;
}

const FACT = "min-w-0 break-words";

/** Lecture seule d'une clé existante : dates en texte, modèle en mono. Aucun indice sur la clé (ADR 0013). */
export function AiCredentialFacts({
  item,
  verifiedModel,
}: {
  item: NonNullable<Status>;
  verifiedModel: string | null;
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
      <li className={FACT}>{`Enregistrée le ${longDate(item.createdAt)}`}</li>
      {item.updatedAt === item.createdAt ? null : (
        <li className={FACT}>{`Modifiée le ${longDate(item.updatedAt)}`}</li>
      )}
      <li className={FACT}>
        {item.lastUsedAt
          ? `Dernière utilisation : ${longDate(item.lastUsedAt)}`
          : "Jamais utilisée"}
      </li>
      {item.defaultModel ? (
        <li className={FACT}>
          Modèle par défaut : <span className="font-mono">{item.defaultModel}</span>
        </li>
      ) : null}
      {verifiedModel ? <li className={FACT}>{verifiedNow(verifiedModel)}</li> : null}
    </ul>
  );
}
