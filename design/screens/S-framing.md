---
id: S-framing
titre: Cadrage assisté par IA (idée, brief, propositions de fonctionnalités)
version: 1
---
## 1. Utilisateurs et objectif
- **Vue équipe qui écrit** : propriétaire, administrateur, développeur, designer (`canWriteSpec` = `SPEC_BATCH_ROLES` des appels `ai.*`). Elle transforme une idée en brief structuré, puis en propositions de fonctionnalités à relire, éditer, accepter ou rejeter, et enregistre les acceptées dans la spec en une seule fois.
- **Sans droit d'écriture** : client, business (et tout rôle inconnu) ne voient **aucun** bouton « Cadrer avec l'IA ». Une adresse directe affiche une page sobre (4.12), sans formulaire, sans bouton grisé, et n'émet **aucun** appel `ai.*` ni `specBatch.submit`. Le cadrage « côté client » (suggestions, validation) relève d'autres tickets (TK-55, TK-60).
- **Designer** : voit l'écran et peut relire, éditer, accepter et rejeter, mais ne peut pas enregistrer des propositions qui n'ont pas d'écran lié (S-feature-form §5.4). Message clair et permanent (4.11). **Arbitrage produit à confirmer** (§9, Q5).
- Objectif : gagner du temps sur la rédaction d'une spec **sans jamais rien créer sans clic humain**. Règle d'or (vision §6.3) : toutes les sorties de l'IA sont des **propositions non enregistrées**. Le seul appel d'écriture est `specBatch.submit`, déclenché par « Confirmer » après un récapitulatif.
- Écran **par projet**, une **route dédiée** `/projects/[projectId]/framing` (pas un `Sheet` : un brief de plusieurs milliers de caractères et jusqu'à 20 propositions avec critères ne tiennent pas dans un panneau de 440 px, et le parcours dure plusieurs minutes).

## 2. Tâches et parcours
- Principale : idée -> brief éditable -> propositions (À relire / Acceptée / Rejetée, éditables) -> récapitulatif de confirmation -> **un seul** `specBatch.submit` -> « N fonctionnalités créées ».
- Secondaires : partir d'un brief déjà rédigé (sans appel `draftBrief`) ; ajouter des précisions ; répondre aux questions ouvertes du brief et régénérer ; annuler l'attente d'un appel ; reprendre ou abandonner un brouillon local.
- Entrée : `/projects/[projectId]/framing`.
  - **Liste des fonctionnalités** (S-features v1.5) : bouton « Cadrer avec l'IA » (icône `smart_toy`) dans l'en-tête et dans l'état vide, pour les rôles de la vue équipe qui écrit **et** quand la spec est lue (`ready`).
  - **Adresse directe** : la page s'ouvre quel que soit l'état de la spec (4.10).
  - Pas de nouvelle entrée de barre latérale : le cadrage est une dépendance du projet (même raisonnement que S-features §8, alternative 1).
- Sorties : `UNAUTHORIZED` vers `/login` (brouillon local gardé) ; session sans organisation active vers `/organizations` ; fil d'Ariane vers « Projets » et vers le projet ; « Voir la liste » après un enregistrement vers `/projects/[projectId]/features`.
- Hors lot : persistance du brief (jamais écrit en base ni dans le dépôt), page de réglages de la clé IA (ticket séparé), suggestions de critères pour une fonctionnalité existante (lot 59c, **reporté**, §9 Q1), découpage en tickets.
- Découpage de livraison : **59a** socle + étapes 1 et 2 (idée, brief) ; **59b** propositions + soumission ; **59c** reporté.

## 3. Contenu
Sources du contrat `@koklo/contract` 0.9.0 (aucun changement) : `ai.draftBrief`, `ai.proposeFeatures`, `specBatch.submit` / `specBatch.get` (via l'enregistrement existant de 48e), `spec.head`, `project.list`, `repo.list` (équipe, pour qualifier l'absence de spec).

### 3.1 Gabarit de page
- Colonne **unique**, largeur de lecture 720 px maximum, centrée dans la zone de contenu (marge 32 px ; 16 px sous 768 px).
- Fil d'Ariane « Koklo > Projets > `<nom>` > Cadrage » (« Projets » et le nom du projet sont des liens ; le dernier maillon porte `aria-current="page"`).
- h1 « Cadrage » (30 px/600, -0,025 em) ; sous-titre en texte secondaire 13 px : le nom du projet ; pendant son chargement : « Projet ». Phrase d'aide 13 px : « L'IA propose, vous décidez. Rien n'est enregistré dans la spec avant votre confirmation. »
- Trois sections, chacune avec son h2 (22 px/600, -0,015 em) : « 1. Votre idée », « 2. Le brief », « 3. Les propositions ». Les sections 2 et 3 apparaissent quand elles ont du contenu ; la section 1 reste en place et repliable (résumé « Idée de N caractères » + « Modifier ») une fois le brief produit.
- Une **région d'état unique** `role="status"` `aria-live="polite"` en haut de page porte l'avancement et les confirmations ; une seule `Alert` d'échec (`role="alert"`) à la fois, placée sous le titre de l'étape concernée.

### 3.2 Bloc permanent « Ce qui est envoyé à Anthropic »
`Alert` (variante neutre, jamais la couleur de marque ni de statut), icône `lock` 16, **toujours rendue** au-dessus du bouton d'appel de chaque étape (idée, brief) et rappelée sous la barre d'enregistrement : ce n'est ni une infobulle ni un panneau replié. **Affichage seul** : aucun consentement mémorisé, aucune case à cocher, aucun blocage (arbitrage produit, §9 Q3). Le bloc est dans le DOM **avant** toute requête.

Titre (h3, 14 px/600) : « Ce qui est envoyé à Anthropic ». Texte (13 px, libellé final à valider par le produit pour le RGPD) :
- « Le texte saisi sur cet écran (idée, précisions, brief) et les titres, statuts et priorités des fonctionnalités déjà présentes dans le projet sont envoyés à Anthropic (États-Unis), avec la clé de votre organisation. »
- « Ne saisissez pas de données personnelles. »
- « Jamais envoyés : clés, identifiants de personnes, noms de l'organisation, du projet ou des dépôts. »
- « Rien n'est enregistré dans votre projet avant votre confirmation. »
- Une ligne secondaire : « Les appels sont comptés pour votre organisation. »

Le bouton d'appel nomme le destinataire : « Générer un brief avec l'IA », « Proposer des fonctionnalités avec l'IA ».

### 3.3 Étape 1 : « Votre idée »
- Deux chemins, présentés comme deux choix clairs (`Tabs` : « Partir d'une idée » (par défaut) / « J'ai déjà un brief »). Le second saute l'étape de génération : un `Textarea` « Votre brief » (1 à 20 000 caractères) alimente directement l'étape 2.
- « Partir d'une idée » : `Textarea` « Votre idée » (6 lignes, 1 à 8 000 caractères), texte d'aide « Décrivez le besoin en quelques phrases : qui, quel problème, ce que vous attendez. » Compteur « n / 8 000 » relié par `aria-describedby`, **annoncé dans la région d'état à partir de 7 500 caractères**, jamais à chaque frappe.
- `Collapsible` « Ajouter des précisions (facultatif) » : `Textarea` « Précisions », **une précision par ligne** (0 à 10 lignes, 1 à 1 000 caractères chacune) ; erreurs au-delà des bornes, liées au champ.
- Bouton principal « Générer un brief avec l'IA » (icône `smart_toy`), désactivé à idée vide (le message d'aide dit pourquoi : « Écrivez votre idée pour continuer. »).
- `maxFeatures` **n'est pas exposé** (valeur par défaut de l'API, 8 ; §9 Q10).

