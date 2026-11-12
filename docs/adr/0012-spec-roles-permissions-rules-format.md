---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: ab319b0
---
# 0012 — Format des rôles, permissions et règles métier de la spec

- **Statut** : proposé (TK-53b ; effectif à la fusion du lot)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-53, lot 53b)

## Contexte
Les features et les écrans citent des rôles (`RL-…`) et des règles (`R-nnn`) que rien ne décrivait : la règle 4 ne pouvait pas les vérifier. Le dépôt de spec doit rester du texte relisible, versionné, sans changement de contrat ni de base (`spec_version` reste 1).

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. `domain/roles.yaml` unique (rôles + permissions) et un Markdown par règle `domain/rules/R-nnn-slug.md` | Une permission se relit à côté de ses rôles ; règle lisible par le client (énoncé, exemples) ; même mécanique que les features | Un fichier à fusionner en cas de conflit |
| B. Un fichier YAML par rôle et par permission | Diffs minimes | Beaucoup de petits fichiers, liens croisés dispersés |
| C. Rôles et règles dans le front matter des features | Aucun nouveau fichier | Duplication, pas de source unique par rôle |

## Décision
Option A. Les liens non résolus sont des erreurs (R4_UNKNOWN_ROLE, R4_UNKNOWN_PERMISSION, R4_UNKNOWN_RULE), y compris avec le scaffold `roles: []` ; les entités jamais utilisées sont des avertissements (R7_ORPHAN_ROLE, R7_ORPHAN_PERMISSION, R7_ORPHAN_RULE). Identifiant de permission `PM-slug(.slug)*`, actions fermées (`lire`, `creer`, `modifier`, `supprimer`, `executer`), ressource = table ou endpoint. Pas de clé `tests` en v1.

## Conséquences
- `ISSUE_CODES` passe de 27 à 33 codes (contrat public du paquet).
- Une spec existante qui cite un rôle ou une règle sans le décrire échoue désormais (SPEC_INVALID) : elle doit déclarer l'entité.
- Format précisé dans `packages/schema/README.md` ; décisions détaillées dans `.workflow/TK-53/03-decisions-53b.md`.

## Évolution (TK-103)
Décidée en autonomie le 2026-11-12 (questions.md, B338 et B339) ; aucun fichier existant n'est réécrit, tout ajout est facultatif au schéma.
- **Règles** : on garde `contrainte|calcul|workflow`, `tables`, `endpoints` et `exemples`, et l'on ajoute `titre`, `etats` (noms d'états d'un workflow, le premier est l'état initial) et `fonctionnalites` (`F-nnn` qui appliquent la règle, vérifiés par la règle 4 : `R4_UNKNOWN_FEATURE`). `titre` et, pour un workflow, `etats` sont exigés à la création par le contrat, pas par le schéma. Un fichier sans `titre` est indexé avec le début de son énoncé.
- **Rôles** : `roles.yaml` garde sa forme. `restrictions` (map `PM-… -> texte`) dit la restriction d'un rôle pour une permission qu'il porte ; la permission porte un `libelle` facultatif ; `ressource` et `action` acceptent un nom métier (`PM-agenda.lire`) en plus d'une table `T-`, d'un endpoint `E-` et des cinq actions : la règle 4 ne vérifie une ressource que si elle commence par `T-` ou `E-`. Une permission citée par un rôle et inconnue est créée dans le même fichier à l'écriture (ressource et action déduites de l'identifiant). L'écriture relit `roles.yaml` sur la tête à chaque tentative et ne change que le rôle visé : deux lots concurrents sur deux rôles gardent les deux.
- **Parcours** : `design/flows/P-<slug>.yaml` (B7), entité du modèle (`kind` `flow`) : `id`, `titre`, `acteur`, `depart { libelle, ecran? }`, `etapes [{ libelle, ecran? }]`, `erreurs [{ etape, texte }]`, `fonctionnalites`. La règle 4 vérifie les écrans (`R4_UNKNOWN_SCREEN`) et les fonctionnalités. Un `.json` hérité (`design/flows/P-*.json`) est encore lu par l'indexeur, jamais validé ni réécrit.
- **Identifiants** : `R-nnn` par le compteur de projet `rule`, `RL-<slug du nom>` et `P-<slug du titre>` posés par l'API ; une collision est un `write_conflict`.
