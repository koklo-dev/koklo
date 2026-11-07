# Refonte UI · Lot 8 · Spec · Technique : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/14-Lot8Technique.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Lot 8 · Technique (tous les états)**. Sélecteurs propres à la maquette : état (Prêt, Génération, Relecture, Liste · équipe, À revoir, Vue client) et volume (Démo / **Volume réel**, référence). Tout est cliquable : cartes de la stack, « Choisir … », zones et opérations de l'API, Fiche / YAML / Contrat généré, Modifier, « Nouveau… » (panneau commun), sections du Document.
> À lire avant : `lot-7-architecture-passation.md` (et ses corrections §8 ci-dessous), `principe-listes-longues.md`, `principe-creer-modifier.md`.
> Prérequis : lot 7, socle `SpecItemSheet`.

Ce lot livre **Spec · Technique** (route `/projects/[id]/spec/technical`) : les outils et produits retenus, les opérations de l'API, les exigences non fonctionnelles mesurables, les environnements et le cahier technique rédigé. Proposé par l'agent depuis l'architecture validée ; **validé par l'équipe** (le client lit et commente) ; débloque **6 Qualité**. C'est le **seul livrable où les produits sont nommés** (l'architecture reste neutre).

## 1. Format dans le dépôt de spec

| Fichier | Contenu | Rôle |
|---|---|---|
| `tech/stack/<slug>.yaml` | un choix par rôle : statut `choisi` / `a_trancher`, choix, composants, options, critères (valeur par option), pourquoi, exigences, décisions | source |
| `api/endpoints/<zone.verbe>.yaml` | une opération : type (`lecture`, `ecriture`, `interne`), zone, composant, permission, entrée, sortie, erreurs (code, quand, règle), sert, limite | source |
| `nfr/NFR-nnn.yaml` | une exigence : catégorie, titre, cible mesurable, énoncé, vérification, liens | source |
| `tech/environments.yaml` | environnements, variables et secrets (**noms seulement**), intégrations | source |
| `tech/cahier-technique/NN-<slug>.md` | une section du cahier par fichier, ordre par préfixe | source (`SpecDocument`) |
| contrat dans le dépôt **de code** | généré depuis `api/endpoints/*.yaml` par le **générateur de la stack retenue** (aujourd'hui TypeScript · oRPC + zod, `packages/contract/src/<zone>/<entité>.ts`) | **généré**, jamais édité |

Le YAML d'opération ne dépend d'aucun langage. Les générateurs de contrat sont des extensions par stack (TypeScript · oRPC, PHP · Laravel, Python · FastAPI…) ; seul celui de `ST-api` est utilisé et affiché. Si la stack change, le contrat est régénéré dans le nouveau langage.

## 2. En-tête

- h1 « Cahier technique », statut, puis actions à droite ; **le résumé passe sous le titre** (13 px, ligne entière) pour que les boutons restent sur une ligne (règle appliquée aussi aux lots 5 à 7).
- Liste : « Validation de l'équipe · le client lit et commente » ; résumé « 24 choix · 132 opérations · 28 exigences · 3 environnements » + « · 2 choix à trancher avant de valider » s'il en reste ; actions : Proposer avec l'agent · Nouveau … (selon l'onglet ; aucune sur Document) · **Valider** (désactivé et en pointillés tant qu'un choix est « À trancher »).
- Autres états : comme le lot 7 (Prêt, Génération, Relecture, À revoir, Vue client).
- Onglets : **Stack** (`layers`, compteur), **API** (`api`), **Exigences** (`speed`), **Environnements** (`dns`), **Document** (`description`) ; Relecture devant en relecture.

## 3. États

- **Prêt** : `EmptyState` `terminal`, « L'agent peut proposer le cahier technique », « À partir de l'architecture validée : un choix technique par composant avec ses alternatives, les opérations de l'API, les exigences non fonctionnelles mesurables et les environnements. … ».
- **Génération** : « L'agent rédige le cahier technique : la stack d'abord, puis les opérations de l'API zone par zone et les exigences. Les premières propositions arrivent avant la fin. »
- **Relecture** : groupée par type (Document · cahier technique, Stack, Opérations de l'API, Exigences, Environnements) ; détail : choix (options et critères ligne par ligne), opération (résumé, entrée, erreurs), exigence (cible, énoncé, vérification), environnement, section de document. **Le texte d'une section proposée s'affiche simplement (15 px), sans encadré coloré** (règle valable pour tous les lots).
- **À revoir** : « **L'architecture a changé depuis la validation (version a41c9e7).** Composant C-avis ajouté, ADR-006 acceptée. Sont concernés : ST-sms, 3 opérations avis.*, NFR-004 » ; éléments concernés en contour ambre 2 px.
- **Vue client** : lecture ; « En clair » sur les choix (« Le produit est hébergé en France, à Paris ») ; pas de YAML ni de contrat ; commentaires.

## 4. Onglets

### 4.1 Stack (par défaut)
- Barre de compte « 24 choix · 2 à trancher » + « Un choix par rôle de l'architecture · les produits ne sont nommés qu'ici ».
- Sections par **couche** (Applications, Services et API, Données, Services externes, Hébergement et exploitation ; titre en capitales 12 px + nombre) ; **grille de 2 cartes par ligne**. Carte (rayon 12) : tuile icône 34 px, rôle 12 px, **choix 15/600**, « Pour C-… », statut (**Choisi** vert, **À trancher** ambre), id mono. Sélection : contour 2 px `--primary`.
- **Fiche** (480–580 px, pour laisser la place au tableau) : id, statut, Modifier ; rôle ; choix 22/600 ; Fiche · YAML ; pourquoi ; si à trancher : encadré ambre « Choix à faire avant la validation du cahier technique… » ; **Options comparées** : tableau critères × options, option choisie ou recommandée surlignée (`--secondary`, « Choisi » / « Recommandé » sous le nom) ; si à trancher : boutons **« Choisir <option> »** (l'option recommandée en principal) ; puces Pour les composants, Exigences visées, Décisions.
- Les estimations de l'agent (prix, performances) sont marquées « ≈ » et « estimations à vérifier » ; jamais présentées comme des faits.

### 4.2 API
- Recherche (mono), **filtre par zone** en pastilles avec compteurs (« Toutes · 132 », « Prise de rendez-vous · 18 »…), barre de compte, liste en 1.1 du principe (pages de 50) : type en pastille (écriture `--secondary`, lecture contour, interne pointillé), nom mono 13/500, résumé, permission mono.
- **Fiche** : type, « zone · composant », Modifier, Fiche · YAML · **Contrat généré** ; nom mono 20 px ; résumé ; tableaux **Entrée** (champ, type, contrainte), **Sortie**, **Erreurs** (code, règle, quand) ; puces Qui peut appeler, Règles appliquées, Fonctionnalités, Limite de débit.
- YAML = `api/endpoints/<nom>.yaml` (« Source de vérité »). **Contrat généré** = le seul contrat de la stack retenue (chemin dans le dépôt de code, pastille « Généré · TypeScript · oRPC ») + note « Généré par le générateur de la stack retenue (ST-api). Si la stack change, le contrat est régénéré dans le nouveau langage ; le YAML reste la source. »

### 4.3 Exigences
- Barre de compte « 28 exigences · 21 couvertes par un scénario · 7 à couvrir » ; sections par catégorie (Données personnelles, Performance, Sécurité, Disponibilité, Accessibilité, Exploitation, icône + nombre) ; grille `minmax(300px, 1fr)`.
- Carte : id, titre 600, **icône crayon Modifier**, **cible 22/600** (« p95 < 300 ms », « WCAG 2.2 AA »), énoncé 13 px, pied : vérification + **Couverte** (vert, `fact_check`) / **À couvrir** (ambre, `pending`). Le statut est calculé depuis le lot Qualité (un scénario lié).

### 4.4 Environnements
- Tableau (légende « Environnements » + Modifier) : colonnes Développement / Recette / Production (pastille de couleur), lignes Adresse (mono), Hébergement, Base, Données, Déploiement, SMS, Accès ; une valeur « à trancher » en ambre.
- **Variables et secrets** : nom mono, usage, « Coffre de l'hébergeur » ; mention « Noms seulement : aucune valeur dans la spec ». La spec ne contient **jamais** de valeur de secret (validation serveur qui refuse tout motif de clé).
- **Intégrations externes** : service, usage, statut (À trancher, Compte à créer, Configuré, Connecté).

### 4.5 Document
`SpecDocument` dans la **disposition de l'espace Idée** (§8.1) : sections `tech/cahier-technique/NN-*.md` (Objet, Stack retenue, Conventions, Sécurité, Exploitation, Tests et qualité…).

## 5. Validation et barre

« Valider » (owner, admin, développeur) possible seulement quand aucun choix n'est « À trancher » ; validation liée au commit ; **6 Qualité** passe « Prêt » ; compteur Spec 4/6. Modification ultérieure → validation annulée (avertissement dans `SpecItemSheet`). Changement amont (architecture) → « À revoir ».

## 6. Contrat

| Procédure | Usage |
|---|---|
| `spec.technical.stack.list()`, `.stack.choose({ id, option })` | Stack, « Choisir … » (une opération `stack.update`) |
| `spec.technical.ops.list({ zone?, q?, cursor?, limit })`, `.ops.byId` | API |
| `spec.technical.contract({ opId })` | contrat généré par le générateur de `ST-api` |
| `spec.technical.nfr.list({ category? })` | Exigences (+ statut de couverture depuis le lot Qualité) |
| `spec.technical.environments()` | Environnements |
| `spec.document.sections({ deliverable: 'technical' })` | Document |
| `ai.proposeDeliverable({ deliverable: 'technical', mode })` | propositions `stack`, `op`, `nfr`, `env`, `doc_section` |
| `specBatch.submit` | `stack.*`, `op.*`, `nfr.*`, `env.*`, `doc.section.*` |

## 7. Droits

Comme le lot 7 ; « Choisir … » et Valider : owner, admin, développeur. Client : lecture (sans YAML ni contrat), commentaires.

## 8. Corrections aux passations précédentes

### 8.1 Onglet Document des lots 7 et 8 (`SpecDocument`, disposition de l'espace Idée)
Remplace le §4.2 de `lot-7-architecture-passation.md`.
- **Colonne gauche « Sections »** (264 px) : un fichier par section (`architecture/overview/NN-<slug>.md`, `tech/cahier-technique/NN-<slug>.md`), poignée de glisser (équipe), numéro mono, icône de statut (**Validée** `check_circle` plein `--primary`, **À relire** `rate_review`, **Brouillon** `edit`, **À rédiger** `radio_button_unchecked`, libellé estompé), point `--primary` si proposition en attente. Section proposée par l'agent : encadré pointillé `--primary` sur `--diff-bg`, **marges 14 px au-dessus, 2 px sur les côtés, padding 12 × 14**, « Ajouter la section » / « Ignorer ». Puis « Ajouter une section » (pointillé, marges 12 px). **Légende des statuts collée en bas de la colonne** (`margin-top:auto`).
- **Centre** (680 px max) : chemin du fichier, titre 28/600, statut + dernier auteur + « Marquer comme validée » ; texte ; proposition de l'agent dans le cadre pointillé du lot 2 (Accepter · Modifier · Rejeter) ; section **À rédiger** : encadré « Section à rédiger » + raison (« Attendue par NFR-008… ») + « Rédiger avec l'agent » / « Écrire moi-même » ; l'agent rédige un brouillon présenté comme proposition. « Écrire, ou taper « / » pour insérer un bloc ».
- **Droite « Agent »** (sans conversation) : « Demander » (actions en un clic : Rédiger les sections à rédiger, Vérifier la cohérence avec les décisions / la stack et les exigences, Résumer pour le client), « Ce qui manque encore », dernière action de l'agent, champ libre + mention Anthropic. **Vue client** : « Questions et commentaires » (fil, champ « Poser une question à l'équipe »).

### 8.2 Flux du lot 7
Sélecteur **Diagramme · YAML · Mermaid** : YAML = `architecture/flows/<P-id>.yaml` (« Source de vérité » : participants, étapes `de` / `vers` / `texte` / `retour` / `erreur`, `alt`, `separateur`, liens) ; Mermaid généré.

### 8.3 Marges des encadrés de l'agent (lot 2 et suivants)
Colonne des pages du lot 2 : 264 px (au lieu de 232) ; encadré « Page proposée par l'agent » avec les mêmes marges qu'en 8.1. Règle générale : un encadré pointillé `--primary` n'est jamais collé au bord de son conteneur ni aux éléments voisins (≥ 10 px vertical, ≥ 2 px latéral en plus du padding du conteneur).

### 8.4 En-têtes des livrables (lots 5 à 8)
Résumé sous le titre (ligne entière), actions alignées à droite sur la ligne du titre ; libellés d'action courts, la raison d'un bouton désactivé va dans le résumé.

## 9. Critères d'acceptation

- [ ] 6 états ; onglets Stack (2 cartes par ligne, tableau comparatif, Choisir), API (zones, fiche, contrat de la stack retenue), Exigences (cibles, couverture, Modifier), Environnements (secrets sans valeur), Document (disposition de l'espace Idée).
- [ ] Validation impossible tant qu'un choix est à trancher ; déblocage de Qualité.
- [ ] Panneau `SpecItemSheet` sur tous les « Nouveau… » et « Modifier ».
- [ ] Corrections §8 appliquées aux lots 2, 5, 6, 7.
- [ ] Captures : chaque état × onglet, équipe et client, clair, sombre, 375 px.

## 10. Tickets (format du vault)

```
- [ ] **[TK-?]** Lot 8a · Spec · Technique : formats tech/*, api/endpoints/*, nfr/*, ai.proposeDeliverable 'technical', états, relecture groupée, onglets Stack (Choisir) et Environnements. Réf. design/refonte/lot-8-technique-passation.md §1 à §4.1, §4.4. — dépend du lot 7
- [ ] **[TK-?]** Lot 8b · Spec · Technique : onglet API (zones, fiche, générateur de contrat de la stack retenue dans le dépôt de code), onglet Exigences (couverture depuis Qualité), validation. Réf. §4.2, §4.3, §5. — dépend de 8a
- [ ] **[TK-?]** Lots 2-8 · corrections : SpecDocument en disposition espace Idée (lots 7, 8), YAML des flux, marges des encadrés de l'agent, en-têtes des livrables. Réf. §8. — avec 8a
```