### 3.4 Étape 2 : « Le brief » (éditable)
- Le brief structuré s'affiche dans des champs **éditables** (`Input` / `Textarea` avec `label` visible) : « Titre », « Problème », « Utilisateurs », « Résultat attendu », « Contraintes », « Questions ouvertes » (une par ligne). L'humain peut tout corriger ; les champs sont concaténés en un texte unique (1 à 20 000 caractères) envoyé à `ai.proposeFeatures`.
- Badge « Proposé par l'IA » (icône `smart_toy` + texte) au-dessus du brief généré, retiré dès la première modification du champ concerné.
- Questions ouvertes : texte d'aide « Répondre à ces questions améliore le brief. » + bouton secondaire « Répondre aux questions » qui ouvre, sous chaque question, un champ de réponse ; « Régénérer le brief » relance `ai.draftBrief` avec ces réponses dans `answers` (jamais automatique). Facultatif.
- Bouton principal « Proposer des fonctionnalités avec l'IA », précédé du bloc 3.2. Bouton secondaire « Revenir à l'idée ».
- Ligne technique repliée (équipe seulement) : « Modèle : `<meta.model>` · `<entrée>` / `<sortie>` jetons » (JetBrains Mono 12 px). Jamais de coût monétaire.

### 3.5 Étape 3 : « Les propositions »
Liste ordonnée `ol` de cartes (`Card`, un `li` par proposition). Une phrase au-dessus : « Relisez chaque proposition. Rien n'est accepté par défaut. »

