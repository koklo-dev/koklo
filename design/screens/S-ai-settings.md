---
id: S-ai-settings
titre: Réglages de l'IA (clé du fournisseur de l'organisation)
version: 1.2
---
## 1. Utilisateurs et objectif
Propriétaires et administrateurs de l'organisation active (vue équipe, vision §14 « fournisseurs, clés BYOK : propriétaire/admin seulement »). Les autres rôles (développeur, designer, client, business) n'ont pas cette page : l'entrée est absente de la navigation et un accès direct affiche un message sans action ni appel d'API. Arrivée : entrée « IA » de la barre latérale, ou lien « Configurer l'IA » de l'écran de cadrage (S-framing §4.5) pour owner/admin.

Objectif : fournir à l'organisation la clé de son compte chez le fournisseur d'IA (BYOK : la clé est facturée par le fournisseur, pas par Koklo), vérifier qu'elle fonctionne, la remplacer ou la retirer. Sans clé, le cadrage assisté (S-framing) est inutilisable. Ce qu'on peut faire de la clé : l'enregistrer, la remplacer, la retirer. Ce qu'on ne peut jamais faire : la relire.

Cet écran n'est pas décrit dans la vision ; il découle de §14, §15 (secrets chiffrés, jamais réaffichés, politique d'envoi affichée) et de S-framing §9 Q8. À confirmer comme ajout de backlog (la vision n'est pas modifiée).

## 2. Tâches et parcours
- Principale : saisir la clé -> « Enregistrer et vérifier » -> `llmCredential.set` puis, si `set` réussit, `llmCredential.verify` -> état « Configurée et vérifiée (modèle X) ».
  - Le contrat ne permet pas de vérifier avant d'enregistrer (`verify` ne prend pas de clé). Une clé fausse est donc stockée avant d'être refusée : l'écran le dit (« Enregistrer et vérifier ») et propose « Retirer la clé » si la vérification échoue.
- Secondaires : « Vérifier à nouveau » (clé déjà enregistrée) ; « Remplacer la clé » (même parcours, `set` upsert) ; « Retirer la clé » (confirmation en ligne puis `llmCredential.remove`) ; déplier « Avancé » pour fixer le modèle par défaut (optionnel).
- Entrées : `/settings/ai` (navigation, lien du cadrage). Sans session : `/login` ; session sans organisation active : `/organizations` (même règle que `/github`).
- Sorties : aucune page. Après enregistrement, un lien secondaire « Retour au cadrage » n'est pas ajouté (l'utilisateur revient par la navigation).
- Gabarit : S-github (sidebar-07), entrée « IA » (icône `smart_toy`, `aria-current="page"`), fil d'Ariane « Koklo > Réglages > IA » (« Réglages » est un maillon non cliquable : aucune page `/settings`).
- Navigation : entrée « IA » placée après « GitHub », visible seulement si le rôle est owner/admin. Tant que le rôle n'est pas connu, l'entrée n'est pas rendue (fail-closed).
- Hors lot : `invalidate` (désactivation manuelle, non exposée : remplacer ou retirer suffisent), fournisseurs OpenAI et Google (le contrat les connaît mais aucun adaptateur n'existe, ADR 0015), CSP globale (ticket séparé).

## 3. Contenu
Sources : `llmCredential.list` (`{ items: Status[] }`, `Status = { provider, defaultModel?, configured, invalid, invalidatedAt?, lastUsedAt?, createdAt, updatedAt }`, jamais la clé ni aucun indice sur elle : ni suffixe, ni longueur, ni empreinte), `llmCredential.set`, `llmCredential.verify` (`{ ok, model, checkedAt }`), `llmCredential.remove`, `organization.list` (rôle courant).

- h1 « IA » ; phrase d'introduction : « Koklo utilise le compte d'IA de votre organisation pour le cadrage assisté. Vous fournissez votre propre clé : elle est facturée par le fournisseur, pas par Koklo. »
- Une seule carte, « Anthropic » (h2), seul fournisseur proposé. La structure de la page est par fournisseur (liste d'items) pour en ajouter plus tard sans refonte ; aucune carte vide pour OpenAI ou Google.
- Dans la carte :
  1. **Statut** (icône + texte, tableau ci-dessous).
  2. **Lecture seule** quand la clé existe : « Enregistrée le <date longue> » (`createdAt`) ; « Modifiée le <date> » si `updatedAt` diffère ; « Dernière utilisation : <date> » ou « Jamais utilisée » (`lastUsedAt`) ; « Modèle par défaut : <defaultModel> » (police mono) si fixé. Dates en texte, jamais d'heure relative seule. **Aucune** mention de longueur, de fin de clé, de masque `••••` : la clé n'est pas représentée du tout (ADR 0013).
  3. **Formulaire** (4.2) ou actions (4.3).
- Bloc d'envoi à l'agent IA (v2, TK-87) : réutilise `ai-send-policy.tsx`, `InlineAlert` neutre d'une ligne, icône `lock`, « Votre texte est envoyé à l'agent IA avec la clé de l'organisation. » + « Détails » replié (même détail que S-framing §3.2, sans nom de fournisseur ni pays, B15, B24), **toujours rendu** au-dessus du formulaire et visible aussi quand la clé existe. En sombre, fond `--raised`. Ajout d'une ligne propre à cet écran : « Votre clé est chiffrée sur nos serveurs. Elle ne peut plus être affichée, seulement remplacée ou retirée. » Libellé RGPD final à valider par le produit (S-framing Q3), ne bloque rien.
- Ligne sous le bouton de vérification : « Chaque vérification est comptée dans les limites de votre organisation (5 par heure). »

### Statuts (jamais la couleur seule)
| État | Source | Rendu (icône + texte) | Composant |
|---|---|---|---|
| Absente | `items` sans Anthropic | `block` + « Non configurée » | `Badge` outline |
| Configurée | `configured`, `!invalid` | `check_circle` pleine + « Configurée » | `StatusBadge` validated |
| Invalide | `invalid` (+ `invalidatedAt`) | `warning` + « Refusée par le fournisseur (désactivée) » + « le <date> » | `Badge` outline, texte `foreground` |
| Illisible | 409 `undecryptable` à la vérification (état de session, non fourni par `list`) | `warning` + « Illisible : à saisir à nouveau » | `Badge` outline |
| Vérification en cours | mutation `verify` en vol | `schedule` + « Vérification en cours… » | `Badge` outline |

« Configurée » ne signifie pas « vérifiée » : la coche pleine n'apparaît qu'avec « Configurée » ; après une vérification réussie, la ligne « Vérifiée à l'instant avec le modèle <model> » s'ajoute (état de session, perdu au rechargement). Aucun état « expirée » : le contrat n'a pas de date d'expiration. Le violet de marque n'est jamais utilisé pour un statut ni une alerte. Aucune icône nouvelle : `smart_toy`, `lock`, `check_circle`, `schedule`, `warning`, `block`, `add`, `close` existent dans `@koklo/ui`.

## 4. États
Priorité d'évaluation : session / organisation, rôle, puis état de la carte.

### 4.1 États de page
- **Rôle inconnu** : `LoadingStatus` « Chargement… » ; aucun appel `llmCredential.list` (requête `enabled` seulement pour owner/admin connu), aucun message de droits.
- **Non-admin** (rôle connu, ni owner ni admin) : h1 « IA » + `Alert` neutre, icône `lock`, « Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de configurer l'IA. » Aucun champ, aucun bouton, **aucun appel API** (ni `list`, ni autre). 403 reçu par ailleurs : même message en `Alert`. 401 : redirection du kit (`useUnauthorizedRedirect`).
- **Chargement** (`list`) : `LoadingStatus` `role="status"` `aria-busy`, « Chargement des réglages de l'IA… », un squelette de carte (`motion-safe:` pulse).
- **Erreur de liste** : `ErrorNotice`, `warning`, « Impossible de charger les réglages de l'IA », « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », « Réessayer ». 503 : « Le coffre des clés n'est pas disponible. Réessayez plus tard. » (`list` ne déchiffre rien, ce cas ne vient que des mutations).

### 4.2 Carte Anthropic : absente
Texte : « Aucune clé n'est enregistrée. Le cadrage assisté ne fonctionnera pas tant qu'elle manque. » Formulaire visible d'emblée (pas de bouton intermédiaire) :
- Champ « Clé API Anthropic » (`label` visible) : `<input type="password">` **non contrôlé**, `name="llm-secret"`, `autocomplete="off"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`, `maxLength=512`, `data-1p-ignore`, `data-lpignore="true"`, aucune valeur initiale, **aucun bouton « afficher »**. Aide : « Collez la clé depuis la console de votre compte Anthropic. Elle ne sera plus jamais affichée. »
- `Collapsible` « Avancé » (fermé) : champ « Modèle par défaut (facultatif) » (1 à 100 caractères, sans « / » ni « .. »), aide « Laissez vide pour utiliser le modèle recommandé par Koklo. » (champ texte ordinaire, il n'est pas secret).
- Bouton principal « Enregistrer et vérifier » (icône `add`), `<form method="post">` avec `preventDefault` (la clé ne peut pas partir dans l'URL).
- Validation locale (règles du contrat) : clé vide après rognage -> « Saisissez la clé. » ; plus de 512 caractères ou caractère de contrôle -> « Cette clé n'est pas valide. » Aucun message ne cite la valeur ni sa longueur ; la validation 422 du serveur donne le même message générique. Erreur reliée au champ (`aria-describedby`, `aria-invalid`), focus dans le champ, qui est vidé.

### 4.3 Carte Anthropic : configurée
Lecture seule (§3) + actions : « Vérifier à nouveau » (principal), « Remplacer la clé » (secondaire, ouvre le formulaire de 4.2 dans la carte, focus dans le champ ; « Annuler » le referme, focus sur « Remplacer la clé »), « Retirer la clé » (`variant="outline"` destructif, texte seul, voir 4.9). Pas de formulaire affiché en permanence : un champ de clé vide à côté d'une clé existante ferait croire qu'elle peut être relue.

### 4.4 Invalide
Statut « Refusée par le fournisseur (désactivée) le <date> ». Texte : « Le fournisseur a refusé la clé de l'organisation. L'IA est désactivée jusqu'à ce que vous la remplaciez. » Le formulaire de remplacement s'ouvre d'emblée (comme 4.2), bouton « Enregistrer et vérifier » ; « Retirer la clé » reste disponible. « Vérifier à nouveau » n'est pas proposé (409 `invalidated`).

### 4.5 Illisible
Après un 409 `undecryptable` à la vérification : statut « Illisible : à saisir à nouveau ». Texte : « La clé enregistrée ne peut plus être lue. Saisissez-la de nouveau pour la remplacer. » Formulaire de remplacement ouvert ; « Retirer la clé » disponible. Même traitement pour 409 `invalidated` (-> 4.4) et `missing` (la carte repasse à 4.2 et la liste est rechargée).

### 4.6 Vérification en cours
Bouton de soumission `disabled` + `aria-busy`, libellé « Enregistrement et vérification… » (puis « Vérification… » après `set`) ; `role="status"` « Enregistrement de la clé puis vérification. Cela peut prendre quelques secondes. » Tous les autres boutons de la carte désactivés. Un double clic ne produit qu'un `set` (drapeau d'envoi immédiat, avant tout rendu). Pas d'annulation (la clé est déjà partie).

### 4.7 Résultats de la vérification
Région d'état unique `role="status"` `aria-live="polite"` pour les succès ; une seule `Alert` `role="alert"` à la fois pour les échecs. Jamais de message brut du fournisseur ; jamais la clé.
- **Succès** : « Clé enregistrée et vérifiée (modèle <model>). » (statut Configurée + ligne « Vérifiée à l'instant »).
- **Enregistrée mais refusée** (`LLM_PROVIDER_ERROR` `auth`) : titre « Clé enregistrée, mais refusée par le fournisseur », « Vérifiez que la clé est correcte et active, puis saisissez-la de nouveau. Vous pouvez aussi la retirer. » Boutons : formulaire de remplacement ouvert, « Retirer la clé ».
- **Quota de vérification** (`LLM_RATE_LIMITED` 429, 5 par heure et par organisation) : `Alert` (icône `schedule`) « Trop de vérifications pour le moment. Réessayez dans <N> s. » (« environ N min » au-delà de 60 s). La clé **est enregistrée** : le message le dit (« Votre clé a bien été enregistrée ; seule la vérification est reportée. »). Les boutons « Enregistrer et vérifier » (en remplacement) et « Vérifier à nouveau » sont désactivés jusqu'à l'échéance ; compte à rebours annoncé par paliers de 15 s, à l'échéance « Vous pouvez réessayer. » ; le chiffre visible bouge chaque seconde hors de la région annoncée (mécanique de S-framing §4.6, `use-ai-call`). Sous mouvement réduit, seul le texte change.
- **Autres raisons du fournisseur** (`LLM_PROVIDER_ERROR`), réutilisent `lib/ai-errors.ts` : `quota` « Le crédit du compte du fournisseur est épuisé : à vérifier sur votre compte Anthropic. » ; `timeout` « Le fournisseur n'a pas répondu à temps. Réessayez. » ; `unavailable` « Le service d'IA est momentanément indisponible. » ; `model_not_found` « Le modèle indiqué n'existe pas. Corrigez-le dans « Avancé » ou videz le champ. » ; `aborted`, `budget`, `context_too_long`, `refused` : « La vérification a échoué. Réessayez. » La clé reste enregistrée dans tous ces cas ; bouton « Vérifier à nouveau » (avec la mention de quota) ; le formulaire n'est pas rouvert.
- **Coffre indisponible** (503 de `set` ou `verify`) : « Le coffre des clés n'est pas disponible. Réessayez plus tard. » Si `set` a échoué, rien n'est enregistré ; le champ est vidé (voir 4.8).
- **Validation serveur** (422 de `set`) : message générique du champ (4.2), sans écho.
- **Autre erreur / 500** : « Impossible d'enregistrer la clé. Une erreur est survenue. Vérifiez votre connexion puis ressaisissez la clé. »

### 4.8 Échec réseau et ressaisie obligatoire
Après tout échec de `set` (réseau coupé, délai, 500), l'état de la clé côté serveur est incertain et la saisie a été effacée : l'écran affiche « Impossible d'enregistrer la clé. Vérifiez votre connexion puis saisissez de nouveau la clé : par sécurité, elle n'est jamais conservée sur cet écran. » et recharge `list` pour montrer l'état réel. Aucun « Réessayer » qui rejouerait la clé : on ressaisit (arbitrage : sécurité avant confort, §8). Après un échec de `verify` seul, la clé n'est pas à ressaisir : « Vérifier à nouveau ».

### 4.9 Retrait
« Retirer la clé » remplace les actions par une confirmation **en ligne** (`role="group"` nommé « Confirmer le retrait de la clé », pas de modale : le kit n'a pas de boîte de dialogue, même règle que S-framing) :
- Texte : « Retirer la clé Anthropic ? L'IA cessera de fonctionner pour toute l'organisation (cadrage assisté) tant qu'une nouvelle clé n'aura pas été enregistrée. Cette action ne supprime rien chez Anthropic. »
- Boutons « Retirer la clé » (destructif) et « Garder la clé ». **Focus initial sur « Garder la clé »**. Échap = « Garder la clé ».
- Succès : région d'état « Clé retirée. », carte à l'état absent (4.2), focus sur le champ de clé. `list` rechargée. 404 (déjà retirée) traité comme un succès. Erreur : `Alert` « Impossible de retirer la clé. Réessayez. »

### 4.10 Garantie « clé jamais réaffichée, champ toujours vidé »
- À la soumission, la valeur est lue dans le champ non contrôlé, passée à `set`, puis le champ est **vidé dans un `finally`** (succès **et** échec, réseau compris), **avant** tout rendu d'erreur ou de succès.
- Elle n'est jamais dans un `useState`, un brouillon, `localStorage`/`sessionStorage`, une clé ou les `variables` du cache de requêtes, l'URL, la console, un `aria-live`, un message d'erreur, ni renvoyée par l'API.
- Pas de bouton « afficher la clé », pas de masque de fin de clé, pas de bouton « copier ».
- Limite assumée : pendant la frappe, la clé est dans le champ du navigateur ; une extension malveillante est hors périmètre.

## 5. Interactions et retours
- « Enregistrer et vérifier » : `set` puis `verify` automatiquement (un clic = deux appels, dans cet ordre, `verify` seulement si `set` réussit). Au succès de `set`, `list` est invalidée même si `verify` échoue.
- « Vérifier à nouveau » : `verify` seul, avec la mention de quota visible à côté du bouton.
- Pas de toast, pas de modale : confirmations dans la région d'état, confirmation du retrait en ligne.
- Une seule action en vol sur la page ; les autres boutons sont `disabled` pendant ce temps.
- Réponses : la page porte `Cache-Control: no-store` et `Referrer-Policy: no-referrer` (en-têtes de la route `/settings/ai`). Une CSP stricte est un ticket séparé, à décider avec un ADR.
- Vocabulaire : « clé », « fournisseur », « vérifier », « retirer », « remplacer ». Jamais « jeton », « secret », « token », « BYOK » dans une phrase d'interface. Pas d'emoji, pas de mascotte.

## 6. Responsive
Sous 768 px (375 px testé) : marge 16 px ; h1 puis carte pleine largeur ; champs 44 px de haut ; boutons pleine largeur de 44 px, empilés dans l'ordre (principal en premier) ; confirmation du retrait : deux boutons empilés, « Garder la clé » en premier ; aucun défilement horizontal ; dates et noms de modèle (mono) passent à la ligne. Dès 768 px : contenu à largeur max 672 px aligné à gauche, boutons 36 px en rangée, bloc « Ce qui est envoyé » sous le formulaire dans la même colonne.

## 7. Accessibilité
- Repères : `main`, h1 unique, h2 « Anthropic », `data-testid="ai-settings-page"`, fil d'Ariane en `nav` nommée.
- Ordre de focus : navigation, champ de clé, « Avancé » (puis modèle), « Enregistrer et vérifier », actions de la carte. Ouverture du formulaire (remplacement) : focus dans le champ ; fermeture : retour sur « Remplacer la clé » ; échec de validation : focus dans le champ en erreur ; retrait confirmé : focus sur le champ de clé.
- Libellés visibles pour tous les champs ; aide et erreurs reliées par `aria-describedby`, `aria-invalid` ; `Collapsible` « Avancé » avec `aria-expanded`.
- Statuts doublés d'une icône **et** d'un texte (`check_circle`, `block`, `warning`, `schedule`) ; jamais la couleur seule ; tokens uniquement (`foreground`, `muted-foreground`, `border`, `destructive`, `status-*`), AA 4,5:1 en clair et en sombre ; texte atténué jamais par opacité. Icônes décoratives `aria-hidden`.
- Annonces : une région d'état polie pour succès et progression ; une `Alert` `role="alert"` à la fois pour les échecs ; compte à rebours par paliers de 15 s ; **aucune annonce ne cite la clé**.
- Mouvement réduit : squelette sous `motion-safe:`, aucune autre animation ; compte à rebours en texte seul.
- Gestionnaires de mots de passe : `name` neutre, `autocomplete="off"`, attributs `data-1p-ignore` / `data-lpignore` ; `new-password` écarté (il proposerait de générer un mot de passe). À tester en Chrome.
- Cibles de 44 px sous 768 px ; axe sans violation, clair et sombre, sur chaque état.

## 8. Alternatives écartées
1. **Route `/settings/ai` (retenu)** contre `/ai` : extensible à d'autres réglages sans changer d'adresse ; « Réglages » n'est qu'un maillon du fil d'Ariane (pas de page `/settings`).
2. **Page dédiée (retenu)** contre un `Sheet` ou une section dans « Projets » : la clé est un réglage d'organisation, pas de projet ; un panneau de 440 px cacherait la politique d'envoi et l'état de la clé.
3. **Anthropic seul (retenu)** contre trois cartes dont deux « bientôt » : aucun adaptateur pour OpenAI et Google, des cartes vides promettraient une fonction inexistante.
4. **« Enregistrer et vérifier » en un clic (retenu)** contre deux boutons séparés : le contrat impose `set` puis `verify` ; un clic évite un état « enregistrée, pas testée » oublié. La conséquence (clé fausse stockée) est dite et corrigible (« Retirer »).
5. **Vérifier avant d'enregistrer** impossible : `verify` ne prend pas de clé candidate.
6. **Bouton « afficher la clé », masque `••••1234`, copie** écartés : contraire à ADR 0013 et à la vision §15 ; la clé n'est pas représentée.
7. **Conserver la saisie après échec réseau** écarté : il faudrait la garder en mémoire ou en stockage. Ressaisie obligatoire, message explicite.
8. **Champ contrôlé (`useState`)** écarté : la clé finirait dans l'état React et les outils de développement.
9. **Exposer `invalidate`** écarté pour ce lot : remplacer ou retirer couvrent le besoin, pas de « réactiver » dans le contrat.
10. **Modèle par défaut toujours visible** écarté : champ technique sans valeur pour la majorité ; replié dans « Avancé ».
11. **Modale de confirmation du retrait** écartée : le kit n'a pas de `Dialog` ; confirmation en ligne, focus sur l'option sûre.
12. **Entrée de navigation visible puis refus** écartée (comme S-github) ; le refus direct reste par défense.
13. **Icône `key` ou `vpn_key`** non disponibles dans `@koklo/ui` ; `smart_toy` retenue (aussi utilisée par le bouton de cadrage), pas d'icône ajoutée.

## 9. Questions ouvertes
- Libellé RGPD final (sous-traitant américain, accord de traitement) : texte de `ai-send-policy` réutilisé, validation produit en attente (S-framing Q3).
- Ajout de backlog : l'écran n'est pas dans la vision ; à confirmer par l'humain.
- Quota de vérification : 5 par heure et par organisation, affiché en dur dans le texte d'aide ; à relire si le plafond serveur change (aucune valeur exposée par le contrat).
- Ticket `sensitive` (secret) : PR laissée ouverte pour approbation humaine.
- En-têtes `no-store` et `Referrer-Policy` limités à cette route ; CSP globale, test CSRF d'origine étrangère et non-journalisation du corps du `set` côté API : tickets séparés à tracer.
- Un second administrateur peut remplacer la clé sans que le premier le sache : pas de notification ni d'historique visible (l'audit existe côté API).
- Pas d'état « illisible » dans `list` : visible seulement après une vérification ou un usage ; un rechargement le fait disparaître jusqu'à la prochaine tentative.
- Clé de test (`sk-test-*`) en e2e uniquement avec un faux fournisseur, jamais d'appel réel.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-02 | Web : réglages IA (clé BYOK) | Création : route `/settings/ai`, owner/admin, Anthropic seul, « Enregistrer et vérifier » (set puis verify), états absente / configurée / invalide / illisible / en cours / échec réseau / quota 5 par heure / non-admin, remplacement et retrait avec confirmation, clé jamais réaffichée. Détail : `.workflow/AI-SETTINGS/02-design.md` |
| 1.1 | 2026-11-06 | TK-87 | Lot 0 : bloc d'envoi en `InlineAlert` neutre + « Détails » (S-framing §3.2 v2), sans nom de fournisseur dans le bloc (B15) ; la ligne « Votre clé est chiffrée… » reste hors du bloc, inchangée ; h1 et h2 à l'échelle v2. Les libellés « Anthropic » de la carte (nom du fournisseur de la clé) et ses `Badge` d'état restent jusqu'à TK-98 (B30). Détail : `.workflow/TK-87/02-design.md` |
| 1.2 | 2026-11-07 | TK-88 | Route `/settings/ai` inchangée, rendue sous « Réglages » (onglets en liens, plus d'entrée « IA » dans la barre). États et textes inchangés. Détail : `.workflow/TK-88/02-design.md` |

## 11. Plan d'implémentation web (brief développeur)
Aucun changement de contrat ni de dépendance.
- Route : `apps/web/src/app/settings/ai/{layout,page}.tsx` (`AppFrame current="IA"`, `metadata.title` « IA · Koklo »). En-têtes `Cache-Control: no-store` et `Referrer-Policy: no-referrer` pour `/settings/ai` (`next.config.ts` `headers()`).
- Garde : `lib/auth-guard.ts` (ajouter `/settings/ai` à `GuardedPath` et aux chemins qui exigent une organisation active), `proxy.ts` (matcher + commentaire), `components/app-sidebar.tsx` (entrée `{ title: "IA", url: "/settings/ai", icon: "smart_toy" }` si `canManage(role)`, après « GitHub »).
- Composants (<= 300 lignes chacun) : `ai-settings-page.tsx` (rôle, `list`, états), `ai-credential-card.tsx`, `ai-credential-form.tsx` (champ non contrôlé, `finally` qui vide), `ai-credential-remove.tsx` (confirmation en ligne), `lib/ai-settings-labels.ts`. Réutiliser `ai-send-policy.tsx`, `lib/ai-errors.ts`, `use-ai-call` (compte à rebours), `Alert`, `Badge`, `StatusBadge`, `Collapsible`, `Skeleton`, `LoadingStatus`, `ErrorNotice`, `canManage`, `useActiveOrganization`, `llmCredentialSetInputSchema`.
- Mutations : `gcTime: 0`, pas de `mutationKey`, la clé n'entre ni dans `variables` conservées ni dans une clé de requête ; pas de persistance du cache.
- `app/projects/[projectId]/framing` : voir S-framing §4.5 (lien « Configurer l'IA »).
- Tests (Red) : non-admin et rôle inconnu sans appel `llmCredential.*` ; entrée de navigation seulement owner/admin ; champ `type=password`, `autocomplete=off`, `maxLength=512`, non contrôlé ; après réussite **et** échec, `input.value === ""` et la clé est absente de `document.body.innerHTML`, `localStorage`, `sessionStorage`, du cache des requêtes, des espions `console.*` et des messages d'erreur ; `set` appelé une fois avec la clé exacte puis `verify` ; double clic = un appel ; `verify` non appelé si `set` échoue ; 429 avec compte à rebours et clé déclarée enregistrée ; 502 par raison ; 409 `undecryptable` / `invalidated` -> formulaire ouvert ; 503 ; 422 sans écho ; retrait avec confirmation et focus sur « Garder la clé » ; aucun texte « expirée » ni masque de clé ; bloc de politique et mention « chiffrée » présents ; `design-conformity.test.ts`.
- e2e `ai-settings.spec.ts` (faux fournisseur, clé `sk-test-*`) : la valeur n'apparaît que dans le corps du PUT ; rôle développeur refusé ; clair/sombre ; 375 px sans défilement horizontal ; axe (ajouter la route à `a11y.spec.ts`) ; en-têtes de la route.
- Captures : `design/screens/captures/S-ai-settings/<état>-<clair|sombre>.png` (+ `-mobile`).
