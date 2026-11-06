# Refonte UI · Lot 2 · Espace Idée : passation à l'agent dev

> Validé par Brice le 05/11/2026. **Mise à jour du 05/11 (après-midi)** : pages modulables (ajout par l'humain ou proposé par l'agent, glisser-déposer, structure de cadrage par défaut). Voir §1, §3, §4, §5, §6.1, §6.5, §7.8, §9.
> Maquette de référence : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 2 · Espace Idée (éditeur + agent)**.
> Plan d'ensemble : doc « Koklo — Refonte UI/UX et espace Idée : audit et plan » (https://claude.ai/artifact/3LVANUqXWDENdWVbhAiNRS).
> Prérequis : lots 0 et 1 livrés (`design/refonte/lots-0-1-passation.md`).

Nouvel écran **S-idea**, route `/projects/[projectId]/idea`. L'étape Design crée la fiche `design/screens/S-idea.md` à partir de ce document, puis le lot se livre en trois tickets : **2a** éditeur sans IA, **2b** agent, **2c** maturité et passage au cadrage.

## 1. Objectif et décisions produit

L'espace Idée est la phase avant le cadrage : un dossier de pages Markdown, co-rédigé par l'équipe, le client et un agent qui structure, questionne et challenge. Le cadrage part ensuite de ce dossier au lieu d'un champ texte.