**Texte brut absolu** (relecture de sécurité du ticket 54, non bloquant n°1) : titres, descriptions, étapes, brief et questions ouvertes sont rendus comme de simples **nœuds texte**, descriptions avec retours à la ligne conservés (`white-space: pre-wrap`). Jamais de rendu Markdown ni HTML, jamais de lien, d'image ni de `dangerouslySetInnerHTML` construit à partir d'une sortie du modèle ou d'une valeur éditée. Une valeur comme `[x][1]`, `javascript:`, `//evil.com`, `www.`, `**gras**` ou `<script>` s'affiche **telle quelle**, inerte. Le seul lien d'une carte (doublon) est construit par l'application à partir d'un identifiant `F-nnn` validé.

Contenu d'une carte :
- En-tête : titre (h3, 16 px/600) et **statut de la carte** en `Badge variant="outline"` (icône + texte, jamais la couleur seule, jamais les couleurs `status-*` de DESIGN §2.2 ni le violet de marque) :

| Statut | Libellé | Icône |
|---|---|---|
| À relire (initial) | À relire | `schedule` |
| Acceptée | Acceptée | `check_circle` (pleine) |
| Rejetée | Rejetée | `cancel` |

- Ligne méta : priorité en mots (Indispensable, Importante, Souhaitable, Reportée, mêmes libellés que S-features §3.3) ; badge « Proposé par l'IA ».
- Description repliée à 3 lignes avec « Afficher la suite » / « Réduire » (vrai `button`, `aria-expanded`).
- Critères d'acceptation dans un `Accordion` fermé : « N critère(s) d'acceptation » ; chaque critère en `ol`, ses étapes en `ul` sans puce, mot d'ouverture en gras (« Étant donné », « Quand », « Alors », « Et ») comme dans la fiche de S-features.
- **Doublon** : si l'API signale un titre déjà présent, ligne « Titre déjà présent : F-003 » avec icône `warning` + texte et lien « Voir F-003 » vers `/projects/[projectId]/features?feature=F-003`. Non bloquant : l'humain décide.
- Actions (vrais `button`, 44 px sous 768 px) : « Accepter » (principal), « Rejeter » (`variant="outline"`), « Modifier » (`variant="ghost"`). Sur une carte rejetée, « Rejeter » devient « Reprendre » (retour à « À relire »). Une carte rejetée garde un contenu lisible ; son statut texte suffit à la distinguer.
- **Édition sur place** (« Modifier ») : la carte se déploie en champs : « Titre » (obligatoire, 200 caractères maximum), « Priorité » (`Select`), « Description », critères (éditeur de critères commun avec le formulaire de S-feature-form §3.3 : ajouter, supprimer, réordonner, étapes Étant donné / Quand / Alors / Et). Boutons « Terminer la modification » et « Annuler les modifications » (retour aux valeurs reçues). Seuls ces champs sont éditables ; texte d'aide : « Les liens (écrans, rôles, règles) s'ajoutent ensuite depuis le formulaire de la fonctionnalité. »
- **Validation** : mêmes règles que le formulaire (titre non vide après rognage, 200 caractères maximum, chaque critère avec titre et au moins une étape non vide). Une proposition invalide ne peut pas être acceptée : message lié au champ (`aria-describedby`) ; « Accepter » reste actif mais renvoie le focus au premier champ en erreur avec un résumé.

