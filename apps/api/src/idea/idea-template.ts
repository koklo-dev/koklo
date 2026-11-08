/**
 * Gabarit serveur « cadrage par défaut » de l'espace Idée (TK-89) : 10 pages vides, dans cet ordre
 * (positions 0 à 9). Miroir exact des lignes de la migration `*_idea` (vérifié par un test) ; les
 * pages Vision, Problème, Utilisateurs et Périmètre sont requises. Aucun contenu inventé.
 */
export interface IdeaTemplateEntry {
  slug: string;
  title: string;
  required: boolean;
}

export const IDEA_TEMPLATE: readonly IdeaTemplateEntry[] = [
  { slug: "vision", title: "Vision", required: true },
  { slug: "probleme", title: "Problème", required: true },
  { slug: "utilisateurs", title: "Utilisateurs", required: true },
  { slug: "proposition-valeur", title: "Proposition de valeur", required: false },
  { slug: "parcours", title: "Parcours", required: false },
  { slug: "perimetre", title: "Périmètre", required: true },
  { slug: "contraintes", title: "Contraintes", required: false },
  { slug: "mesure", title: "Mesure", required: false },
  { slug: "hypotheses-risques", title: "Hypothèses et risques", required: false },
  { slug: "glossaire", title: "Glossaire", required: false },
];