Décisions du 05/11 :
- **Ouvert au client** : le client a les mêmes droits de lecture, de rédaction et d'usage de l'agent que l'équipe. C'est un outil commercial pour le freelance, utilisable avant la signature du cadrage.
- **Stockage** : brouillon en base pendant l'écriture ; « Enregistrer une version » publie les fichiers dans `idea/` du dépôt de spec. Une copie de l'idée survit même si la plateforme tombe.
- **Bloc Anthropic** : une ligne + « Détails » (`InlineAlert` du lot 0).
- **Règle d'or conservée** : l'agent ne modifie jamais un document directement. Il propose ; un humain accepte. Cela vaut aussi pour la création de pages.
- **Pages modulables** : un dossier neuf démarre avec une **structure de cadrage par défaut** de 10 pages (§4). On peut ensuite ajouter des pages (bouton en bas de l'arborescence), en renommer, en supprimer, et les réordonner par glisser-déposer. L'agent peut **proposer** une nouvelle page, que l'humain ajoute ou ignore.
- **Pages requises** : 4 pages de la structure par défaut (Vision, Problème, Utilisateurs, Périmètre) sont marquées « requise ». Elles conditionnent le passage au cadrage et ne peuvent pas être supprimées (renommer et déplacer restent possibles).

## 2. Droits

| Action | Propriétaire, admin, développeur, designer | Client, business |
|---|---|---|
| Lire le dossier, voir les propositions | Oui | Oui |
| Rédiger, commenter, utiliser l'agent | Oui | Oui |
| Ajouter, renommer, réordonner une page | Oui | Oui |
| Supprimer une page non requise | Oui | Oui (sa suppression est réversible 30 jours, §7.8) |
| Accepter / rejeter une proposition (contenu ou page) | Oui | Oui |
| Marquer une page « stable » ou la rouvrir | Oui | Oui |
| Enregistrer une version (publication dans le dépôt) | Oui | Non : bouton absent (jamais grisé) |
| Passer au cadrage | Oui | Non : bouton absent |

Le serveur applique ces droits ; l'écran ne fait que refléter. Le client n'a jamais besoin d'un compte GitHub.

## 3. Modèle de données (base)

```
IdeaPage
  id (uuid, stable), projectId
  slug (dérivé du titre à la création, unique dans le projet, ne change plus ensuite)
  title, position (entier, ordre d'affichage)
  required (bool), origin: 'template' | 'user' | 'agent', templateKey? ('vision', 'probleme'…)
  status: 'empty' | 'draft' | 'review' | 'stable'
  contentMd (Markdown restreint, ≤ 50 000 caractères)
  version (entier, verrou optimiste), updatedBy, updatedAt, deletedAt?
IdeaProposal
  id, projectId, pageId?, messageId (source)
  op: { kind: 'insertAfter' | 'replace' | 'append', anchorBlockId?, rangeEnd? }
     | { kind: 'createPage', title, afterPageId?, initialContentMd? }
  contentMd, rationale (une phrase), baseVersion
  status: 'pending' | 'accepted' | 'rejected' | 'stale', decidedBy, decidedAt
IdeaMessage
  id, projectId, pageId?, author: userId | 'agent', mode: 'interview' | 'free'
  text, createdAt
IdeaPublication
  projectId, commitSha, publishedBy, publishedAt, pagesVersions
```

- À la création du projet (et en migration pour les projets existants), les 10 pages de la structure par défaut sont créées vides, `origin: 'template'`, positions 0 à 9, les 4 requises marquées.
- Le numéro affiché devant le titre (« 05 · Périmètre ») est la **position courante**, calculé à l'affichage : il change quand on réordonne. Ne jamais le stocker dans le titre ni dans le slug.
- Statut `review` = des propositions attendent sur la page, ou quelqu'un l'a demandée en relecture.
- Une proposition dont `baseVersion` ne correspond plus à la page passe en `stale` : affichée barrée « Le texte a changé depuis cette proposition » + « Redemander à l'agent ».
- Réordonner = une seule écriture qui renvoie toutes les positions (pas de positions à trous ; recalcul côté serveur).

## 4. Fichiers publiés dans le dépôt de spec

Un fichier par page, sur la branche `cadrage` (conception v0.4 §4.0), en un commit du bot Koklo par publication, auteurs réels en `Co-authored-by`.

- **Nom de fichier = slug, sans numéro** (`idea/perimetre.md`), pour qu'un réordonnancement ne renomme pas les fichiers et ne casse pas l'historique git.
- **L'ordre est porté par `idea/_index.yaml`**, réécrit à chaque publication :

```yaml
# idea/_index.yaml
structure: cadrage-par-defaut   # gabarit d'origine
pages:
  - { slug: vision, titre: Vision, requise: true }
  - { slug: probleme, titre: Problème, requise: true }
  - { slug: utilisateurs, titre: Utilisateurs, requise: true }
  - { slug: proposition-valeur, titre: Proposition de valeur }
  - { slug: concurrence, titre: Concurrence et alternatives, origine: agent }
  - { slug: parcours, titre: Parcours }
  - { slug: perimetre, titre: Périmètre, requise: true }
  # …
```

- En-tête de chaque fichier :

```markdown
---
id: perimetre
titre: Périmètre
statut: brouillon        # brouillon | a-relire | stable | vide
requise: true
origine: template        # template | user | agent
mis_a_jour: 2026-11-05
contributeurs: [awa, marie-lefevre]
---
# Périmètre
…contenu…
```

- Une page supprimée disparaît du dépôt à la publication suivante (l'historique git la garde).

### Structure de cadrage par défaut

| Position | Titre | Slug | Requise |
|---|---|---|---|
| 00 | Vision | `vision` | Oui |
| 01 | Problème | `probleme` | Oui |
| 02 | Utilisateurs | `utilisateurs` | Oui |
| 03 | Proposition de valeur | `proposition-valeur` | |
| 04 | Parcours | `parcours` | |
| 05 | Périmètre | `perimetre` | Oui |
| 06 | Contraintes | `contraintes` | |
| 07 | Mesure | `mesure` | |
| 08 | Hypothèses et risques | `hypotheses-risques` | |
| 09 | Glossaire | `glossaire` | |

Le gabarit est une donnée (fichier de configuration côté serveur), pas du code en dur : d'autres structures pourront s'ajouter plus tard (application mobile, site vitrine…) sans changer l'écran.

Spec non prête ou dépôt indisponible : le brouillon continue de fonctionner, « Enregistrer une version » est remplacé par la raison (`InlineAlert` attention). Réutiliser le suivi de lot de 48e (`specBatch`) pour la publication si possible.

## 5. Contrat oRPC (`@koklo/contract`, version mineure suivante)

| Procédure | Entrée → sortie | Notes |
|---|---|---|
| `idea.list` | `projectId` → pages ordonnées (sans contenu) + statuts + `required` + nb de propositions en attente + propositions de page en attente | Arborescence et jauge |
| `idea.get` | `projectId, pageId` → page complète + propositions `pending` | |
| `idea.save` | `projectId, pageId, contentMd, baseVersion` → `version` | `CONFLICT` si version dépassée (voir 7.4) |
| `idea.page.create` | `projectId, title, afterPageId?` → page | Titre par défaut « Page sans titre » |
| `idea.page.rename` | `projectId, pageId, title` | Le slug ne change pas |
| `idea.page.reorder` | `projectId, pageIds[]` (ordre complet) → positions | Rejet si la liste n'est pas exactement l'ensemble des pages |
| `idea.page.delete` | `projectId, pageId` | `FORBIDDEN` sur une page requise ; suppression douce (`deletedAt`) |
| `idea.page.restore` | `projectId, pageId` | 30 jours |
| `idea.setStatus` | `projectId, pageId, status` | `stable` ↔ `draft` |
| `idea.publish` | `projectId` → `batchId` | Équipe seulement |
| `idea.proposal.decide` | `proposalId, decision: accept/reject, edited?` → page(s) mise(s) à jour | Accepter = appliquer l'op (y compris `createPage`) + nouvelle version, atomique |
| `ai.ideaChat` | `projectId, pageId?, mode, message, selection?` → flux de texte + `proposals[]` + `nextQuestion?` | Flux (SSE ou itérateur oRPC) ; peut renvoyer des propositions `createPage` |
| `ai.ideaGaps` | `projectId` → liste de manques `{pageId?, text, suggestedPageTitle?}` | Appelé à la demande et après chaque acceptation, débounce 30 s |
| `ai.draftBriefFromIdea` | `projectId` → brief structuré | Lot 2c, alimente S-framing étape 2 |

Erreurs : mêmes codes que S-framing §4.5 à 4.9 (`LLM_NOT_CONFIGURED`, `LLM_RATE_LIMITED`, `LLM_PROVIDER_ERROR`, `LLM_OUTPUT_INVALID`, `PROMPT_REJECTED`), même module `lib/ai-errors.ts`, rendus en `InlineAlert`. Plafonds : ceux de l'organisation ; un seul appel IA à la fois par utilisateur et par projet.

Envoyé au modèle : le contenu et les titres des pages du dossier, les messages de la conversation, la sélection. Jamais : clés, e-mails, identifiants de personnes (les auteurs sont envoyés comme « l'équipe » / « le client »), noms d'organisation, de projet ou de dépôt.

## 6. Écran

### 6.1 Gabarit (≥ 1280 px)

- `AppShell` **replié en rail par défaut** sur cette route (64 px) ; l'utilisateur peut le déplier.
- `ProjectHeader` : fil « <projet> / Idée » + à droite « Brouillon enregistré · dernière version publiée <date> ». Ligne 2 : h1 « Dossier d'idée », jauge de maturité (un cran de 10×6 px par page, `role="meter"`, crans stables en `--primary`, autres en `--border-strong`) + « N pages stables sur M », pile d'avatars des personnes présentes (client marqué), puis à droite, **sur une même ligne** : raison du blocage (13 px, icône `info`, « Pour passer au cadrage, il manque : … »), « Enregistrer une version » (secondaire, icône `publish`), « Passer au cadrage » (principal, ou désactivé avec la raison liée par `aria-describedby`).
- Trois colonnes sous l'en-tête :
  1. **Pages** (232 px, bordure droite), voir 6.5.
  2. **Document** (fluide, colonne de lecture 680 px max, marges 28/40 px) : chemin `idea/perimetre.md` (mono 12), h2 de page 28/600 (titre éditable en place, Entrée valide), ligne meta (statut en pastille, « Modifié par <nom> (client) il y a 5 min », action texte « Marquer comme stable » / « Rouvrir »), puis l'éditeur. Corps 15 px, interligne 1,65. Dernière ligne : « Écrire, ou taper « / » pour insérer un bloc ».
  3. **Agent** (360–380 px, fond `--surface`, bordure gauche) : voir 6.3.

### 6.2 Éditeur

- **TipTap (ProseMirror)** recommandé, Markdown comme format canonique (sérialisation aller-retour testée). Alternative acceptable : BlockNote. Pas d'éditeur maison.
- Schéma restreint : paragraphe, titres h2–h3 (le h1 est le titre de la page), listes à puces, numérotées, cases à cocher, tableau simple, citation, encadré (`> [!note]` en Markdown), séparateur. **Interdits** : HTML brut, images, embeds, code exécutable, titres h1/h4+.
- Menu « / » pour insérer un bloc ; barre de mise en forme flottante sur sélection (gras, italique, lien, et les actions de l'agent en 6.3).
- Liens : seuls `http(s)` acceptés, rendus avec `rel="noopener noreferrer nofollow"` ; un lien dans une proposition de l'agent est rendu **inerte** (texte + URL visible) tant que la proposition n'est pas acceptée.
- Lien interne vers une autre page du dossier : `[[Titre de page]]` dans le Markdown, rendu en `EntityChip` ; il suit les renommages (résolu par `pageId` en base, écrit par slug dans le fichier publié).
- Enregistrement automatique : débounce 1,5 s après la dernière frappe, et à la perte de focus. Indicateur dans l'en-tête (« Enregistrement… », « Brouillon enregistré », « Hors ligne : modifications gardées localement »). Copie locale cloisonnée par utilisateur, organisation et projet, purgée à la déconnexion (même mécanisme que les brouillons de 48e).
- Présence : avatars des personnes sur la page (sondage 15 s au lot 2a ; temps réel plus tard). Pas d'édition simultanée en temps réel au lot 2 (voir 7.4).

### 6.3 Panneau de l'agent

- En-tête : tuile `auto_awesome`, « Agent », bascule **Entretien / Libre** (`role="group"`, `aria-pressed`).
- Ligne d'aide d'une phrase selon le mode : « Mode entretien : l'agent mène, une question à la fois. » / « Mode libre : sélectionnez un passage et demandez. »
- **Messages** : agent à gauche (fond `--background`, bordure, coin haut gauche à 4 px), humain à droite (fond `--secondary`, coin haut droit à 4 px). Au-dessus de chaque bulle : auteur en 12 px (« Agent · question 3 sur 5 du Périmètre », « Marie Lefèvre · client »). Un message de l'agent qui a créé une proposition porte une `EntityChip` qui fait défiler jusqu'à elle (contenu) ou la met en évidence dans l'arborescence (page).
- **Mode entretien** : l'agent suit, page par page, un guide de questions (§8), une question à la fois, reformule la réponse puis propose le texte de la section. Il commence par la première page requise non stable, puis les autres dans l'ordre de l'arborescence. Une page ajoutée par un humain n'a pas de guide : l'agent déduit ses questions du titre et du contenu.
- **Mode libre** : actions sur la sélection, aussi dans la barre flottante de l'éditeur : « Développer », « Challenger », « Simplifier », « Trouver les trous », « En faire une page » (propose une nouvelle page avec la sélection comme point de départ). « Challenger » répond en message (questions, objections) sans proposer de texte, sauf si l'humain le demande.
- **Ce qui manque encore** : carte en bas du fil, résultat de `ai.ideaGaps` (max 4 lignes) : icône vide, page en mono, manque en une phrase, bouton « Explorer » (bascule en entretien sur cette page) ou, si le manque appelle une nouvelle page, « Proposer une page ».
- Zone de saisie : `textarea` 2 lignes, bouton rond « Envoyer » (`aria-label`), Entrée envoie, Maj+Entrée va à la ligne. Dessous : `InlineAlert` compact « Envoyé à Anthropic avec la clé de l'organisation. » + « Détails ».
- Réponse en flux : le texte s'écrit progressivement (`aria-live="polite"` sur le dernier message, annoncé à la fin seulement) ; bouton « Arrêter » pendant le flux.

### 6.4 Proposition dans le document (`ProposalDiff`)

- Rendue **à l'endroit exact** où elle s'appliquerait : cadre pointillé 1 px `--primary`, rayon 12, fond `--diff-bg` (clair `#faf8ff`, sombre `#1a1536` : à ajouter aux jetons du lot 0).
- Barre du haut : icône `auto_awesome` en `--primary`, « Proposition de l'agent · <ajout d'une section | remplacement | ajout> », à droite la justification courte (« suite à la réponse de Marie »).
- Corps : le contenu proposé, rendu comme le document. Pour un remplacement : ancien texte barré en `--muted-foreground` au-dessus, nouveau texte dessous.
- Barre du bas : « Accepter » (principal, raccourci **A**), « Modifier » (ouvre le contenu en édition dans le cadre, puis « Accepter ma version »), « Rejeter » (discret, raccourci **R**). Les raccourcis agissent sur la proposition qui a le focus.
- Après décision : ligne `role="status"` « Section ajoutée par l'agent, acceptée par vous. » / « Proposition rejetée. » + « Annuler » (10 s, ou jusqu'à la prochaine modification de la page).
- Plusieurs propositions sur une page : navigation « Proposition 1 sur 3 » avec précédente / suivante dans la barre du haut.

### 6.5 Arborescence des pages

- En-tête : libellé de groupe « PAGES » + sous-titre 12 px `--muted-foreground` « Structure de cadrage par défaut · glisser pour réordonner » (le nom du gabarit d'origine ; « Structure personnalisée » dès qu'une page a été ajoutée, supprimée ou déplacée).
- Une ligne de 34 px par page, dans une `ol` :
  - **Poignée** `drag_indicator` 16 px en `--border-strong` (plus foncée au survol et au focus), vrai `button` avec `aria-label` « Déplacer 05 · Périmètre » et infobulle « Glisser, ou Alt + flèches ».
  - Icône de statut (stable `check_circle` remplie verte ; à relire `rate_review` en `--primary` ; brouillon `edit` ; vide `radio_button_unchecked` en `--border-strong`, libellé en `--muted-foreground`).
  - Numéro de position + titre (« 05 · Périmètre »).
  - Étiquette « requise » (10 px, 600, bordure `--border`, rayon 4) sur les pages requises, infobulle « Page requise pour passer au cadrage ».
  - Pastille 7 px `--primary` si des propositions attendent sur la page.
  - Page courante : fond `--secondary`, 600, `aria-current="page"`.
  - Menu contextuel (clic droit et bouton `more_horiz` au survol) : Renommer, Insérer une page après, Monter, Descendre, Supprimer (absent sur une page requise).
- **Glisser-déposer** : `@dnd-kit/sortable` (accessible, clavier inclus). Pendant le glisser : la ligne soulevée sur `--raised` avec ombre, un trait de 2 px `--primary` marque l'emplacement de dépôt. Au clavier : focus sur la poignée, Espace pour saisir, flèches pour déplacer, Espace pour déposer, Échap pour annuler ; raccourci direct **Alt + ↑ / ↓** sur la poignée. Chaque déplacement est annoncé (« Périmètre déplacée en position 4 sur 11 »). Sous `prefers-reduced-motion`, pas d'animation de glissement.
- **Page proposée par l'agent** : carte sous la liste, cadre pointillé `--primary`, fond `--diff-bg`, icône `auto_awesome`, titre proposé (600), justification 12 px (« Proposée par l'agent : Marie cite 3 concurrents dans Problème et Proposition de valeur. »), boutons « Ajouter la page » (principal, 28 px) et « Ignorer » (discret). Accepter l'insère à la position proposée (`afterPageId`) avec son contenu initial éventuel, en statut brouillon, et l'ouvre. Plusieurs propositions de page : empilées, 3 au maximum visibles + « N autres ».
- **« Ajouter une page »** : bouton pleine largeur sous la liste, 34 px, bordure pointillée `--border-strong`, icône `add`. Crée « Page sans titre » en fin de liste, l'ouvre et place le focus dans son titre. Une page neuve (humaine ou agent) garde un contour discret jusqu'à son premier enregistrement de contenu.
- Légende des statuts en bas, sur `--surface`.

## 7. États

### 7.1 Dossier vide (projet neuf)
Les 10 pages de la structure par défaut sont là, toutes `empty`. Document : `EmptyState` « Aucune idée encore » + « Racontez le projet en quelques phrases, l'agent vous aide à le structurer. » + bouton « Commencer le dossier » qui ouvre Vision et lance le mode entretien. Agent : premier message de l'agent déjà affiché (« Qu'est-ce que ce produit change, et pour qui ? Une phrase suffit pour commencer. »), **sans appel IA** (texte fixe).

### 7.2 IA non configurée
L'éditeur et la gestion des pages fonctionnent entièrement. Le panneau de l'agent affiche l'`InlineAlert` de S-framing §4.5 (lien « Configurer l'IA » pour propriétaire / admin, sinon « Demandez à un administrateur de l'organisation d'ajouter la clé. »). Le guide de questions §8 reste affiché en liste statique pour aider à écrire sans IA.

### 7.3 Appel en cours, limite, erreurs
Repris de S-framing §4.3 à 4.9, rendus en `InlineAlert` dans le panneau, au-dessus de la saisie. Un seul message par situation (règle 5 du lot 0). La saisie est conservée.

### 7.4 Conflit d'édition
`idea.save` renvoie `CONFLICT` : `InlineAlert` attention au-dessus du document « <nom> a modifié cette page pendant que vous écriviez. » + « Voir les deux versions » (vue côte à côte, choisir par bloc) ; la saisie locale n'est jamais perdue. Les propositions concernées passent en `stale`. Réordonnancement concurrent : le dernier gagne, l'arborescence se recharge et annonce « L'ordre des pages a été modifié par <nom>. »

### 7.5 Publication
« Enregistrer une version » → confirmation en ligne dans l'en-tête (« Publier N pages dans le dépôt de spec ? [Publier] [Annuler] »), puis suivi comme 48e. Succès : « Version publiée · <sha court> » dans l'en-tête. Échec : `InlineAlert` erreur + « Réessayer ».

### 7.6 Vue client
Identique, sans « Enregistrer une version » ni « Passer au cadrage » (absents, pas grisés). Les avatars indiquent « (client) ». Le client ajoute, déplace et accepte des pages comme l'équipe.

### 7.7 Chargement, projet introuvable, 401
Squelettes de l'arborescence et du document (`motion-safe:`). Projet introuvable et 401 : comme S-features.

### 7.8 Suppression d'une page
Confirmation en ligne dans la ligne de l'arborescence : « Supprimer « Concurrence » ? Son contenu restera récupérable 30 jours. [Supprimer] [Garder] », focus sur « Garder ». Après suppression : `role="status"` « Page supprimée. » + « Annuler ». Les pages supprimées sont listées dans un repli « Corbeille (N) » en bas de l'arborescence (restaurer). Une page requise n'a pas d'action « Supprimer » ; le serveur la refuse de toute façon (`FORBIDDEN`).

## 8. Guide de questions de l'agent (mode entretien)

Base du prompt système, une liste par page de la structure par défaut (clé `templateKey`). L'agent pose une question à la fois, saute ce qui est déjà couvert dans le dossier, et propose le texte après 2 à 4 réponses. Pour une page sans `templateKey`, il déduit 3 à 5 questions du titre et du contenu existant.

| Page | Questions |
|---|---|
| Vision | Que change ce produit, et pour qui, en une phrase ? Pourquoi maintenant ? À quoi ressemble le succès dans un an ? |
| Problème | Comment font-ils aujourd'hui ? Qu'est-ce que ça coûte (temps, argent, clients perdus) ? Qu'est-ce qui prouve que le problème existe ? |
| Utilisateurs | Qui utilise, qui paie, qui valide ? Quelle tâche veulent-ils accomplir ? Qu'est-ce qui les ferait abandonner ? |
| Proposition de valeur | Pourquoi vous plutôt que l'existant ? Quelles alternatives utilisent-ils ? Qu'est-ce qui est difficile à copier ? |
| Parcours | Quel est le premier moment où l'utilisateur gagne quelque chose ? Quelles étapes sont critiques ? |
| Périmètre | Que faut-il pour une première version utile ? Qu'est-ce qui peut attendre ? Qu'est-ce qui est explicitement exclu ? |
| Contraintes | Quelles contraintes ne sont pas négociables (légales, techniques, budget, délais) ? Données personnelles ? |
| Mesure | À quoi verra-t-on que ça marche dans 3 mois ? Quels chiffres, avec quelle cible ? |
| Hypothèses et risques | Qu'est-ce qui, s'il est faux, tue le projet ? Comment le vérifier vite ? |
| Glossaire | Quels mots ont un sens précis chez vous ? |

**Quand proposer une page** : quand un sujet revient dans au moins deux pages ou prend plus d'un tiers d'une page (concurrence, tarification, partenaires, contraintes légales spécifiques, intégrations). L'agent propose au plus une page à la fois et ne repropose pas une page ignorée.

Ton : vouvoiement, phrases courtes, pas de flatterie, pas d'emoji, pas de « je suis ravi ». Challenger poliment : relever les contradictions entre pages (« Problème parle de clients pressés, Périmètre prévoit une inscription obligatoire »).

## 9. Lot 2c · Maturité et passage au cadrage

- Jauge : nombre de pages `stable` sur le nombre total de pages (hors corbeille).
- **Seuil** pour « Passer au cadrage » : toutes les pages **requises** en `stable` (par défaut Vision, Problème, Utilisateurs, Périmètre). La raison liste les pages manquantes (« il manque : Périmètre stable », « il manque : Utilisateurs et Périmètre stables »).
- Clic : publie une version si des changements ne sont pas publiés (même confirmation que 7.5), appelle `ai.draftBriefFromIdea` (toutes les pages, dans l'ordre de l'arborescence), puis ouvre l'Assistant de cadrage (`/projects/[projectId]/framing?from=idea`) à l'étape « Le brief », brief prérempli, badge « Généré depuis le dossier d'idée ». Mise à jour de S-framing : l'étape 1 affiche alors un résumé « Basé sur le dossier d'idée · version <sha> » + lien « Ouvrir le dossier », au lieu du champ texte.
- Le fil de phase (`PhaseRail`) passe de Idée à Cadrage quand le premier brief est généré depuis le dossier.

## 10. Responsive

- **1024–1279 px** : panneau de l'agent repliable (bouton `auto_awesome` dans l'en-tête), arborescence conservée.
- **< 1024 px** : arborescence dans un menu déroulant au-dessus du document (« 05 · Périmètre ▾ ») ; le réordonnancement se fait par « Monter / Descendre » dans le menu de chaque page (pas de glisser-déposer tactile au lot 2) ; « Ajouter une page » en bas du menu ; agent en panneau plein écran ouvert par un bouton flottant 56 px en bas à droite avec la pastille du nombre de propositions.
- **< 768 px** : en-tête sur deux lignes, boutons pleine largeur ; propositions : boutons de 44 px, Accepter et Rejeter côte à côte, Modifier dessous.

## 11. Accessibilité

- Repères : `nav` « Pages du dossier » contenant une `ol`, `article` pour le document, `aside` « Agent ». h1 unique « Dossier d'idée », h2 = titre de la page.
- Raccourcis A / R uniquement quand une proposition a le focus ; Alt + ↑ / ↓ uniquement sur une poignée de page ; jamais de raccourci global à une lettre. Liste des raccourcis accessible depuis « ? ».
- Glisser-déposer entièrement utilisable au clavier (6.5) et annoncé ; alternative « Monter / Descendre » dans le menu de chaque page.
- Statuts de page : icône + libellé (la légende est visible ; chaque lien porte `aria-label` « 05 · Périmètre, brouillon, requise, 1 proposition en attente »).
- Jauge `role="meter"` avec `aria-valuenow` / `aria-valuemax`.
- Flux de l'agent : annoncé une fois à la fin ; « Arrêter » atteignable au clavier.
- Contrastes AA clair et sombre, axe sans violation sur chaque état ; mouvement réduit respecté (pas d'animation d'écriture ni de glissement, le texte apparaît par blocs).

## 12. Tickets à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Lot 2a · Espace Idée : modèle IdeaPage (pages modulables, structure par défaut, pages requises), procédures idea.list/get/save/setStatus/publish et idea.page.create/rename/reorder/delete/restore, route /projects/[projectId]/idea, éditeur TipTap Markdown restreint, arborescence avec glisser-déposer (@dnd-kit) et « Ajouter une page », corbeille, enregistrement auto, conflit, publication dans idea/ (+ _index.yaml), droits client. Réf. design/refonte/lot-2-idee-passation.md §1 à §7, §10, §11. `pkg:api` `pkg:contract` `pkg:web` — dépend des lots 0 et 1
- [ ] **[TK-?]** Lot 2b · Espace Idée : panneau de l'agent (entretien / libre), ai.ideaChat en flux, IdeaProposal (contenu et createPage) + idea.proposal.decide, ProposalDiff dans l'éditeur (A / R, modifier, annuler, stale), carte « page proposée » dans l'arborescence, ai.ideaGaps, guide de questions §8. Réf. §6.3, §6.4, §6.5, §8. `pkg:api` `pkg:contract` `pkg:web` — dépend de 2a
- [ ] **[TK-?]** Lot 2c · Espace Idée : jauge de maturité, seuil sur les pages requises et « Passer au cadrage », ai.draftBriefFromIdea, Assistant de cadrage ouvert à l'étape brief depuis le dossier, PhaseRail Idée → Cadrage. Réf. §9. `pkg:api` `pkg:web` — dépend de 2b
```

Tests attendus (en plus des habituels) : aucune écriture de page ni création de page par l'agent sans `idea.proposal.decide` ; suppression d'une page requise refusée côté serveur ; réordonnancement (liste incomplète refusée, positions recalculées, fichiers publiés non renommés, `_index.yaml` conforme) ; glisser-déposer au clavier ; contenu hostile (`<script>`, `javascript:`, image Markdown, HTML) rendu inerte dans le document et dans les propositions ; aller-retour Markdown sans perte sur les 10 pages par défaut ; droits client (publication et passage au cadrage refusés côté serveur) ; conflit de version ; aucune donnée personnelle dans la charge envoyée au modèle ; captures de chaque état en clair, sombre et 375 px.

## 13. Questions ouvertes (non bloquantes)

- Temps réel (Yjs) pour l'édition simultanée client / équipe : reporté après le lot 2 ; à prioriser si le freelance rédige en direct avec son client.
- Le client peut-il inviter d'autres personnes de son côté sur le dossier ? Par défaut non (invitation par l'équipe).
- Autres structures que « cadrage par défaut » (application mobile, site vitrine, refonte) : le modèle les permet, le choix à la création du projet viendra plus tard.
- Sous-pages (arborescence à plusieurs niveaux) : non au lot 2, liste plate.
