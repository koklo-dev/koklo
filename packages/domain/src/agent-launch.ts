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

export const AGENT_PROPOSAL_KINDS = ["feature", "criteria", "rule", "role", "flow"] as const;
export type AgentProposalKind = (typeof AGENT_PROPOSAL_KINDS)[number];

export const AGENT_PROPOSAL_STATUSES = ["pending", "accepted", "rejected"] as const;
export type AgentProposalStatus = (typeof AGENT_PROPOSAL_STATUSES)[number];

/** Plafonds d'un lancement : zones, propositions par zone et par lancement, consigne libre. */
export const AGENT_PROPOSE_LIMITS = {
  zones: 12,
  perZone: 25,
  perLaunch: 500,
  instruction: 500,
} as const;

/** Ce que l'agent lit pour chaque livrable (« L'agent lit ») : jamais rien d'autre n'est envoyé au modèle. */
export const AGENT_READS = {
  functional: ["idea.frozen", "idea.synthesis", "idea.risks", "functional.current"],
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
