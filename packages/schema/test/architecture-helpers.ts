import type { SpecFile } from "../src/index.ts";
import { v2Files } from "./helpers.ts";

/** Composant `C-api` valide (TK-111 lot A) ; `extra` remplace ou ajoute des clés au format YAML en ligne. */
export const componentYaml = (id: string, extra = ""): string =>
  `id: ${id}\nnom: ${id.slice(2).toUpperCase()}\ntype: service\nzone: Noyau\nresponsabilite: Fait son travail.\n${extra}`;

export const ADR_MD = `---
id: ADR-001
titre: Base relationnelle
statut: acceptee
date: 2026-11-21
decideurs: [Brice, "Léa Martin"]
liens: [F-001, T-user]
---

## Contexte
Les données sont très liées entre elles.

## Décision
Une base relationnelle unique.

## Conséquences
### Positives
- Transactions simples
- Requêtes de jointure natives

### À accepter
- Montée en charge verticale d'abord

## Alternatives
- **Base documentaire** : les liens entre tables sont trop nombreux.
- **Fichiers plats** : aucune garantie d'intégrité.

## En clair
Nous gardons une seule base pour que tout reste cohérent.
`;

export const FLOW_YAML = `id: P-inscription
participants: [RL-visiteur, C-api, C-db]
messages:
  - { de: RL-visiteur, vers: C-api, texte: Envoie le formulaire, retour: Compte créé }
  - { bloc: alt, libelle: Adresse déjà prise, messages: [{ de: C-api, vers: C-db, texte: Cherche l'adresse, erreur: Doublon }] }
  - { bloc: separateur, libelle: Après la création }
  - { de: C-api, vers: C-db, texte: Enregistre le compte }
fonctionnalites: [F-001]
regles: [R-003]
decisions: [ADR-001]
`;

/** Spec v2 de test augmentée : `changes[path] = contenu` ajoute ou remplace, `null` retire. */
export function archFiles(changes: Record<string, string | null> = {}): SpecFile[] {
  const byPath = new Map(v2Files().map((f) => [f.path, f.content]));
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) byPath.delete(path);
    else byPath.set(path, content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
}

export const PARCOURS =
  "id: P-inscription\ntitre: Inscription\nacteur: Visiteur\ndepart: { libelle: Ouvre la page }\n";
