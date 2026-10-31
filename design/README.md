# Design des écrans

> Historique versionné des décisions UI/UX, écran par écran.
> Les fiches sont écrites par l'étape **Design** du workflow `koklo-delivery` : à chaque ticket qui touche un écran, avant les tests et le code.
> Aucune validation humaine ne bloque le développement. On demande une modification d'écran après coup, au fil de l'eau.
> Références : [`DESIGN.md`](../DESIGN.md) (identité, tokens, accessibilité) et [`PRODUCT.md`](../PRODUCT.md) (publics, ton).

## Comment ça marche

1. Un ticket touche un écran (`pkg:web` ou `pkg:ui`) : le sous-agent designer crée ou met à jour `screens/<S-id>.md` selon le gabarit ci-dessous. Il ajoute une ligne d'historique qui cite le ticket.
2. Les étapes suivantes (tests, code) s'appuient sur cette fiche. La PR résume la décision de design dans sa section « Workflow » et joint les captures réelles, en clair et en sombre.
3. **Demander une modification** : ajouter un ticket dans le sprint en cours du vault, par exemple `- [ ] **[TK-n]** Écran S-projects : <changement>`, avec `pkg:web`. Le designer reprend la fiche, consigne le changement et sa raison, puis le code suit.

Identifiants : `S-<slug>` (même convention que les écrans de spec, annexe A).

## Gabarit d'une fiche `screens/<S-id>.md`

```markdown
---
id: S-projects
titre: Liste des projets
version: 1
---
## 1. Utilisateurs et objectif
Qui arrive ici (vue client / vue équipe, rôle du CDC §14), avec quel objectif, depuis où.
## 2. Tâches et parcours
Tâche principale, tâches secondaires, entrées et sorties de l'écran, navigation.
## 3. Contenu
Chaque donnée affichée et sa source (procédure du contrat oRPC), ordre d'importance.
## 4. États
Vide, chargement, erreur, droits insuffisants, plus les états propres à l'écran.
## 5. Interactions et retours
Actions possibles, confirmations, retours visuels, erreurs de saisie.
## 6. Responsive
Ce qui change sous 768 px.
## 7. Accessibilité
Ordre de focus, libellés, `aria-label` des boutons d'icône, statuts doublés d'une icône, mouvement réduit.
## 8. Alternatives écartées
Au moins deux options sérieuses, avec ce qui a fait trancher.
## 9. Questions ouvertes
Ce qui mériterait un avis humain. Ça ne bloque rien : l'option la plus conforme à `DESIGN.md` est retenue en attendant.
## 10. Historique
| Version | Date | Ticket | Changement et raison |
```

## Index des écrans

| Écran | Version | Dernier ticket |
|---|---|---|
| [S-login](screens/S-login.md) | 3 | TK-85 (correction) |
| [S-projects](screens/S-projects.md) | 6 | TK-48 (48d) |
| [S-organizations](screens/S-organizations.md) | 1 | TK-24 |
| [S-members](screens/S-members.md) | 1 | TK-24 |
| [S-accept-invitation](screens/S-accept-invitation.md) | 1 | TK-86 |
| [S-kanban](screens/S-kanban.md) | 1 | TK-35 |
| [S-github](screens/S-github.md) | 3 | TK-48 (48c) |
| [S-features](screens/S-features.md) | 1 | TK-48 (48d) |
