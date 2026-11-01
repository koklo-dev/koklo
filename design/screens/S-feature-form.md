---
id: S-feature-form
titre: Formulaire d'une fonctionnalité (création, modification, suppression)
version: 1.1
---
## 1. Utilisateurs et objectif
- **Vue équipe qui écrit** : propriétaire, administrateur, développeur, designer (`SPEC_BATCH_ROLES`, `docs/api-contract.md`). Le designer est limité par opération : il n'enregistre que des fonctionnalités **liées à au moins un écran** (avant et après l'opération ; pour une création, dans l'opération elle-même). Le serveur reste l'autorité ; l'écran l'explique et le contrôle d'avance (§5.4).
- **Sans droit d'écriture** : client, business (et tout rôle inconnu) ne voient **aucun** bouton d'écriture, aucun emplacement vide, aucun bouton grisé. Les adresses `?new=1` et `?edit=F-001` sont ignorées pour eux (le paramètre est retiré par `replaceState` ; `?edit=F-001` ouvre la fiche en lecture si l'identifiant est valide). Vocabulaire git interdit côté client (AC-48-28) : le formulaire n'est jamais rendu pour eux, mais les textes ci-dessous n'utilisent de toute façon jamais « commit », « branche », « SHA » dans une phrase.
- Objectif : écrire dans la spec du projet sans connaître git. Une écriture est un **enregistrement asynchrone** (vision : lot de spec traité par la file `spec-write`, un commit à la fin) : l'écran montre honnêtement les temps d'attente, ne perd jamais la saisie, et ne dit « enregistré » qu'une fois la version écrite.
- Écran : formulaire dans un `Sheet` posé sur `/projects/[projectId]/features` (S-features). Pas de nouvelle route, pas de nouvelle entrée de navigation.

## 2. Tâches et parcours
- Principale : créer une fonctionnalité, ou en modifier une, puis la retrouver à jour dans la liste.
- Secondaires : supprimer une fonctionnalité ; suivre un enregistrement en cours ; reprendre un brouillon ; abandonner un brouillon ; résoudre un conflit de version.
- Entrées (équipe qui écrit, et seulement si `spec.head.status = ready`, voir §4.1) :
  - bouton « Nouvelle fonctionnalité » (icône `add`) à droite du titre de page, et dans l'état vide 4.3 de S-features ; ouvre `?new=1` ;
  - bouton « Modifier » (icône `edit_note`) dans le pied de la fiche ; ouvre `?edit=F-001` (la fiche se ferme, le formulaire la remplace ; Retour du navigateur revient à la fiche).
- Sorties :
  - succès : le formulaire se ferme, retour à la liste (§5.6) ;
  - « Fermer » / Échap / clic hors du panneau : fermeture, **brouillon gardé** (§5.5) ; modification ouverte depuis la fiche : retour à la fiche ;
  - `UNAUTHORIZED` : `/login`, brouillon gardé ; session sans organisation : `/organizations`.
- Les adresses `new` et `edit` ne coexistent pas avec `feature` ; une valeur invalide (`edit=x`, `new=2`) est ignorée.
- Hors lot : modification en série de plusieurs fonctionnalités dans un même enregistrement (le contrat accepte 1 à 50 opérations ; le formulaire en envoie **une** seule), édition des tableaux/endpoints/écrans comme entités (le contrat n'a que `feature.*`), champ « message du commit » (le serveur en produit un), choix de la branche.

## 3. Contenu
Sources du contrat `@koklo/contract` 0.7.0, **aucun changement** : `spec.head` (version lue, état d'indexation), `spec.getFeature` (préremplissage et référence de comparaison), `specBatch.submit` (`{ projectId, idempotencyKey, branch?, baseSha?, message?, operations[1..50] }` → `specBatch`), `specBatch.get` (suivi), `spec.listFeatures` (retour à la liste), `organization.list` (rôle de l'appelant, déjà lu par l'écran).

### 3.1 Champs, alignés sur `featureFields` du contrat
| Champ (libellé) | Contrat | Création | Modification | Validation côté client (= contrat) |
|---|---|---|---|---|
| Titre | `title` string 1..200 | obligatoire | prérempli | non vide après suppression des espaces de début et de fin (le contrat accepte `" "` ; on refuse et on envoie la valeur nettoyée, voir §9) ; 200 caractères maximum ; compteur « n / 200 » annoncé dès 180 |
| Priorité | `priority` ∈ must, should, could, wont | obligatoire, **aucune présélection** (« Choisir une priorité ») | prérempli | valeur de l'énumération. Libellés : Indispensable, Importante, Souhaitable, Reportée |
| Statut | `status` ∈ brouillon, specifiee, implementee, adoptee | facultatif, présélection « Brouillon » (valeur par défaut du serveur : non envoyé tant qu'il vaut brouillon) | prérempli | valeur de l'énumération. Libellés et icônes de S-features §3.3 |
| Description | `description` string, sans limite | facultative | préremplie | aucune. Texte brut, retours à la ligne conservés ; aide « Texte brut : les retours à la ligne sont conservés. » |
| Critères d'acceptation | `criteria[]` : `{ title: string min 1, steps: [{ type, text min 1 }] }` | liste vide possible | préremplie | chaque critère : titre non vide ; chaque étape : type ∈ etant_donne, quand, alors, et, texte non vide. Zéro étape est permis par le contrat : une aide non bloquante l'encourage (§3.3) |
| Écrans | `screens[]` motif `S-<slug>` | facultatif | prérempli | un identifiant par ligne, motif `^S-[a-z0-9][a-z0-9-]*$` |
| Rôles | `roles[]` motif `RL-<slug>` | idem | idem | `^RL-[a-z0-9][a-z0-9-]*$` |
| Règles | `rules[]` motif `R-nnn` | idem | idem | `^R-\d{3,}$` |
| Tables | `tables[]` motif `T-<slug>` | idem | idem | `^T-[a-z0-9][a-z0-9-]*$` |
| Endpoints | `endpoints[]` motif `E-<slug>` | idem | idem | `^E-[a-z0-9][a-z0-9-]*$` |
| Exigences non fonctionnelles | `nfr[]` motif `NFR-<slug>` | idem | idem | `^NFR-[a-z0-9][a-z0-9-]*$` |

Non présents dans le formulaire : l'identifiant `F-nnn` (attribué par le serveur à la création, renvoyé dans `results[0].specId`, **jamais saisi**), le chemin du fichier, `idempotencyKey`, `baseSha`, `branch`, `message` (produits par le web ou le serveur, §5.2).

Libellés d'étapes (comme la fiche) : « Étant donné », « Quand », « Alors », « Et ».

### 3.2 Gabarit du panneau
`Sheet` latéral de **440 px** (même gabarit que la fiche, DESIGN §5 : 380 à 440 px) ; sous 768 px pleine largeur. Titre (h2, nom accessible du dialogue) : « Nouvelle fonctionnalité » ou « Modifier F-001 » (identifiant en mono). Zone défilante nommée comme la fiche (`section` `tabIndex=0`, anneau `--ring`, exigence axe `scrollable-region-focusable`). Pied **collant** dans le panneau (actions toujours atteignables, cibles 44 px en mobile). Structure :
1. Bandeau de brouillon (§5.5), absent s'il n'y a pas de brouillon repris.
2. Résumé d'erreurs (§4.3), absent tant qu'aucune erreur.
3. Section « Général » : Titre, Priorité, Statut.
4. Section « Description ».
5. Section « Critères d'acceptation » (§3.3).
6. Section « Éléments liés » dans un `Collapsible` : fermée par défaut, **ouverte** si au moins un champ lié est rempli, si une erreur la concerne, ou pour un designer (§5.4). Six champs multilignes (voir ci-dessous).
7. Indicateur d'avancement (§4.4) quand un enregistrement est en cours.
8. Pied : « Enregistrer » (principal), « Fermer » (`Button variant="outline"`, garde le brouillon) ; en modification, à gauche, « Supprimer cette fonctionnalité » (`Button variant="ghost"`, texte `--destructive`, jamais la couleur seule : libellé explicite).

Champs « Éléments liés » : sans composant nouveau, un champ multiligne par type, « un identifiant par ligne » (lignes vides ignorées, espaces de début et de fin retirés), exemple en aide (`S-inscription`, `RL-admin`, `R-001`, `T-utilisateur`, `E-connexion`, `NFR-performance`), identifiants en JetBrains Mono. Une ligne invalide produit l'erreur de champ « La ligne 2 n'est pas un identifiant valide (exemple : S-inscription). » Les doublons ne sont pas inventés comme erreur côté client (le contrat n'en dit rien) : la validation serveur tranche (§4.7).

### 3.3 Éditeur de critères
Liste ordonnée (`ol`) de critères ; chaque critère est un `fieldset` avec `legend` « Critère 1 » :
- Identifiant `AC-n` en mono, **lecture seule**, pour un critère existant ; badge « Nouveau » (icône + texte) pour un critère ajouté dans ce formulaire.
- Champ « Titre du critère » (obligatoire).
- Étapes : liste de lignes, chacune avec `Select` « Type d'étape » (4 valeurs) et champ « Texte de l'étape » (multiligne d'une ligne qui s'agrandit) ; bouton « Retirer l'étape » ; bouton « Ajouter une étape » (le type proposé suit la logique Étant donné → Quand → Alors → Et).
- Actions du critère : « Monter » (`keyboard_arrow_up`), « Descendre » (`keyboard_arrow_down`), « Retirer le critère » (texte, pas d'icône `delete` à ajouter au registre). Boutons d'icône avec `aria-label` complet (« Monter le critère 2 »).
- Bouton « Ajouter un critère » (icône `add`) sous la liste.
- Aide non bloquante sous un critère sans étape : « Ajoutez au moins une étape pour que ce critère soit testable. » (texte, `muted-foreground`, icône `edit_note`).
- Règle de numérotation (docs/api-contract.md, « Acceptance-criterion numbering »), expliquée en une phrase d'aide permanente sous la liste : « Changer le titre d'un critère le remplace par un nouveau critère. Les identifiants ne sont jamais réutilisés : les scénarios de test qui citaient l'ancien devront être mis à jour. » À la modification du titre d'un critère existant, la même idée apparaît sous ce critère : « Ce critère recevra un nouvel identifiant. » (le badge « Nouveau » s'affiche à la place de `AC-n`). Monter/descendre ne change pas les identifiants.
- Toute la liste est envoyée en bloc (le contrat remplace `criteria` entièrement).

## 4. États
Un seul état principal à la fois dans le panneau. Priorité : disponibilité de l'écriture, chargement, saisie, envoi, suivi, issue.

### 4.1 Disponibilité de l'écriture (avant d'ouvrir)
Le bouton « Nouvelle fonctionnalité » et « Modifier » existent seulement si : rôle ∈ owner, admin, dev, designer **et** `spec.head.status = ready`. Ils sont absents (rien d'affiché) dans les états de S-features 4.5 (en préparation), 4.6 (sans dépôt de spec : on y crée d'abord le dépôt), 4.7, 4.8 (index en échec), 4.10. Pendant qu'un enregistrement est suivi (§4.5) le bouton « Enregistrer » d'un nouveau formulaire est désactivé avec le texte « Un enregistrement est déjà en cours. » relié par `aria-describedby` : les enregistrements d'une même page sont séquentiels, ce qui évite un conflit de version avec soi-même.

### 4.2 Saisie (brouillon)
Formulaire actif. Création : vide (statut Brouillon). Modification : préremplie depuis `spec.getFeature`, avec `baseline` (valeurs lues + `commitSha` de la fiche) conservée en mémoire pour calculer le patch. « Enregistrer » est actif ; en modification **sans aucun changement**, il est désactivé et une ligne « Aucune modification à enregistrer. » (le contrat exige au moins un champ modifié) est reliée au bouton. La saisie est gardée automatiquement (§5.5).
- Chargement de la fiche en modification : `role="status"` `aria-busy` « Chargement de la fonctionnalité… », 4 blocs squelette, « Enregistrer » absent. Erreurs de chargement : mêmes états que S-features 4.11 (`NOT_FOUND` : « Cette fonctionnalité n'existe plus dans la spec. » + « Fermer » et le brouillon éventuel est conservé ; 503, 429, `PROVIDER_AUTH_EXPIRED`, `SPEC_INDEX_FAILED` : mêmes textes, « Réessayer ») ; aucun champ n'est rendu sans référence de comparaison.

### 4.3 Validation côté client
Validation à la perte du focus d'un champ déjà touché, et à l'envoi. À un envoi invalide : aucun appel réseau ; un **résumé d'erreurs** (`Alert` destructive, `role="alert"`, icône `warning`, titre « Corrigez N point(s) avant d'enregistrer ») liste chaque erreur avec un lien (vrai `a href="#champ"`) qui place le focus sur le champ ; le focus va sur le titre du résumé (`tabindex="-1"`). Chaque champ en erreur : `aria-invalid="true"`, message en texte sous le champ relié par `aria-describedby` (icône `warning` + texte, jamais la couleur seule). Messages : « Saisissez un titre. », « Le titre ne doit pas dépasser 200 caractères. », « Choisissez une priorité. », « Saisissez le titre du critère 2. », « Saisissez le texte de l'étape 3 du critère 1. », « La ligne 2 n'est pas un identifiant valide (exemple : S-inscription). » Les sections repliées contenant une erreur s'ouvrent.

### 4.4 Envoi et suivi (indicateur d'avancement)
Dès l'envoi, un indicateur `ol` nommé « Avancement de l'enregistrement » apparaît au-dessus du pied (même mécanique que S-projects §3.1), chaque ligne icône + texte :
| Étape | À faire | En cours | Terminée | Échec |
|---|---|---|---|---|
| 1. Envoi | `radio_button_unchecked` À faire | `play_circle` En cours… | `check_circle` Terminé | `warning` Non enregistré |
| 2. Écriture dans la spec | idem | idem (`queued` : « En attente de son tour », `committing` : « Écriture en cours… ») | idem | idem |
| 3. Mise à jour de la liste | idem | « La liste se met à jour… » | idem | `warning` « Pas encore à jour » (n'est pas une erreur, §4.6) |

- **Envoi** (`specBatch.submit` en vol, jusqu'à ~8 s : le serveur attend le résultat avant de répondre) : champs en lecture seule (`readOnly`, pas `disabled` : le focus et la lecture restent possibles), « Enregistrer » devient « Enregistrement… » (`aria-busy`, un seul appel même au double clic), « Fermer » reste actif. Annonce `role="status"` : « Envoi de votre modification… ».
- **En attente (`queued`)** : la réponse 200 porte un lot non terminé. Annonce « En attente de son tour. » puis suivi par `specBatch.get` : première relecture 1,5 s après, intervalle multiplié par 1,5 jusqu'à 5 s, **arrêt à 60 s** après la réponse de l'envoi ; onglet masqué : suspendu. Pour une création, `results[0].specId` est déjà connu : « F-004 en cours de création. »
- **En cours (`committing`)** : « Écriture en cours… ».
- **Dépassement des 60 s** : pas d'erreur. `Alert` neutre (icône `schedule`) « L'enregistrement prend plus de temps que prévu. Il continue sans vous : votre saisie est gardée. » ; boutons « Vérifier maintenant » (nouvelle fenêtre de suivi bornée) et « Fermer ». Un marqueur de suivi (§5.7) permet de reprendre à la réouverture de la page. Le texte reste neutre : le travail dépend de la disponibilité du service d'écriture.
- Le formulaire **fermé** pendant le suivi : le suivi continue au niveau de la page (§5.7).

### 4.5 Succès
`committed` : étape 2 terminée ; la version écrite (`commitSha`) est connue. Équipe : « Version de la spec abc1234 » (mono, `aria-label` « Version de la spec abc1234 »). Étape 3 : attente de l'indexation, relecture de `spec.head` toutes les 2 s jusqu'à ce que `spec.head.commitSha` soit égal au `commitSha` du lot (docs/api-contract.md : l'index suit le commit après le webhook), **arrêt à 30 s**. Quand l'index est à jour : étape 3 terminée, annonce « F-004 créée. » / « F-001 enregistrée. » / « F-003 supprimée. », fermeture du panneau, retour à la liste (§5.6).
- Si `spec.head.status` devient `failed` à ce moment (par exemple `spec_too_large`) : l'enregistrement a bien eu lieu mais la spec n'est plus lisible : le panneau se ferme et l'écran de la page passe à S-features 4.8 avec, au-dessus, la ligne « Votre modification a été enregistrée, mais la spec n'a pas pu être relue. » (`role="status"`).

### 4.6 Succès, liste pas encore à jour
Au bout des 30 s sans que l'index ait rattrapé : étape 3 « Pas encore à jour » (icône `schedule`, pas d'alerte rouge), phrase « Votre modification est enregistrée. La liste se mettra à jour dans un instant. » avec « Actualiser la liste » et « Fermer » ; la page relance les relectures de `spec.head` comme en S-features 4.5 : **toutes les 5 s pendant 2 minutes au plus**, suspendues onglet masqué, puis arrêt silencieux (« Actualiser la liste » rouvre une fenêtre de 30 s). **Fermer** le panneau dans cet état ne coupe pas ces relectures : le bloc « Votre modification est enregistrée… » passe dans la page (région d'état) et la confirmation de §5.6 apparaît dès que l'index a rattrapé (livré en 1.1, test `feature-form-tracking`). Le brouillon est supprimé dès que le lot est `committed`.

### 4.7 Échecs : table unique (réponse de `submit` ou état du lot relu par `get`)
Le même rendu sert l'erreur typée de `submit` et le lot terminé (`failed`/`conflict` avec `errorCode`). Une seule `Alert` à la fois, `role="alert"`, icône + titre + texte + action. **La saisie est toujours conservée** (champs intacts, brouillon gardé). Valeur inconnue : texte générique « L'enregistrement n'a pas abouti. Votre saisie est gardée. » + « Réessayer », jamais la valeur brute dans la phrase.

| Cas | Titre / texte | Actions | Clé d'idempotence au réessai |
|---|---|---|---|
| Réseau coupé, délai dépassé, pas de réponse | « Impossible de confirmer l'enregistrement » / « Votre connexion a été interrompue. Réessayer ne créera pas de doublon. » | « Réessayer » | **même clé** (la reprise est sûre, c'est le but de l'idempotence) |
| `INTERNAL` (500, y compris lot `failed`/`INTERNAL`) | « Nous ne savons pas si l'enregistrement a abouti » / « Vérifiez la liste avant de réessayer, pour ne pas créer deux fois la même fonctionnalité. » + équipe : « Référence : `<requestId>` » en mono | « Vérifier la liste » (ferme, relit, garde le brouillon), « Réessayer » | nouvelle clé |
| `PROVIDER_UNAVAILABLE` (503, ou lot `failed`) | « GitHub est momentanément indisponible » / « Rien n'a été écrit. Réessayez dans un instant. » (équipe owner/admin : + lien « Vérifier l'état de l'application GitHub » vers `/github`) | « Réessayer » | nouvelle clé |
| `PROVIDER_RATE_LIMITED` (429) | « Trop de demandes pour le moment » / « Rien n'a été écrit. Réessayez dans un instant. » (pas de compte à rebours, `retryAfterMs` ignoré à l'écran) | « Réessayer » | nouvelle clé |
| `PROVIDER_AUTH_EXPIRED` (403 `{ kind, refreshable }`) | « Koklo n'a plus accès au dépôt de spec » / owner/admin : « Autorisez de nouveau Koklo sur GitHub, puis revenez enregistrer : votre saisie est gardée. » + lien « Ouvrir la page GitHub » ; autres : « Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo. » | lien `/github` (owner/admin), « Fermer » | nouvelle clé |
| `FORBIDDEN` (rôle, ou lot `failed`/`FORBIDDEN` pour un designer) | Designer : « Vous ne pouvez enregistrer que les fonctionnalités liées à un écran » / « Ajoutez un écran dans « Éléments liés », ou demandez à un développeur. » ; autre rôle : « Vous n'avez pas le droit d'enregistrer dans la spec. » | « Aller à Éléments liés » (focus sur « Écrans », designer) ; « Fermer » | nouvelle clé |
| `NOT_FOUND` (projet ou dépôt de spec disparu) | « Ce projet n'a plus de dépôt de spec » / « Ou il n'existe plus. Votre saisie est gardée. » | lien « Voir les projets », « Fermer » | sans objet |
| `SPEC_INVALID` (422 ; ou lot `failed`/`SPEC_INVALID` avec `report`) | « La spec obtenue ne serait pas valide » / « Rien n'a été écrit. Corrigez les points ci-dessous. » + liste des diagnostics (`issues`, 100 au plus) : message du diagnostic, code en mono (`rule`/`code`, équipe), identifiant d'entité si présent ; si `truncated` : « D'autres problèmes ne sont pas affichés. » | chaque diagnostic dont le `pointer`/`entityId` correspond à un champ connu (titre, priorité, statut, description, critères, liens) devient un lien qui y place le focus et marque le champ `aria-invalid` ; les autres restent dans la liste | nouvelle clé |
| `SPEC_BATCH_CONFLICT` `stale_base` (ou lot `conflict`/`stale_base`) | « La spec a changé depuis que vous avez ouvert ce formulaire » / « Rien n'a été écrit. Rechargez la version actuelle : vos modifications sont conservées. » | « Recharger la version actuelle » (§5.8) | nouvelle clé |
| `SPEC_BATCH_CONFLICT` `write_conflict` (ou lot `conflict`/`write_conflict`) | modification/suppression : « Cette fonctionnalité a changé ou n'existe plus dans la spec » / « Rechargez-la pour voir où elle en est. » ; création : « La spec a bougé pendant l'enregistrement. Réessayez. » | « Recharger la version actuelle » (modification/suppression), « Réessayer » (création) | nouvelle clé |
| `SPEC_BATCH_CONFLICT` `idempotency_key_reused` | « Cet envoi ne peut pas être repris tel quel » / « Réessayez : un nouvel envoi sera préparé avec votre saisie. » | « Réessayer » | nouvelle clé (ne devrait pas se produire, voir §5.2) |
| `VALIDATION` (422 `{ field, message }`) | « Une valeur est refusée » / ligne technique équipe `Champ : <field>` ; si `field` est un champ du formulaire, lien vers lui ; sinon le message du serveur n'est **pas** affiché brut (texte générique) | selon le champ | nouvelle clé |
| `SPEC_INDEX_FAILED` (409) | uniquement au préremplissage (`getFeature`) ou après l'écriture (§4.5) : rendu de S-features 4.8. L'enregistrement lui-même ne le renvoie pas (non listé parmi les erreurs de `submit`) | « Actualiser » | sans objet |
| `UNAUTHORIZED` | redirection `/login` sans message ; brouillon gardé | | |

### 4.8 Suppression (modification d'une fonctionnalité existante)
« Supprimer cette fonctionnalité » ne supprime pas : il remplace le pied par une confirmation **dans le panneau** (aucun nouveau composant, pas de dialogue empilé) : `Alert` neutre dans un `role="group"` nommé (« Confirmer la suppression »), icône `warning`, titre « Supprimer F-003 « <titre> » ? », texte « Ses critères d'acceptation seront supprimés avec elle. Si d'autres éléments de la spec y renvoient (par exemple un scénario de test), la suppression sera refusée et vous verrez pourquoi. » Boutons : « Supprimer » (`Button variant="destructive"`) et « Garder » (`outline`, **reçoit le focus**). Envoi : opération `{ kind: "feature.delete", specId }` seule, mêmes états §4.4 à §4.7 (étape 2 « Suppression en cours… »). La saisie en cours du formulaire n'est pas envoyée ni perdue.

### 4.9 Brouillon repris
Voir §5.5 (bandeau, comparaison avec la version actuelle).

### 4.10 Session et accès
Voir §1 et §2 : sans droit d'écriture, formulaire inexistant ; `UNAUTHORIZED` redirige.

## 5. Interactions et retours

### 5.1 Ouverture
Le bouton d'entrée ajoute `?new=1` ou `?edit=F-001` (`history.pushState`). Focus initial : champ « Titre » (le titre h2 est lu en premier par le nom du dialogue). Création : sans appel `getFeature`. Modification : `getFeature` (§4.2).

### 5.2 Construction de l'envoi (une seule opération)
- `idempotencyKey` : `feature-<uuid>` (lettres, chiffres et tirets : conforme à `^[A-Za-z0-9._:-]{1,128}$`), générée au premier clic « Enregistrer » et gardée avec le brouillon. Réutilisée **seulement** après une absence de réponse (réseau) avec une saisie identique ; toute saisie modifiée, et tout échec **terminal** du serveur (§4.7 colonne « Clé »), prépare une **nouvelle** clé (le contrat rejoue un lot terminé en échec avec la même erreur, et rejoue `idempotency_key_reused` si le contenu a changé).
- `branch` : la branche de la version lue (`spec.head.branch`), jamais saisie. Écrire sur la branche par défaut du dépôt est refusé par le serveur (`VALIDATION`) ; voir question ouverte Q2.
- `baseSha` : modification et suppression → `spec.head.commitSha` lu à l'ouverture (détecte un changement concurrent, `stale_base`). Création → **omis** (une création ne doit pas échouer parce qu'une autre fonctionnalité a changé).
- `message` : omis (le serveur en compose un : « spec: créé F-001 … »). L'auteur et les trailers viennent de la session.
- Opération : création → `feature.create` avec `title`, `priority` et seulement les autres champs renseignés/changés par rapport aux valeurs par défaut (statut ≠ brouillon, description non vide, listes non vides, critères non vides). Modification → `feature.update` avec `specId` et **seulement les champs modifiés** (`criteria` : toute la liste dès qu'un critère, une étape ou l'ordre change). Suppression → `feature.delete`.
- Le web ne construit rien d'autre : pas d'`F-nnn` inventé, pas de chemin de fichier.

### 5.3 Pas d'annulation d'un enregistrement parti
Le contrat n'a aucune annulation de lot. « Fermer » pendant le suivi ne l'annule pas ; le texte le dit (« L'enregistrement continue sans vous. »). Il n'y a pas de bouton « Annuler l'enregistrement ».

### 5.4 Designer
Le designer voit les mêmes boutons. Dans « Éléments liés » (ouvert d'office), une aide permanente sous « Écrans » : « En tant que designer, vous pouvez enregistrer une fonctionnalité seulement si elle est liée à au moins un écran. » Contrôle préalable côté client, **dérivé de la règle documentée** (`docs/api-contract.md`, « Batch states ») et non du contrat : création → au moins un écran saisi ; modification → au moins un écran avant (valeur lue) **et** après (valeur saisie) ; suppression → au moins un écran avant. Sinon « Enregistrer » ne part pas et l'erreur de champ « Liez au moins un écran pour enregistrer cette fonctionnalité. » est affichée sur « Écrans ». Si le serveur répond quand même `FORBIDDEN`, le rendu §4.7 s'applique tel quel (le serveur a toujours raison).

### 5.5 Brouillon, fermeture et abandon
- **Sauvegarde automatique** locale à l'appareil (`localStorage`, `try/catch`, jamais bloquante ; l'écran fonctionne sans) : clé `koklo:feature-draft:<projectId>:<F-nnn|new>`, contenu = valeurs saisies, valeurs de référence lues (`baseline`), `commitSha` de référence, clé d'idempotence, date. Écriture 500 ms après la dernière frappe, seulement si la saisie diffère de la référence. Expire après 7 jours. Effacé à la déconnexion (action de sortie de session), après un lot `committed`, ou à « Abandonner ». Aucune annonce à chaque sauvegarde (bruit pour un lecteur d'écran).
- **Fermer** (bouton « Fermer », Échap, clic hors du panneau, Retour) : aucun dialogue de confirmation, la saisie est gardée. À la fermeture avec brouillon, la région d'état annonce « Brouillon gardé sur cet appareil. »
- **Reprise** : à l'ouverture, si un brouillon existe, bandeau `Alert` neutre (icône `edit_note`) « Brouillon repris, enregistré le `<date>`. » avec le bouton « Abandonner le brouillon ». « Abandonner » demande une confirmation **en ligne** (« Abandonner ce brouillon ? Votre saisie sera effacée. » / « Abandonner » destructif, « Garder » avec focus), puis recharge le formulaire depuis la version actuelle et annonce « Brouillon abandonné. »
- **La fonctionnalité a changé depuis le brouillon** (modification, `commitSha` de référence différent de celui lu maintenant) : le bandeau devient « Cette fonctionnalité a changé depuis votre brouillon. » avec « Garder mon brouillon » (le patch est calculé contre la **référence du brouillon**, envoyé avec le `baseSha` actuel ; les champs modifiés par vous l'emportent) et « Repartir de la version actuelle » (abandon avec la même confirmation). Les champs modifiés des deux côtés sont signalés comme en §5.8.

### 5.6 Retour à la liste avec la fonctionnalité à jour
Après l'étape 3 (§4.5) : fermeture du panneau ; `spec.listFeatures` et `spec.head` invalidés, la liste repart du début (curseur oublié, filtres conservés) ; l'adresse perd `new`/`edit`. Un bloc de confirmation visible au-dessus du tableau (`Alert` neutre, icône `check_circle`, **c'est la région d'état unique de l'écran** : un seul `role="status"`) : « F-004 « Titre » créée. » (ou « F-001 « Titre » enregistrée. » / « F-003 supprimée. »), avec « Voir la fiche » pour création et modification et « Fermer ». Équipe : + « Version de la spec abc1234 ». Le focus va sur le lien du titre de la ligne enregistrée ; si la ligne n'est pas à l'écran (filtres qui l'excluent, ou plus loin que la première page), le focus va au titre h1 et le bloc ajoute « Elle n'apparaît pas avec les filtres actuels. » (calculé sur le statut et la priorité enregistrés) ou « Utilisez « Afficher plus de fonctionnalités » pour la voir. ». Suppression : focus sur le h1. Aucun toast.

### 5.7 Suivi par la page, formulaire fermé
Un marqueur `koklo:feature-pending:<projectId>` (`localStorage`, `try/catch`) garde `{ batchId, kind, specId?, title, savedAt }` tant que le lot n'est pas terminal ; périmé après 24 h. Tant qu'il existe et que la page est ouverte, un bloc neutre (icône `schedule`, région d'état) « Enregistrement de « Titre » en cours… » remplace la confirmation, et le suivi (§4.4 et §4.5) se poursuit sans le panneau, avec la même borne de 60 s puis « Vérifier maintenant ». Un rechargement de page reprend le suivi depuis le marqueur par `specBatch.get` (jamais un nouvel `submit`). Terminé : confirmation §5.6 ou échec §4.7 dans un bloc d'alerte au-dessus du tableau avec « Rouvrir le brouillon ».

### 5.8 Conflit de version (« Recharger la version actuelle »)
Relit `spec.head` et `spec.getFeature` (modification) puis refait la comparaison à trois : référence ancienne, valeurs saisies, version actuelle. Les champs que **vous seul** avez modifiés gardent votre valeur ; les champs inchangés par vous prennent la version actuelle ; les champs modifiés **des deux côtés** gardent votre valeur et reçoivent sous le champ « Valeur actuelle dans la spec : … » (texte, extrait de 120 caractères maximum) avec « Reprendre la valeur actuelle ». Un `Alert` neutre en tête liste ces champs : « Ces champs ont aussi changé dans la spec : Titre, Priorité. Vérifiez-les avant d'enregistrer. » La référence et `baseSha` passent à la version actuelle. Après deux `stale_base` d'affilée sans changement de `commitSha` lu (l'index n'a pas encore rattrapé la spec) : « La spec est en cours de relecture. Réessayez dans un instant. » (voir Q3).

### 5.9 Autres règles
- Confirmations par la région d'état, pas de toast, pas de compte à rebours, aucune animation de progression.
- Vocabulaire : « fonctionnalité », « critère d'acceptation », « spec », « enregistrer », « version de la spec » (équipe). Jamais « lot », « commit », « branche », « SHA », « idempotence », « payload » dans une phrase.
- Les identifiants techniques (`F-001`, `AC-1`, `S-…`, `R-…`) en JetBrains Mono ; les libellés en Instrument Sans.

## 6. Responsive
- **≥ 768 px** : `Sheet` de 440 px ; champs en une colonne ; pied collant ; « Enregistrer » à gauche, « Fermer » à sa droite (**ordre visuel = ordre du DOM = ordre de tabulation**, v1.1 ; WCAG 2.4.3), « Supprimer cette fonctionnalité » (48e-2) après eux.
- **< 768 px** : panneau pleine largeur, marge 16 px ; cibles 44 px ; pied collant (dans le panneau, avec marge de zone sûre) à deux boutons pleine largeur empilés (« Enregistrer » au-dessus), « Supprimer cette fonctionnalité » pleine largeur sous les deux, dans le flux de la zone défilante ; dans l'éditeur de critères, le type d'étape et son texte sont empilés, les actions d'un critère passent sur une ligne de trois boutons de 44 px avec libellés texte (« Monter », « Descendre », « Retirer ») ; aucun défilement horizontal à 375 px ; indicateur d'avancement empilé ; résumé d'erreurs et alertes pleine largeur.
- Clavier virtuel : le champ actif reste visible (`scroll-margin` suffisant) ; le pied collant ne masque pas le champ.

## 7. Accessibilité
- Dialogue modal nommé par son h2, focus piégé, Échap ferme (brouillon gardé) et rend le focus au déclencheur (bouton « Nouvelle fonctionnalité » / « Modifier »), sauf succès où il va à la ligne enregistrée ou au h1 (§5.6).
- Chaque champ : `label` visible lié ; « (obligatoire) » écrit dans le libellé de Titre et de Priorité (pas seulement un astérisque) ; aides reliées par `aria-describedby` ; `aria-invalid` + message texte + icône `warning` ; résumé d'erreurs en `role="alert"` avec liens ancres ; focus sur le résumé à l'envoi invalide, sur le champ concerné après un clic de lien.
- Éditeur de critères : `fieldset` + `legend` par critère, identifiants lisibles « Critère 1, AC-1 » ; ajout → focus sur le titre du nouveau critère/étape et annonce (« Critère 2 ajouté. ») ; retrait → focus sur le « Retirer » du précédent ou sur « Ajouter un critère » ; monter/descendre → le focus reste sur le bouton, annonce « Critère 2 déplacé en position 1. » ; tous les boutons d'icône ont un `aria-label` complet ; ordre de tabulation = ordre visuel ; aucune interaction réservée à la souris ou au glisser-déposer.
- Statuts jamais par la couleur seule : étapes d'avancement (`radio_button_unchecked`, `play_circle`, `check_circle`, `warning`, `schedule`) + texte ; badge « Nouveau » icône `add` + texte ; erreurs `warning` + texte ; priorité/statut en mots. Le violet de marque ne sert ni à un statut ni à une erreur.
- Une seule région `role="status"` par écran : celle de S-features quand le panneau est fermé ; **tant que le panneau est ouvert, c'est une région visuellement masquée (`sr-only`) du panneau** (le reste de la page est `aria-hidden` sous un dialogue modal, v1.1) ; la région de la page perd alors son rôle et son contenu, qui reviennent à la fermeture. Elle porte : « Envoi de votre modification… », « En attente de son tour. », « Écriture en cours… », succès, brouillon gardé/abandonné ; les erreurs en `Alert` `role="alert"`, une seule à la fois dans le panneau.
- Contraste AA en clair et en sombre par les tokens (`foreground`, `muted-foreground`, `border`, `destructive`, `ring`) ; texte atténué jamais par opacité. Axe sans violation sur chaque état.
- Mouvement réduit : aucune animation nouvelle ; ouverture du `Sheet` et du `Collapsible` neutralisées sous `prefers-reduced-motion: reduce` ; squelette pulsant seulement sous `motion-safe:`.
- Pas d'autofocus piégeant ; pas de limite de temps sur la saisie ; aucune perte de saisie sur rafraîchissement (brouillon).

## 8. Alternatives écartées
1. **Page dédiée `/projects/[id]/features/new` et `/[specId]/edit`** : deux routes dynamiques de plus à garder (proxy, garde, R4), perte du contexte de liste. Le `Sheet` suit le modèle de la fiche et de S-projects.
2. **Édition en place dans la fiche** (champs qui deviennent éditables) : mélange lecture et écriture, focus et annonces plus fragiles, et la fiche sert aussi aux rôles en lecture seule. Un panneau distinct garde la fiche simple.
3. **Éditeur plus large (560 à 640 px)** pour les critères : sort du gabarit 380–440 px de DESIGN §5 ; l'empilement type/texte tient dans 440 px.
4. **Éditeur Markdown ou riche pour la description** : dépendance nouvelle, contenu actif, contraire à la lecture en texte brut décidée en 48d.
5. **Champs de saisie par pastilles (tags) pour les éléments liés** : composant à créer ; le multiligne « un identifiant par ligne » couvre le besoin sans dépendance (à revoir quand un sélecteur d'écrans existera).
6. **Dialogue de confirmation à la fermeture** (« Quitter sans enregistrer ? ») : bruyant, et inutile puisque la saisie est gardée automatiquement ; l'abandon est une action explicite.
7. **Dialogue empilé pour la suppression** (`AlertDialog`) : composant absent de `@koklo/ui`, focus plus complexe ; confirmation en ligne dans le panneau.
8. **Mise à jour optimiste de la liste** (afficher la ligne avant l'index) : la liste lit l'index, pas le commit ; afficher une ligne que l'index ne connaît pas mentirait (elle disparaîtrait au rafraîchissement). On attend l'index ou on le dit.
9. **Plusieurs opérations par envoi** (modifier plusieurs fonctionnalités d'un coup) : le contrat le permet (≤ 50) mais le besoin R2 est « une fonctionnalité écrite = un commit » ; hors lot.
10. **Désactiver visuellement les boutons d'écriture pour les rôles en lecture** : fait deviner un droit manquant et un emplacement vide ; absence totale, comme pour « Créer un projet » (S-projects §3.1).
11. **Annuler un enregistrement en cours** : impossible au contrat ; ne pas faire croire le contraire.

## 9. Questions ouvertes
Aucune ne bloque le développement ; l'option la plus conforme à `DESIGN.md` et au contrat est retenue.
- **Q1 - Titre rogné** : le contrat accepte un titre d'espaces (`min(1)`) ; le formulaire le refuse et envoie la valeur sans espaces autour. Plus strict que le contrat mais jamais plus permissif. À confirmer (alternative : envoyer tel quel et laisser `checkSpec` trancher).
- **Q2 - Branche d'écriture** : `spec.head.branch` est la branche de travail lue ; l'écriture sans `branch` vise `cadrage`. Si elles diffèrent (dépôt relié avec une autre branche), on envoie `spec.head.branch` ; si c'est la branche par défaut, le serveur refuse (`VALIDATION`). Le contrat ne dit pas comment l'écran sait quelle branche est inscriptible. Message prévu : « Koklo ne peut pas enregistrer sur cette version de la spec. »
- **Q3 - Index en retard** : `baseSha` vient de l'index (`spec.head`). Si le dépôt a reçu un push que l'index n'a pas encore lu, `stale_base` se répète tant que l'index n'a pas rattrapé et il n'existe pas de procédure pour forcer la relecture. Traité par le message de §5.8. Un `baseSha` par fichier (conflit plus fin) ou une relecture à la demande demanderait un changement de contrat : **non demandé ici**.
- **Q4 - Attente de l'index après l'écriture** : elle suppose que le webhook de push reconstruit l'index. Sans webhook configuré (staging), l'étape 3 finit toujours en « pas encore à jour » (§4.6). À vérifier en conditions réelles (NEEDS-HUMAN).
- **Q5 - Messages des diagnostics `SPEC_INVALID`** : `issues[].message` vient du validateur de spec (technique, possiblement anglais) ; il est affiché tel quel à l'équipe qui écrit. Un habillage en français par code (`rule`/`code`) reste à décider. Le format exact de `pointer` n'est pas spécifié par le contrat : le lien vers un champ est un effort raisonnable, repli = la liste.
- **Q6 - Libellés d'étapes et de priorités** : repris de S-features (à valider avec le propriétaire du produit).
- **Q7 - Rôle designer** : la règle « liée à un écran » vient de la doc de l'API et non du contrat ; si le contrôle préalable du client diverge, le serveur l'emporte (§5.4).
- **Q8 - Suppression** : planifiée dans cette fiche (analyse D8) ; si la PR dépasse 400 lignes, la scinder en 48e-1 (création/modification) et 48e-2 (suppression).
- **Q9 - Brouillon sur appareil partagé** : le brouillon contient du contenu de spec dans `localStorage`. Effacé à la déconnexion et après 7 jours ; un avis humain est utile si des postes partagés sont prévus.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-31 | TK-48 (48e) | Création : formulaire d'écriture d'une fonctionnalité (création, modification, suppression) par `specBatch.submit`, suivi du lot par `specBatch.get`, états d'envoi, d'attente, de succès (attente de l'index), conflits et erreurs fournisseur, brouillon automatique et abandon, règle du designer, retour à la liste. Détail : `.workflow/TK-48/02-design-48e.md` |
| 1.1 | 2026-11-01 | TK-48 (48e-1, refactor) | États réellement livrés (création et modification, **sans suppression**, reportée en 48e-2 : ni bouton « Supprimer », ni §4.8, ni capture `delete-confirm`) conformes à la fiche en clair, sombre et 375 px. Quatre arbitrages : (a) la région d'état unique passe dans le panneau tant qu'il est ouvert (la page est `aria-hidden` sous un dialogue modal) ; (b) la liste « pas encore à jour » est relue toutes les 5 s pendant 2 minutes par la page, y compris panneau fermé (§4.6) ; (c) pied : « Enregistrer » à gauche puis « Fermer », ordre visuel = DOM = tabulation (§6, §7) ; (d) `deriveFeaturesView` n'attend plus le rôle pour afficher une spec lue, sans effet de sécurité (voir `docs/architecture.md`). |

## 11. Plan d'implémentation web et tests (brief développeur, 48e)
Aucun changement de contrat (0.7.0), aucune dépendance. Un composant `Textarea` à ajouter à `@koklo/ui` (équivalent shadcn, mêmes tokens que `Input`, `aria-invalid` stylé) : seule addition de la bibliothèque ; aucune icône nouvelle (`add`, `edit_note`, `keyboard_arrow_up`, `keyboard_arrow_down`, `warning`, `schedule`, `check_circle`, `play_circle`, `radio_button_unchecked`, `link` existent). Fichiers sous `apps/web/src`, chacun <= 300 lignes.

Données et logique pures (testables sans DOM)
- `lib/roles.ts` : `canWriteSpec` (= owner, admin, dev, designer).
- `lib/feature-form.ts` : types `FeatureFormValues`, conversion `detail -> values`, normalisation (CRLF vers LF, lignes vides, espaces), `diffValues(baseline, values)`, validation (`validateFeatureForm` : une entrée du tableau §3.1 par règle, motifs copiés du contrat ou importés de ses schémas), contrôle designer (§5.4).
- `lib/feature-operation.ts` : construction de l'opération `feature.create|update|delete` (§5.2) et de l'entrée `specBatch.submit` ; ne contient que des champs du contrat ; test : l'objet passe `specBatchSubmitInputSchema.parse`.
- `lib/feature-draft.ts` : lecture/écriture/expiration/effacement du brouillon et du marqueur de suivi, `try/catch` partout ; `lib/feature-rebase.ts` : comparaison à trois (§5.8).
- `lib/feature-errors.ts` : table (source, code, `reason`/`errorCode`) -> {titre, texte, actions, clé nouvelle ou même} (§4.7), valeur inconnue -> générique ; `lib/spec-issues.ts` : diagnostics -> champs (best effort).
- `lib/use-feature-submit.ts` : `useMutation` sur `specBatch.submit`, génération/réutilisation de la clé, suivi par `specBatch.get` (backoff 1,5 s x 1,5 plafonné à 5 s, borne 60 s, suspendu onglet masqué), puis attente de `spec.head.commitSha` (2 s, borne 30 s) ; `lib/use-feature-draft.ts` ; `lib/use-pending-save.ts` (marqueur, reprise au rechargement, `get` seulement).

Composants
- `components/feature-form-sheet.tsx` (coque, états, pied), `feature-form-fields.tsx`, `feature-criteria-editor.tsx` (+ `criterion-item.tsx`), `feature-links-fields.tsx`, `feature-form-errors.tsx` (résumé et alerte de §4.7), `save-progress.tsx` (indicateur §4.4), `feature-delete-confirm.tsx`, `draft-banner.tsx`, `saved-notice.tsx` (confirmation et suivi de la page, §5.6 et §5.7). Réutiliser `Sheet`, `Select`, `Input`, `Collapsible`, `Alert`, `Button`, `Badge`, `Icon`, `Skeleton`, `ErrorNotice`, `LoadingStatus`, `Field`. Modifier `features-page.tsx` (boutons d'entrée, `?new`/`?edit`, bloc de confirmation), `feature-sheet.tsx` (bouton « Modifier »), `features-empty.tsx` (bouton dans 4.3), `lib/features-url.ts` (`new`, `edit`).
- Refactor actif sur chaque fichier touché (duplication, fonctions <= 50 lignes).

Tests attendus (Red), AC-48-24 à AC-48-28
- Unitaires : `feature-form` (une validation par ligne du tableau §3.1, y compris limites 200 et motifs), `feature-operation` (patch minimal : seul le titre modifié -> `{ kind, specId, title }` ; critères changés -> liste entière ; statut brouillon non envoyé à la création ; `baseSha` omis à la création, présent en modification/suppression ; `message` jamais envoyé ; sortie conforme au schéma du contrat), `feature-errors` (un texte par code et par `reason`, inconnu -> générique, aucune valeur brute), `feature-draft` (expiration, clé corrompue, stockage indisponible), `feature-rebase`.
- Intégration `feature-form.test.tsx` : visibilité par rôle (owner/admin/dev/designer voient les boutons ; client/business **aucun** bouton, `?new=1` ignoré, aucun appel d'écriture) ; absence des boutons en building/failed/sans dépôt ; création nominale (une seule fois `specBatch.submit`, puis `get`, puis `spec.head`, liste invalidée, focus sur la ligne, annonce) ; modification sans changement -> bouton désactivé ; double clic -> un appel ; **clé d'idempotence stable** à la reprise après erreur réseau, **nouvelle** clé après échec terminal ou saisie modifiée (AC-48-24) ; attente : `queued` -> `committing` -> `committed` avec temps simulés, dépassement 60 s -> « prend plus de temps » sans erreur, « Vérifier maintenant » (AC-48-25) ; index en retard > 30 s -> « Pas encore à jour » ; `SPEC_INVALID` -> diagnostics, liens vers les champs, saisie conservée, `truncated` ; `SPEC_BATCH_CONFLICT` `stale_base` -> « Recharger » conserve la saisie et signale les champs modifiés des deux côtés ; `write_conflict`, `idempotency_key_reused` ; 503, 429, `PROVIDER_AUTH_EXPIRED` (lien `/github` owner/admin seulement), `INTERNAL` ; lot `failed`/`FORBIDDEN` ; `NOT_FOUND` (AC-48-26) ; designer : refus préalable sans écran, refus serveur affiché (AC-48-27) ; suppression : confirmation, focus sur « Garder », opération `feature.delete` seule ; brouillon : sauvegarde, reprise, abandon avec confirmation, fonctionnalité changée depuis le brouillon, `localStorage` indisponible ; suivi page fermée et rechargement (`get` sans nouvel `submit`) ; aucun terme git dans le DOM de la vue client (AC-48-28, le formulaire n'est pas rendu).
- Accessibilité : labels, `aria-invalid`, résumé d'erreurs avec focus, `fieldset`/`legend` des critères, annonces d'ajout/retrait/déplacement, une seule région `status`, focus du `Sheet`, mobile 375 px sans défilement horizontal, aucune couleur/icône en dur (`design-conformity.test.ts`), mouvement réduit.
- e2e Playwright `apps/web/e2e/feature-form.spec.ts` (faux fournisseur de la pile locale, jamais github.com) : création, modification, suppression, retour à la liste à jour, brouillon repris après rechargement, conflit `stale_base`, `SPEC_INVALID`, rôles (dev, designer, client), clair/sombre, 375 px, axe (`wcag2a`, `wcag2aa`, `wcag21aa`) par état.
- Preuve navigateur (Chrome, pile locale + faux fournisseur, base seedée) : création -> ligne dans la liste, modification, état d'attente, erreur, clair/sombre, mobile. Staging réel : écriture sur un dépôt jetable `koklo-sandbox-*`, NEEDS-HUMAN (Q4).

## 12. Captures (48e-1, générées par `apps/web/e2e/feature-form.spec.ts`, clair et sombre)
Dossier `design/screens/captures/S-feature-form/` (32 images) : `create-empty`, `create-filled`, `create-invalid`, `edit-prefilled`, `edit-loading`, `sending`, `queued`, `slow`, `saved-index-pending`, `error-spec-invalid`, `error-conflict`, `error-provider`, `error-forbidden-designer`, `draft-resumed`, `list-after-save`, chacun en `-light.png` et `-dark.png` ; `create-filled-light-mobile.png` et `error-spec-invalid-light-mobile.png` (375 px). `delete-confirm` est reporté à 48e-2 avec la suppression. Les captures des autres écrans régénérées par la même passe ne sont pas versionnées lorsqu'elles ne diffèrent que par du bruit de rendu.

Les e2e vérifient aussi : axe (`wcag2a`, `wcag2aa`, `wcag21aa`) sur chaque état, `slow` et `saved-index-pending` en horloge simulée (`page.clock`), mouvement réduit, clavier (Tab, Échap, retour du focus), une seule région d'état présente dans l'arbre d'accessibilité sous le panneau modal, aucun défilement horizontal à 375 px.
