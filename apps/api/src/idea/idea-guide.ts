/**
 * Guide de questions de l'agent en mode entretien (passation 02 §8, TK-90) : une liste par page de la structure de
 * cadrage par défaut, clé `templateKey`. Constantes écrites ici : elles entrent dans la consigne du modèle, jamais une
 * donnée d'utilisateur. Une page sans `templateKey` (ajoutée par un humain ou par l'agent) n'a pas de liste.
 */
export const IDEA_GUIDE: Readonly<Record<string, readonly string[]>> = {
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

/** Premier message de l'agent sur un dossier vide : texte fixe, aucun appel du modèle (passation 02 §7.1). */
export const IDEA_FIRST_MESSAGE =
  "Qu'est-ce que ce produit change, et pour qui ? Une phrase suffit pour commencer.";

/** Questions de la page ; vide sans `templateKey` ou pour une clé inconnue. */
export function guideFor(templateKey: string | null | undefined): readonly string[] {
  return templateKey == null ? [] : (IDEA_GUIDE[templateKey] ?? []);
}

/** Question suivante à poser après `answers` réponses humaines sur la page, si le guide en a encore une. */
export function nextQuestion(
  templateKey: string | null | undefined,
  answers: number,
): string | undefined {
  return guideFor(templateKey)[answers];
}
