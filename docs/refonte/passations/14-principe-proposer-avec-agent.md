# Principe · « Proposer avec l'agent » (bouton et modale communs)

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquettes : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/21-PrincipeAgent.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Principe · Proposer avec l'agent** ; intégré et cliquable sur les lots 5 à 10.
> S'applique à tous les livrables de la spec. Complète `principe-creer-modifier.md` (l'aide « Décrire en une phrase » du panneau `SpecItemSheet` reste l'équivalent à l'échelle d'un élément).

## 1. Le bouton `AgentProposeButton`

- **Un seul bouton, identique partout** : couleur primaire (`--primary` / `--primary-foreground`), icône `auto_awesome` 20 px, libellé « Proposer avec l'agent », hauteur 36, rayon 6. **Premier des actions de l'en-tête** du livrable. Même logique que « Concevoir l'écran suivant » du lot 9.
- États :

| État | Rendu | Quand |
|---|---|---|
| `idle` | primaire | par défaut |
| `open` | primaire + halo 3 px `--soft` | modale ouverte |
| `running` | icône `progress_activity`, « L'agent propose… », opacité 0,82, curseur `progress` | un lancement en cours pour ce livrable (un seul à la fois) |
| `ready` | icône `rate_review`, « Relire N propositions », halo | propositions arrivées ; clic → onglet / état Relecture du livrable |
| `unavailable` | pointillé `--border-strong`, fond `--surface`, texte `--muted-foreground` | pas de clé d'IA dans l'organisation, ou rôle sans droit ; infobulle avec la raison + lien vers les réglages |

- Le bouton ne lance **jamais** rien seul : il ouvre la modale (sauf en `ready`).
- Invisible en vue client.

## 2. La modale `AgentProposePopover`

- **Centrée dans la fenêtre** (`position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)`), largeur 520 px (`max-width: calc(100% - 32px)`, `max-height: calc(100vh - 48px)`, défilement interne), rayon 14, ombre `0 18px 44px rgba(20,16,43,.20)`.
- **Fond** : voile `rgba(13,11,28,.34)` + `backdrop-filter: blur(6px)` sur toute la fenêtre ; clic sur le fond ou Échap = fermer. `role="dialog"`, `aria-modal="true"`, focus piégé, retour du focus sur le bouton à la fermeture.
- Contenu :
  1. **En-tête** : tuile 34 px fond primaire + icône, « Proposer avec l'agent », sous-titre = livrable (ou « Design · Écrans » selon l'étape), bouton Fermer.
  2. **Ce que l'agent va faire** (capitales 12 px) : 3 ou 4 **cartes radio** (`role="radio"`) — pastille radio 18 px, titre 13/600, étiquette **Recommandé** (fond primaire) sur la première, **compte calculé** en pastille `--soft` (« 3 critères »), description 12 px. Carte choisie : bordure `--primary`, fond `--diff-bg`. **Une option dont le compte est nul est masquée** ; la recommandée est la première option non vide.
  3. **Consigne** (facultatif) : textarea 2 lignes, exemple propre au livrable.
  4. **L'agent lit** : puces des livrables / fichiers passés en contexte. Rien d'autre n'est lu.
  5. **Pied** (`--surface`) : « Rien n'est enregistré sans votre relecture. » sur sa propre ligne, puis Annuler · **Lancer** (primaire, icône).
- Après **Lancer** : la modale se ferme, le bouton passe `running`, les propositions arrivent en flux dans la relecture du livrable (les premières avant la fin), puis `ready`. Notification si l'utilisateur a quitté la page.

## 3. Par livrable

| Livrable | L'agent lit | Choix (le premier est recommandé) | Où arrivent les propositions |
|---|---|---|---|
| Fonctionnel | dossier d'idée figé, Synthèse, Hypothèses et risques | **Compléter le cahier** · Écrire les critères manquants · Mettre à jour depuis le dossier · Tout reproposer | Relecture groupée (fonctionnalités, règles, rôles, parcours) |
| Données | fonctionnel validé, règles, rôles | **Compléter le modèle** · Vérifier les contraintes · Proposer des jeux d'exemple · Tout reproposer | Relecture (tables, relations, jeux) |
| Architecture | fonctionnel, données, exigences connues | **Compléter l'architecture** · Proposer une décision · Rédiger le document · Tout reproposer | Relecture (composants, ADR, flux, sections) |
| Technique | architecture validée, exigences, stack de l'organisation | **Compléter le cahier** · Comparer les options d'un choix · Rendre les exigences mesurables · Tout reproposer | Relecture (choix, opérations, exigences, environnements) |
| Design · système | logo et page Identité, règles a11y | **Corriger les contrastes** · Compléter la bibliothèque · Revoir le thème sombre | Encadré de proposition dans Couleurs |
| Design · règles | dossier d'idée, exigences, règles de l'organisation | **Proposer des règles projet** · Ajuster les sévérités | Encadré du paquet Projet |
| Design · écrans | parcours, fonctionnalités, rôles | **Reproposer l'inventaire** · Concevoir l'écran suivant · Compléter les états manquants | Inventaire proposé / file de conception |
| Qualité | critères, parcours du design, cahier technique | **Écrire les scénarios manquants** · Mettre à jour depuis le design · Couvrir les exigences · Proposer des jeux de données | Relecture (scénarios, stratégie, jeux, sections) |

« Tout reproposer » ne supprime rien : ce qui est enregistré reste, l'agent propose des remplacements à relire.

## 4. Contrat

```ts
<AgentProposeButton
  deliverable="quality"
  options={[{ id: 'gaps', count: 3, recommended: true }, { id: 'update' }, { id: 'nfr' }, { id: 'fixtures' }]}
  reads={['functional.criteria', 'design.flows', 'technical']}
  onReady={() => router.push('?tab=review')}
/>

ai.proposeDeliverable({ projectId, deliverable, mode /* id du choix */, instruction? }) // flux de propositions typées
ai.proposeOptions({ projectId, deliverable }) // comptes calculés côté serveur pour les choix
// 409 proposal_in_progress si un lancement tourne déjà pour ce livrable
```

Les propositions suivent le circuit existant : `proposal.decide` puis `specBatch.submit`.

## 5. Corrections associées

- Panneau commun `SpecItemSheet` : une `textarea` reçoit sa valeur par l'attribut `value`, pas en contenu (le contenu affichait « [object Object] »).
- Boutons d'en-tête branchés sur `SpecItemSheet` : « Modifier la charte » (formulaire `charte` : nom, couleur principale, polices, arrondis, logo ; contrastes recalculés avant l'enregistrement), « Ajouter un écran » (`screen` : titre, parcours, fonctionnalités, viewport, états, file de l'agent ou studio), « Nouveau scénario » et « Modifier » d'un scénario (`scenario` : titre, critère, niveau, étapes, liens).

## 6. Critères d'acceptation

- [ ] Même bouton, même place, mêmes 5 états sur les 6 livrables ; absent en vue client.
- [ ] Modale centrée, fond flouté, Échap / clic dehors, focus piégé.
- [ ] Choix et comptes propres au livrable (et à l'étape pour le design), option vide masquée.
- [ ] Un seul lancement par livrable ; propositions en flux vers la relecture ; `Relire N propositions`.

## 7. Ticket

```
- [ ] **[TK-?]** Principe · Proposer avec l'agent : AgentProposeButton (5 états), AgentProposePopover (modale centrée, fond flouté), ai.proposeOptions, verrou par livrable, branchement sur les lots 5 à 10. Réf. design/refonte/principe-proposer-avec-agent.md. — avec le socle du lot 5
```