**Barre d'enregistrement** (collante en bas sur mobile, en bas de la liste sur grand écran) :
- Compteur dans la région d'état : « N acceptée(s) sur M » (+ « K rejetée(s) » si K > 0).
- Bouton principal « Enregistrer N fonctionnalité(s) » (icône `add`), **actif seulement si N >= 1** acceptée valide. À 0 acceptée : texte « Acceptez au moins une proposition pour continuer. »
- Bloc 3.2 rappelé en une ligne : « Ces propositions viennent d'Anthropic et ne sont pas encore enregistrées. »
- Lien secondaire « Proposer d'autres fonctionnalités » : relance `ai.proposeFeatures` après confirmation en ligne si des propositions existent (« Les propositions actuelles seront remplacées. [Remplacer] [Garder] », focus sur « Garder »).

### 3.6 Récapitulatif de confirmation (en ligne, pas de modale)
Un clic sur « Enregistrer N fonctionnalité(s) » remplace la barre par un panneau `Card` en ligne, `role="group"` nommé « Confirmer l'enregistrement » :
- Texte : « Vous allez créer N fonctionnalité(s) dans le projet `<nom>` : »
- Liste en **texte brut** des titres acceptés (avec priorité et nombre de critères), dans l'ordre affiché.
- Rappel : « Les propositions rejetées ou à relire ne sont pas enregistrées. »
- Boutons « Confirmer » (principal) et « Revenir ». **Focus initial sur « Revenir »**. Échap = « Revenir ».
- « Confirmer » envoie **un seul** `specBatch.submit` avec exactement les opérations acceptées (éditions comprises), jamais les rejetées ni les à relire. Double clic impossible (drapeau d'envoi immédiat) ; réutilise l'enregistrement et le suivi de 48e (clé d'idempotence, suivi du lot, reprise au rechargement).

### 3.7 Suivi et succès
Mêmes états de suivi que S-feature-form §4.4 à §4.7 (« Enregistrement en cours… », attente de version, échecs de lot, conflit), réutilisés tels quels dans la région d'état de la page. Spécificités :
- **Succès** : région d'état « N fonctionnalité(s) créée(s). » ; lien « Voir la liste » (`/projects/[projectId]/features`) ; focus sur le h1. Les propositions **acceptées** sont retirées de l'écran ; les **rejetées sont jetées** (arbitrage par défaut, §9 Q6) ; les « À relire » restantes sont conservées. Le brouillon local est mis à jour.
- **Échec d'un lot** (« tout ou rien ») : le récapitulatif se referme, toutes les saisies sont gardées ; si le serveur désigne une opération fautive, message « La fonctionnalité n°3 n'est pas valide : `<motif>` » et focus sur la carte concernée.

## 4. États
Une seule situation principale par zone. Priorité d'évaluation : session / organisation, rôle, projet introuvable, puis état de la page.

### 4.1 Chargement de la page
`role="status"` `aria-busy="true"` « Chargement du cadrage… » ; squelettes du titre et d'un champ (animation `motion-safe:` seulement). Aucune requête `ai.*` pendant le chargement.

### 4.2 Étape 1 vide (page prête)
Étape « Votre idée » avec champ vide, bloc 3.2 visible, bouton « Générer un brief avec l'IA » avec l'aide « Écrivez votre idée pour continuer. ». Aucun h2 « 2 » ni « 3 » tant qu'il n'y a ni brief ni proposition.

### 4.3 Appel en cours (brief ou propositions)
- Bouton d'appel désactivé, libellé « Génération en cours… », `aria-busy` sur la section. Région d'état : « Génération en cours. Cela peut prendre une minute. Vous pouvez continuer à lire. »
- Bouton « Annuler l'attente » : abandonne l'attente côté écran ; texte honnête « La demande a déjà été comptée. » (le serveur ne propage pas l'annulation). La saisie est conservée.
- **Un seul appel IA à la fois** par page : les autres boutons d'appel sont masqués ou désactivés pendant l'attente, avec la raison dans la région d'état. Le focus reste sur le bouton d'annulation.
- Fin de l'appel : le focus passe au h2 de l'étape suivante (`tabindex="-1"`) et la région d'état annonce « Brief prêt, relisez-le. » / « N proposition(s) à relire. » une seule fois.

### 4.4 Propositions vides ou toutes en doublon
- Aucune proposition renvoyée : `Card` « L'IA n'a proposé aucune fonctionnalité nouvelle. » + conseil « Précisez le brief et réessayez. » + « Revenir au brief ».
- Toutes en doublon : `Alert` (icône `warning`) « Toutes ces propositions ressemblent à des fonctionnalités existantes. » ; la liste reste affichée.

### 4.5 IA non configurée (`LLM_NOT_CONFIGURED`, 409)
`Alert` titre « L'IA n'est pas encore configurée pour votre organisation. », icône `lock` ; le détail selon la raison :
- `missing` : « Aucune clé n'a été enregistrée. »
- `invalidated` : « La clé enregistrée a été refusée par le fournisseur et a été désactivée. »
- `undecryptable` : « La clé enregistrée est illisible : il faut la saisir à nouveau. »

Action pour **tous les rôles** : « **Demandez à un administrateur de l'organisation d'ajouter la clé.** » (texte, jamais un lien mort : la page de réglages n'existe pas encore ; un lien « Ouvrir les réglages de l'IA » pour propriétaire / administrateur viendra avec ce ticket, §9 Q8). Saisie et brouillon conservés.
- Clé refusée en cours d'usage (`LLM_PROVIDER_ERROR` `auth`) : même alerte, texte « Le fournisseur a refusé la clé de l'organisation. Elle est désactivée jusqu'à ce qu'un administrateur la remplace. »

### 4.6 Limite atteinte (`LLM_RATE_LIMITED`, 429) avec compte à rebours
`Alert` (icône `schedule`) « Trop de demandes pour le moment. Réessayez dans `<N>` s. » ; le bouton d'appel est désactivé jusqu'à l'échéance puis réactivé. Compte à rebours **annoncé par palier** (`aria-live="polite"` toutes les 15 secondes, et à l'échéance « Vous pouvez réessayer. »), jamais chaque seconde ; le chiffre visible se met à jour chaque seconde mais n'est pas dans la région annoncée. Sous `prefers-reduced-motion`, aucun mouvement (le texte seul change). Au-delà de 60 s, affichage « environ N min ». Saisie conservée. Quota du fournisseur (`LLM_PROVIDER_ERROR` `quota`) : « Le crédit du compte du fournisseur est épuisé : à vérifier par un administrateur. »

### 4.7 Erreurs du fournisseur (`LLM_PROVIDER_ERROR`, 502)
`Alert` (icône `warning`), jamais le message brut du fournisseur. Textes par raison :
- `timeout` : « Le fournisseur n'a pas répondu à temps. Réessayez. »
- `unavailable` : « Le service d'IA est momentanément indisponible. »
- `context_too_long` : « Le texte est trop long pour le modèle : raccourcissez-le. »
- `refused` : « Le modèle a refusé de traiter ce texte. Reformulez. »
- `model_not_found` : « Le modèle configuré n'existe pas : à corriger par un administrateur. »
- `budget` : « Cette demande dépasserait le plafond de coût autorisé. Raccourcissez le texte. »
- `aborted` : « La demande a été annulée. »

Bouton « Réessayer » partout où c'est sûr, avec la mention « Chaque essai est compté dans les limites de votre organisation. » Chiffrement indisponible (503) : « Le coffre des clés n'est pas disponible. Réessayez plus tard. » Réseau ou erreur interne : alerte générique de l'écran des fonctionnalités + « Réessayer ».

### 4.8 Sortie invalide (`LLM_OUTPUT_INVALID`, 502)
`Alert` : « Le modèle a renvoyé une réponse inutilisable (par exemple un lien ou du code). Rien n'a été enregistré. Réessayez ou reformulez. » + « Réessayer ». Aucun contenu de la sortie rejetée n'est affiché.

### 4.9 Collision de délimiteur (`PROMPT_REJECTED`, 422) : sans écho
`Alert` : « Votre texte contient une séquence réservée qui empêche l'envoi. Modifiez-le (par exemple retirez les blocs de code ou les lignes de balises) puis réessayez. » **Aucune citation du texte fautif, aucune position** ; focus déplacé dans le champ concerné (idée ou brief). Si la séquence vient d'une fonctionnalité existante du projet (non modifiable ici) : « Une fonctionnalité existante du projet contient une séquence réservée ; contactez un administrateur. » sans détail.

### 4.10 Spec non prête (page ouverte, enregistrement bloqué)
La page **reste utilisable** (étapes 1 à 3, édition, brouillon) quand `spec.head` n'est pas `ready` (en préparation, absente, en échec) : seul l'enregistrement est bloqué. `Alert` neutre (icône `schedule`) sous le titre : « La spec du projet n'est pas prête : vous pouvez cadrer, mais l'enregistrement sera possible quand elle le sera. » (variantes : « Le projet n'a pas encore de spec. » avec lien « Voir les fonctionnalités » pour y créer le dépôt ; « La préparation de la spec a échoué. »). Le bouton « Enregistrer N fonctionnalité(s) » est remplacé par ce message (pas de bouton grisé muet) ; les propositions acceptées restent en brouillon. Un rafraîchissement d'état (comme S-features §4.5) lève le blocage sans perte.

### 4.11 Designer : enregistrement impossible sans écran lié
Même emplacement que le message de 4.10, permanent : « En tant que designer, vous ne pouvez enregistrer qu'une fonctionnalité liée à un écran. Les propositions n'en ont pas : relisez-les ici, puis créez-les depuis le formulaire de la fonctionnalité. » (lien « Ouvrir les fonctionnalités »). Pas de bouton d'enregistrement. Le brouillon garde les propositions acceptées. **Arbitrage produit à signaler** (§9 Q5).

### 4.12 Rôle sans droit (client, business) et projet introuvable
- Rôle sans droit : `Card` sobre, icône `lock` (28), titre « Le cadrage assisté n'est pas disponible pour votre rôle. », lien « Voir les fonctionnalités du projet ». Aucun formulaire, aucun appel `ai.*`.
- `NOT_FOUND` : état « Projet introuvable » de S-features §4.10 (même texte, sans révéler l'existence).
- 401 : redirection vers `/login` sans rien afficher d'intermédiaire ; 403 en cours de session : état « droits insuffisants » ci-dessus.

### 4.13 Brouillon repris
Bandeau en haut de page (`DraftBanner` généralisé) : « Brouillon de cadrage repris (`<date>`). » + « Abandonner » (confirmation en ligne « Abandonner ce brouillon ? [Abandonner] [Garder] », focus sur « Garder »). Le brouillon contient : idée, précisions, brief édité, propositions avec leur statut et leurs éditions.

## 5. Interactions et retours
1. **Aucun enchaînement automatique** : un clic = au plus un appel IA. Générer un brief ne lance pas la proposition de fonctionnalités.
2. **Aucune création sans clic humain** : acceptations manuelles (aucune par défaut), récapitulatif obligatoire, « Confirmer » unique.
3. **Brouillon local** `koklo:framing-draft:<projectId>` en `localStorage`, cloisonné par utilisateur **et** organisation, schéma validé à la lecture (une valeur malformée, d'un autre compte ou d'une autre organisation est supprimée), expiration 7 jours (§9 Q7). **Purgé à la déconnexion** et à la fin de session (même mécanisme que les brouillons de 48e, préfixe ajouté). Stockage indisponible : l'écran fonctionne sans brouillon. Aucune clé ni jeton n'y figure. Les propositions rejetées ne sont pas gardées après un enregistrement réussi.
4. **Texte brut** : voir 3.5. Les valeurs relues du brouillon sont traitées comme non fiables et rendues de la même façon.
5. Pas de toast : confirmations dans la région d'état. Pas de modale : récapitulatif et confirmations d'abandon en ligne.
6. Vocabulaire : « fonctionnalité », « spec », « brief », « proposition », « enregistrer ». Jamais « commit », « branche », « lot », « prompt », « token » dans une phrase d'état ; « jetons » seulement dans la ligne technique repliée. Pas d'anthropomorphisme, pas d'emoji, pas de mascotte (PRODUCT.md, anti-références).

## 6. Responsive
- **>= 1024 px** : colonne unique de 720 px centrée, barre d'enregistrement en bas de la liste.
- **768 à 1023 px** : même gabarit, marges 32 px.
- **< 768 px (375 px testé)** : marge 16 px, aucun défilement horizontal ; boutons d'action pleine largeur, 44 px de haut ; sur chaque carte « Accepter » et « Rejeter » côte à côte, « Modifier » en dessous ; `Tabs` d'entrée en pleine largeur ; barre d'enregistrement **collante en bas** (fond `--background`, bordure haute `--border`, respect de la zone sûre) avec un `padding-bottom` de la liste pour ne rien masquer ; le récapitulatif de confirmation s'affiche dans le flux, au-dessus de la barre.
- Titres et textes longs passent à la ligne (jamais tronqués sans `title`).

## 7. Accessibilité
- Repères : `main`, h1 unique « Cadrage », h2 par étape, h3 par proposition, fil d'Ariane en `nav` nommée.
- Tous les champs ont un `label` visible, une aide et un compteur reliés par `aria-describedby` ; erreurs : résumé avec lien vers le champ, focus déplacé, `aria-invalid`.
- **Clavier** : tout est atteignable à la tabulation dans l'ordre visuel (fil d'Ariane, onglets d'entrée, champs, bouton d'appel, cartes : « Accepter », « Rejeter », « Modifier », critères, barre d'enregistrement). Flèches pour les `Tabs`, Entrée / Espace pour les boutons, Échap = « Revenir » / « Garder » dans les confirmations en ligne. Aucun piège de focus (pas de modale).
- **Focus** : visible (`--ring`) ; après un appel, sur le h2 de l'étape suivante (`tabindex="-1"`) ou sur l'alerte d'échec ; après « Accepter » / « Rejeter », le focus reste sur le bouton (qui change de libellé, annoncé) ; à l'ouverture du récapitulatif, sur « Revenir » ; à la fermeture de l'édition, sur « Modifier » de la carte.
- **`aria-live`** : une seule région d'état polie pour l'avancement et les confirmations ; compteur de caractères annoncé à 7 500 ; compte à rebours par palier de 15 s ; les échecs en `Alert` (`role="alert"`, une à la fois). Le changement de statut d'une carte est annoncé par la région d'état (« Proposition « titre » acceptée. », titre tronqué à 60 caractères).
- Statuts doublés d'une icône **et** d'un libellé (`schedule`, `check_circle`, `cancel`, `warning`, `lock`) ; jamais la couleur seule, jamais le violet de marque pour un statut ni une alerte. Icônes décoratives `aria-hidden` ; tout bouton d'icône seul porte un `aria-label` complet (monter / descendre un critère : « Monter le critère 2 de « titre » »).
- **Contrastes** AA (4,5:1) en clair et en sombre par les seuls jetons (`foreground`, `muted-foreground`, `border`, `destructive`) ; le texte atténué n'utilise jamais l'opacité. Axe sans violation sur chaque état, clair et sombre.
- **Mouvement réduit** : aucune animation nouvelle ; squelettes sous `motion-safe:` ; le compte à rebours ne bouge pas, il change de texte.
- Cibles 44 px sous 768 px.

## 8. Alternatives écartées
1. **`Sheet` de 440 px sur la liste des fonctionnalités** : trop étroit pour un brief et 20 propositions, parcours de plusieurs minutes, aucun lien partageable ; route dédiée retenue.
2. **Onglets dans `/features`** : casse la lecture seule de S-features et mélange les états.
3. **Assistant modal en étapes** : le contenu des étapes précédentes doit rester lisible et éditable ; une page à trois sections est plus simple à relire et au clavier.
4. **Acceptation par défaut des propositions** : contraire à la règle d'or ; état initial « À relire ».
5. **Une opération `submit` par proposition** : N confirmations, N versions de la spec ; lot unique (tout ou rien) retenu.
6. **Consentement mémorisé (case « J'ai lu »)** : écarté par défaut au profit d'un bloc d'information permanent, plus simple et jamais caché ; le serveur reste l'autorité. À revoir si le produit exige une trace (§9 Q3).
7. **Rendu Markdown des propositions** : ajoute une dépendance et du contenu actif (liens, images) ; texte brut imposé.
8. **Ouvrir une proposition dans le formulaire de fonctionnalité** : un seul brouillon `new` par projet, collisions avec une saisie en cours ; édition sur place retenue.
9. **Couleurs `status-*` ou violet pour À relire / Acceptée / Rejetée** : ce sont des statuts de validation client et de marque ; badge neutre icône + texte.
10. **Cadrer uniquement quand la spec est prête** : empêche la vérification en préproduction et la rédaction anticipée ; la page s'ouvre toujours, seul l'enregistrement est bloqué.
11. **Boutons grisés pour les rôles sans droit** : règle de S-feature-form §1 (jamais de bouton grisé ni d'emplacement vide).
12. **Exposer `maxFeatures`** : complexité pour peu de valeur ; valeur par défaut de l'API.

## 9. Questions ouvertes (à trancher par le produit)
- **Q1** Suggestion de critères pour une fonctionnalité existante (lot 59c) : **reportée** par défaut. Le critère « critères » du titre du ticket est-il couvert par les critères des propositions ?
- **Q2** Nom : « Cadrage assisté » (page) / « Cadrer avec l'IA » (bouton) retenus.
- **Q3** Consentement : **affichage seul**, sans consentement mémorisé ; libellé RGPD final (sous-traitant américain, accord de traitement) à valider.
- **Q4** `draftBrief` facultatif : deux chemins (« Partir d'une idée » / « J'ai déjà un brief »).
- **Q5** Designer : **voit l'écran mais ne peut pas enregistrer** les propositions sans écran lié (message 4.11) ; à confirmer (alternatives : masquer le bouton pour ce rôle, ou permettre de lier un écran dans la carte).
- **Q6** Après un enregistrement réussi : propositions rejetées **jetées**.
- **Q7** Durée du brouillon : 7 jours (alignée sur 48e) ; purgé à la déconnexion. Une durée plus courte (24 h) est possible, les propositions pouvant contenir des données saisies.
- **Q8** Page de réglages de la clé IA : inexistante, ticket séparé à planifier avant l'essai de bout en bout ; en attendant, texte « Demandez à un administrateur ».
- **Q9** Modèle et jetons affichés à l'équipe seulement (pas aux non-admins) : à confirmer.
- **Q10** `maxFeatures` non exposé (défaut 8).
- **Q11** Page ouverte même quand la spec n'est pas prête (enregistrement bloqué) : à confirmer.
- Ordre Étant donné -> Quand -> Alors cassé par l'humain dans une édition : signalé ou refusé ? À vérifier au Red avec `SPEC_INVALID`.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-02 | TK-59 | Création : écran de cadrage assisté (idée, brief éditable, propositions éditables À relire / Acceptée / Rejetée, récapitulatif, un seul `specBatch.submit`), bloc permanent « ce qui est envoyé à Anthropic », états IA non configurée, limite avec compte à rebours, erreurs fournisseur, sortie invalide, collision de délimiteur, spec non prête, designer. Détail : `.workflow/TK-59/02-design.md` |

## 11. Plan d'implémentation web et tests (brief développeur)
Aucun changement de contrat ni nouvelle dépendance. Fichiers sous `apps/web/src`, chacun <= 300 lignes.
- **59a** : route `app/projects/[projectId]/framing/{page,layout}.tsx`, `framing-page.tsx` (étapes 1 et 2), `ai-send-policy.tsx` (3.2), `ai-error-notice.tsx` + `lib/ai-errors.ts` (4.5 à 4.9), `lib/use-ai-call.ts` (un appel à la fois, annulation, compte à rebours), `lib/framing-draft.ts` (cloisonné, schéma Zod, purge à la fin de session), `lib/framing-labels.ts`, bouton dans `features-page.tsx`.
- **59b** : `framing-proposals.tsx`, `framing-proposal-card.tsx`, `framing-submit-bar.tsx`, `lib/use-framing-proposals.ts`, `lib/framing-operations.ts` (acceptées -> opérations -> envoi N-aire), éditeur de critères contrôlé extrait du formulaire, libellé de l'enregistrement « N fonctionnalités ».
- Tests : zéro appel `ai.*` pour client / business ; aucun `specBatch.submit` avant « Confirmer » ; exactement les acceptées envoyées ; texte hostile rendu littéralement (aucun `a[href]`, `img`, `script` issus d'une sortie) ; test de garde interdisant `dangerouslySetInnerHTML` et tout composant Markdown dans les fichiers du lot ; une ligne de test par code d'erreur de la section 4 ; brouillon (autre compte, TTL, purge, stockage indisponible) ; accessibilité (axe, clair et sombre) ; conformité design (aucune couleur ni icône en dur).
- Captures : `design/screens/captures/S-framing/<état>-<clair|sombre>.png` (+ `-mobile` 375 px), générées par les tests de bout en bout avec un modèle simulé (jamais d'appel réel).
