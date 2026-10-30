/** Entrée du journal injectable : jamais d'URL, d'en-tête ni de jeton (CA9). */
export type GitProviderLogEntry = {
  readonly operation: string;
  readonly status?: number;
  readonly durationMs: number;
};

/**
 * Options de l'adaptateur GitHub. Tout est injecté par l'appelant : la bibliothèque ne lit
 * jamais `process.env` ni de fichier (la clé privée arrive en PEM).
 */
export type OctokitGitProviderOptions = {
  readonly appId: string;
  readonly privateKey: string;
  /**
   * Identifiants client de l'App (distincts de l'OAuth App de connexion), facultatifs et fournis
   * ensemble : ils ne servent qu'aux jetons utilisateur. Absents, ces jetons sont refusés par
   * `UserTokenRequiredError` ; le jeton d'installation n'en a pas besoin.
   */
  readonly clientId?: string | undefined;
  readonly clientSecret?: string | undefined;
  /** Horloge injectée : calcul des délais de quota, des expirations et des dates de commit. */
  readonly now: () => Date;
  /** Transport HTTP (tests) ; `fetch` global par défaut. */
  readonly fetch?: typeof fetch;
  /** Nouvelles tentatives des lectures (GET) en 5xx ou erreur réseau ; jamais des écritures. */
  readonly retries?: number;
  /** Base du délai entre deux tentatives (ms), multipliée par le carré du rang. */
  readonly retryBaseDelayMs?: number;
  /** Attente maximale acceptée pour rejouer une lecture limitée par quota ; 0 = jamais. */
  readonly maxAutoRetryMs?: number;
  /** Borne de sécurité de la pagination interne (défaut 50 pages de 100). */
  readonly maxPages?: number;
  /**
   * Espacement d'une seconde entre écritures imposé par le plugin de throttling (recommandation
   * GitHub). `true` par défaut ; `false` réservé aux tests contre un transport simulé, où il
   * ne protège rien et allonge la suite.
   */
  readonly spaceWrites?: boolean;
  readonly logger?: (entry: GitProviderLogEntry) => void;
};

export const DEFAULT_RETRIES = 2;
export const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
export const DEFAULT_MAX_AUTO_RETRY_MS = 5000;
export const DEFAULT_MAX_PAGES = 50;
