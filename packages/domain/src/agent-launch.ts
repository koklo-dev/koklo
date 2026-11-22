/**
 * Lancements d'agent et propositions (TK-99a, B314) : file pg-boss du worker, vocabulaire fermé et
 * plafonds partagés par l'API (qui dépose `{ launchId }` seul) et le worker (qui génère). Pures, sans I/O.
 */

/** File pg-boss du worker ; l'API y dépose `{ launchId }` seul, jamais un texte ni un secret. */
export const AGENT_PROPOSE_QUEUE = "agent-propose";

/** Clé de singleton : une seule exécution à la fois par lancement. */
export const agentProposeSingletonKey = (launchId: string): string => launchId;

/** Les sept livrables de la spec, dans l'ordre de rédaction (passation 21 §0). */
export const DELIVERABLES = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
] as const;
export type Deliverable = (typeof DELIVERABLES)[number];

/** Modes de lancement du Fonctionnel. */
export const FUNCTIONAL_MODES = ["complete", "criteria", "update", "all"] as const;
export type FunctionalMode = (typeof FUNCTIONAL_MODES)[number];

export const AGENT_LAUNCH_STATUSES = ["queued", "running", "done", "failed", "canceled"] as const;
export type AgentLaunchStatus = (typeof AGENT_LAUNCH_STATUSES)[number];

export const AGENT_PROPOSAL_KINDS = [
  "feature",
  "criteria",
  "rule",
  "role",
  "flow",
  "table",
  "relations",
  "fixtures",
  /** Architecture (TK-111) : composant, flux technique, décision et section du document. */
  "component",
  "archflow",
  "adr",
  "doc_section",
] as const;
export type AgentProposalKind = (typeof AGENT_PROPOSAL_KINDS)[number];

export const AGENT_PROPOSAL_STATUSES = ["pending", "accepted", "rejected"] as const;
export type AgentProposalStatus = (typeof AGENT_PROPOSAL_STATUSES)[number];

/**
 * Plafonds d'un lancement : zones, propositions par zone et par lancement, consigne libre. TK-114b : segments enchaînés d'un
 * même lancement (B617), liens `owns`/`serves` d'un composant (B615), paquets et appels de la passe de couverture (B616).
 * TK-114d : rôles sans application par paquet (B653), flux repris par lancement (B655).
 */
export const AGENT_PROPOSE_LIMITS = {
  zones: 12,
  perZone: 25,
  perLaunch: 500,
  instruction: 500,
  segments: 8,
  links: 200,
  coverage: { features: 15, flows: 5, components: 10, calls: 30, roles: 5, reprises: 60 },
} as const;

/** Motif fermé d'une zone écartée (B618) : jamais le texte du fournisseur. */
export const LAUNCH_DISCARD_REASONS = [
  "truncated",
  "output_invalid",
  "prompt_rejected",
  "refused",
] as const;
export type LaunchDiscardReason = (typeof LAUNCH_DISCARD_REASONS)[number];

/** Motif d'arrêt d'un lancement (B618) : `completed` et `cap` finissent `done`, `deadline` finit `failed` (`timeout`). */
export const LAUNCH_STOP_REASONS = ["completed", "cap", "deadline", "cancelled"] as const;
export type LaunchStopReason = (typeof LAUNCH_STOP_REASONS)[number];

/** Ce que l'agent lit pour chaque livrable (« L'agent lit ») : jamais rien d'autre n'est envoyé au modèle. */
export const AGENT_READS = {
  functional: ["idea.frozen", "idea.synthesis", "idea.risks", "functional.current"],
  /** Données (TK-107, B387) : le Fonctionnel indexé et le modèle actuel ; ni dossier d'idée, ni version figée. */
  data: [
    "functional.features",
    "functional.rules",
    "functional.roles",
    "functional.flows",
    "data.current",
  ],
  /** Architecture (TK-111, B512) : le Fonctionnel, les tables, l'architecture actuelle et les exigences connues (lues tolérantes). */
  architecture: [
    "functional.features",
    "functional.rules",
    "functional.roles",
    "functional.flows",
    "data.tables",
    "architecture.current",
    "nfr.known",
  ],
} as const;

/** Un lancement `running` sans signal depuis plus de 5 minutes est perdu : son verrou est repris. */
export const AGENT_LAUNCH_STALE_MS = 5 * 60_000;

/** Fin de lancement sans lecture de la liste depuis plus de 30 secondes : l'utilisateur est parti. */
export const PROPOSAL_NOTIFY_AFTER_MS = 30_000;

/** Une mise à jour de `lastSeenAt` au plus toutes les 10 secondes. */
export const LAST_SEEN_THROTTLE_MS = 10_000;

export const isActiveLaunch = (status: AgentLaunchStatus): boolean =>
  status === "queued" || status === "running";

export const isStaleLaunch = (status: AgentLaunchStatus, heartbeatAt: Date, now: Date): boolean =>
  status === "running" && now.getTime() - heartbeatAt.getTime() > AGENT_LAUNCH_STALE_MS;
