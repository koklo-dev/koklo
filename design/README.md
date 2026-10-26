# Design des écrans

> Règle : **aucun écran n'est codé avant que son design soit validé par un humain.**
> Ce dossier est l'historique de ces décisions : chaque réflexion, chaque maquette, chaque validation est un commit.
> Références : [`DESIGN.md`](../DESIGN.md) (identité, tokens, accessibilité) et [`PRODUCT.md`](../PRODUCT.md) (publics, ton).

## Cycle d'un écran

```
ticket design (boucle) ──► statut: à valider ──► revue humaine ──┬─► statut: validé ──► ticket de code (boucle)
                                                                  └─► statut: à revoir + retours.md ──► ticket design repris
```

1. **Ticket de design** (`pkg:design`, livré par la boucle) : la session lit `DESIGN.md`, `PRODUCT.md`, le cadrage et le contrat oRPC concerné, puis produit le dossier de l'écran (structure ci-dessous) avec `statut: à valider`.
2. **Revue humaine** : lire `README.md` de l'écran et ses captures.
   - Accord : sur une branche `design/valider-<S-id>`, passer `statut: validé` et remplir `validé_par` et `validé_le`, puis merger la PR soi-même.
   - Désaccord : passer `statut: à revoir`, écrire les retours dans `retours.md`, puis décocher le ticket de design dans le sprint du vault pour que la boucle le reprenne.
3. **Ticket de code** : il commence par lire le `README.md` de chaque écran cité. Si le statut n'est pas `validé`, la session s'arrête avec `NEEDS-HUMAN:`. Elle implémente exactement les états validés, et tout écart devient une question, jamais une improvisation.
4. **Après le code** : l'écran est déclaré dans le manifeste de captures. La première capture est comparée à la maquette validée, puis approuvée à la main (`approve-baselines.sh`). Le gate visuel surveille ensuite toute dérive.

Une session d'agent **ne passe jamais** un écran en `validé` : le job CI `design approval guard` refuse toute PR d'une branche `feat/*` (branches de la boucle) qui le fait.

## Structure d'un écran : `screens/<S-id>-<slug>/`

| Fichier | Contenu |
|---|---|
| `README.md` | En-tête (`id`, `titre`, `statut`, `version`, `tickets`, `validé_par`, `validé_le`) et la réflexion UI/UX, sections du gabarit ci-dessous |
| `mockup.html` | Maquette statique autonome : tokens recopiés de `DESIGN.md`, données fictives, `?state=<état>` et `?theme=dark` |
| `captures/<état>-<clair\|sombre>.png` | Une capture par état et par thème, produite par `pnpm design:capture` |
| `retours.md` | Retours humains successifs, datés (créé à la première demande de reprise) |

Identifiants : `S-<slug>` (même convention que les écrans de spec, annexe A). Les ressources communes (polices, icônes) sont dans `assets/`.

## Gabarit de `README.md`

```markdown
---
id: S-projects
titre: Liste des projets
statut: à valider          # à valider | validé | à revoir
version: 1
tickets: { design: TK-86, code: TK-14 }
validé_par:
validé_le:
---
## 1. Problème et utilisateurs
Qui arrive ici (vue client / vue équipe, rôle du CDC §14), avec quel objectif, depuis où.
## 2. Tâches et parcours
Tâche principale, tâches secondaires, entrées et sorties de l'écran, navigation.
## 3. Contenu
Chaque donnée affichée et sa source (procédure du contrat oRPC), ordre d'importance.
## 4. États
Vide, chargement, erreur, droits insuffisants, plus les états propres à l'écran. Un état = une capture.
## 5. Interactions et retours
Actions possibles, confirmation, retour visuel, erreurs de saisie.
## 6. Responsive
Ce qui change sous 768 px (empilement, panneau de détail, cibles tactiles).
## 7. Accessibilité
Ordre de focus, libellés, `aria-label` des boutons d'icône, statuts doublés d'une icône, mouvement réduit.
## 8. Alternatives écartées
Au moins deux options sérieuses, avec ce qui a fait trancher.
## 9. Questions ouvertes
Ce qu'un humain doit trancher. Vide = rien à trancher.
## 10. Historique
| Version | Date | Changement | Auteur |
```

## Index des écrans

| Écran | Statut | Ticket design | Ticket code |
|---|---|---|---|

<!-- Tenu à jour par chaque ticket de design ; vérifié par `pnpm design:check`. -->
