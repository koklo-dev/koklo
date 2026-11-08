import type { AiIdeaChatInput } from "@koklo/contract";

export type AgentAction = NonNullable<AiIdeaChatInput["action"]>;
export type AgentMode = AiIdeaChatInput["mode"];

/** Premier message sur un dossier vide : texte fixe, aucun appel du modèle (passation 02 §7.1). */
export const AGENT_FIRST_MESSAGE =
  "Qu'est-ce que ce produit change, et pour qui ? Une phrase suffit pour commencer.";

export const MODE_HINT: Record<AgentMode, string> = {
  interview: "Mode entretien : l'agent mène, une question à la fois.",
  free: "Mode libre : sélectionnez un passage et demandez.",
};

/** Actions de la barre de sélection : libellé affiché et message envoyé à l'agent (le serveur en tire la consigne). */
export const AGENT_ACTIONS: ReadonlyArray<{ action: AgentAction; label: string; message: string }> =
  [
    { action: "develop", label: "Développer", message: "Développe ce passage." },
    { action: "challenge", label: "Challenger", message: "Challenge ce passage." },
    { action: "simplify", label: "Simplifier", message: "Simplifie ce passage." },
    {
      action: "find_gaps",
      label: "Trouver les trous",
      message: "Trouve ce qui manque dans ce passage.",
    },
    { action: "make_page", label: "En faire une page", message: "Fais-en une page." },
  ];

export const PRIVACY_NOTE = "Envoyé au fournisseur d'IA de l'organisation, avec sa clé.";
export const PRIVACY_SENT =
  "Part avec chaque message : le contenu et les titres des pages du dossier, les derniers messages du fil, le passage sélectionné, et pour chaque auteur seulement « l'équipe » ou « le client ».";
export const PRIVACY_NEVER =
  "Ne part jamais : adresses e-mail, noms de personnes, identifiants, nom ou adresse du dépôt, clé d'accès.";

export const NOT_CONFIGURED_TEXT =
  "L'agent n'est pas encore activé : aucune clé d'IA n'est configurée pour votre organisation. Vous pouvez écrire et publier sans lui.";
export const ASK_ADMIN = "Demandez à un administrateur de l'organisation d'ajouter la clé.";

/** Questions du guide d'entretien (passation 02 §8), par page de la structure par défaut : repère statique sans IA. */
export const STATIC_GUIDE: Readonly<Record<string, readonly string[]>> = {
  vision: [
    "Que change ce produit, et pour qui, en une phrase ?",
    "Pourquoi maintenant ?",
    "À quoi ressemble le succès dans un an ?",
  ],
  probleme: [
    "Comment font-ils aujourd'hui ?",
    "Qu'est-ce que ça coûte (temps, argent, clients perdus) ?",
    "Qu'est-ce qui prouve que le problème existe ?",
  ],
  utilisateurs: [
    "Qui utilise, qui paie, qui valide ?",
    "Quelle tâche veulent-ils accomplir ?",
    "Qu'est-ce qui les ferait abandonner ?",
  ],
  "proposition-valeur": [
    "Pourquoi vous plutôt que l'existant ?",
    "Quelles alternatives utilisent-ils ?",
    "Qu'est-ce qui est difficile à copier ?",
  ],
  parcours: [
    "Quel est le premier moment où l'utilisateur gagne quelque chose ?",
    "Quelles étapes sont critiques ?",
  ],
  perimetre: [
    "Que faut-il pour une première version utile ?",
    "Qu'est-ce qui peut attendre ?",
    "Qu'est-ce qui est explicitement exclu ?",
  ],
  contraintes: [
    "Quelles contraintes ne sont pas négociables (légales, techniques, budget, délais) ?",
    "Y a-t-il des données personnelles ?",
  ],
  mesure: ["À quoi verra-t-on que ça marche dans 3 mois ?", "Quels chiffres, avec quelle cible ?"],
  "hypotheses-risques": [
    "Qu'est-ce qui, s'il est faux, tue le projet ?",
    "Comment le vérifier vite ?",
  ],
  glossaire: ["Quels mots ont un sens précis chez vous ?"],
};

/** Questions de la page ouverte : la clé est la fin du slug (« 05-perimetre » donne « perimetre »). */
export function guideForSlug(slug: string | undefined): readonly string[] {
  if (!slug) return [];
  const key = Object.keys(STATIC_GUIDE).find(
    (candidate) => slug === candidate || slug.endsWith(`-${candidate}`),
  );
  return key ? (STATIC_GUIDE[key] ?? []) : [];
}
