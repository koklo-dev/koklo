# Koklo · refonte UI/UX · archive du 6 novembre 2026

Passations de la refonte (lots 0 à 15) et maquettes interactives en HTML autonome.

## Contenu

- `passations/` : 22 documents Markdown, dans l'ordre de lecture. Ce sont les copies des documents du Project « Koklo-New » (`design/refonte/`).
- `maquettes/` : 25 planches du canevas « Koklo — maquettes », une page HTML par planche, plus `index.html` qui les liste.

## Ordre de lecture des passations

1. `01-lots-0-1-passation.md` · Refonte UI · Lots 0 et 1 : passation à l'agent dev
2. `02-lot-2-idee-passation.md` · Refonte UI · Lot 2 · Espace Idée : passation à l'agent dev
3. `03-lot-3-vue-ensemble-passation.md` · Refonte UI · Lot 3 · Vue d'ensemble du projet : passation à l'agent dev
4. `04-lot-4-projets-passation.md` · Refonte UI · Lot 4 · Projets et création de projet : passation à l'agent dev
5. `05-decisions-2026-11-05-spec-sans-brief.md` · Décisions du 05/11/2026 : agent dans la spec, suppression du brief
6. `06-lot-5-fonctionnel-passation.md` · Refonte UI · Lot 5 · Spec · Fonctionnel (et socle de l'agent dans la spec) : passation à l'agent dev
7. `07-principe-listes-longues.md` · Refonte UI · Principe transversal · Listes longues (pagination et chargement progressif)
8. `08-lots-5-6-volume-reel-passation.md` · Refonte UI · Lots 5 et 6 en volume réel : complément de passation
9. `09-lot-6-donnees-passation.md` · Refonte UI · Lot 6 · Spec · Données : passation à l'agent dev
10. `10-lot-7-architecture-passation.md` · Refonte UI · Lot 7 · Spec · Architecture : passation à l'agent dev
11. `11-principe-creer-modifier.md` · Refonte UI · Principe transversal · Créer et modifier un élément de la spec
12. `12-lot-8-technique-passation.md` · Refonte UI · Lot 8 · Spec · Technique : passation à l'agent dev
13. `13-lot-9-design-passation.md` · Refonte UI · Lot 9 · Spec · Design : passation à l'agent dev
14. `14-principe-proposer-avec-agent.md` · Principe · « Proposer avec l'agent » (bouton et modale communs)
15. `15-lot-10-qualite-passation.md` · Refonte UI · Lot 10 · Spec · Qualité : passation à l'agent dev
16. `16-lot-11-baseline-passation.md` · Refonte UI · Lot 11 · Validation et Baseline 0 : passation à l'agent dev
17. `17-decisions-2026-11-06-agents-locaux.md` · Décision du 06/11/2026 : les agents de code tournent en local
18. `18-lot-12-tickets-passation.md` · Refonte UI · Lot 12 · Tickets : passation à l'agent dev
19. `19-lot-13-reglages-passation.md` · Refonte UI · Lot 13 · Réglages : passation à l'agent dev
20. `20-decisions-2026-11-06-fournisseurs-ia.md` · Décision · 6 nov. 2026 · Plusieurs fournisseurs d'IA
21. `21-lot-14-securite-passation.md` · Refonte UI · Lot 14 · Sécurité : passation à l'agent dev
22. `22-lot-15-recette-passation.md` · Refonte UI · Lot 15 · Recette et mises en ligne : passation à l'agent dev

## Règles de priorité

- Un document de **décision** ou une passation plus récente l'emporte sur une passation plus ancienne en cas de contradiction.
- La spec compte **7 livrables** depuis le lot 14 (Fonctionnel, Données, Architecture, Technique, **Sécurité**, Design, Qualité). Les passations des lots 0 à 13 parlent encore de 6 livrables et de compteurs « N/6 » : lire « N/7 », avec Sécurité en 5ᵉ position, Design en 6ᵉ et Qualité en 7ᵉ.
- Agents de code : ils tournent sur les postes et remontent par MCP (`decisions-2026-11-06-agents-locaux`). Clés d'IA : plusieurs fournisseurs (`decisions-2026-11-06-fournisseurs-ia`). Aucun aspect financier dans Koklo (lot 15).

## Maquettes

- `maquettes/01-Identite.html` · Couleurs · 4 pistes
- `maquettes/02-Typographie.html` · Typographie · 4 associations
- `maquettes/03-Icones.html` · Icônes · Material Symbols Rounded
- `maquettes/04-Lot0Fondations.html` · Lot 0 · Fondations v2
- `maquettes/05-Lot1Shell.html` · Lot 1 · Shell projet et navigation
- `maquettes/06-Lot2Idee.html` · Lot 2 · Espace Idée (éditeur + agent)
- `maquettes/07-Lot3Overview.html` · Lot 3 · Vue d'ensemble du projet
- `maquettes/08-Lot4Projects.html` · Lot 4 · Projets et création
- `maquettes/09-Lot5Assistant.html` · Principe · agent dans la spec (référence : document, collection, galerie)
- `maquettes/10-Lot5Fonctionnel.html` · Lot 5 · Fonctionnel (tous les états)
- `maquettes/11-Lot6Donnees.html` · Lot 6 · Données (tous les états)
- `maquettes/12-PrincipeListes.html` · Principe · listes longues (pagination, chargement progressif)
- `maquettes/13-Lot7Architecture.html` · Lot 7 · Architecture (tous les états)
- `maquettes/14-Lot8Technique.html` · Lot 8 · Technique (tous les états)
- `maquettes/15-Lot14Securite.html` · Lot 14 · Sécurité (menaces, données sensibles, droits, exigences ASVS, résumé client, dossier)
- `maquettes/16-PrincipeEdition.html` · Principe · créer et modifier un élément (panneau commun)
- `maquettes/17-Lot9Design.html` · Lot 9 · Design · page du livrable (design system, règles UI/UX, inventaire proposé, conception écran par écran)
- `maquettes/18-Lot9aStudio.html` · Lot 9a · Design · Studio d'écran (rendu, calques, propriétés, annotations, règles, agent)
- `maquettes/19-Lot9bParcours.html` · Lot 9b · Design · Parcours jouable (scénarios, viewports, commentaires et validation client)
- `maquettes/20-Lot10Qualite.html` · Lot 10 · Qualité (scénarios, couverture, stratégie, jeux de données, plan de test)
- `maquettes/21-PrincipeAgent.html` · Principe · Proposer avec l'agent (bouton commun, panneau, intégration par livrable)
- `maquettes/22-Lot11Baseline.html` · Lot 11 · Validation et Baseline 0 (récapitulatif, contrôles, validation du client, baseline posée)
- `maquettes/23-Lot12Tickets.html` · Lot 12 · Tickets (découpage depuis la baseline, sprint, sessions d'agent, pull requests, vue client)
- `maquettes/24-Lot13Reglages.html` · Lot 13 · Accès et réglages (membres et rôles, fournisseurs d'IA, agents locaux MCP, GitHub, règles du projet, compte)
- `maquettes/25-Lot15Recette.html` · Lot 15 · Recette et mises en ligne (environnements GitHub, aperçus de PR, campagne de recette, notes de version, procès-verbal, indicateurs)

Ouvrir `maquettes/index.html`, ou directement une planche. Chaque page embarque son moteur de rendu et fonctionne hors ligne ; seules les polices (Instrument Sans, JetBrains Mono, Material Symbols) viennent de Google Fonts : sans connexion, les icônes s'affichent sous forme de mots. Les sélecteurs en pointillés en haut à droite des planches (états, Démo / Volume réel, rôle) sont propres aux maquettes et n'existent pas dans le produit.
