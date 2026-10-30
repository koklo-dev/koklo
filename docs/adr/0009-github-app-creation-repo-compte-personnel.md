---
doc_version: 0.2.0
status: draft
last_reviewed: 2026-10-30
covers_commit: 65118cd
---
# 0009 — Créer le repo de spec d'un compte personnel avec le user access token de la GitHub App, le jeton d'installation pour le reste

- **Statut** : proposé (non accepté : aucun test réel n'a été fait, voir « Test sandbox pour passer en accepté »)
- **Date** : 2026-10-30
- **Décideurs** : product-owner, doc-writer (ticket TK-37, spike documentaire). Correction de la vision : DÉCISION HUMAINE.

## Contexte
La vision §8.1 dit : « Création du repo de spec : dans une organisation où l'App est installée. Pour un compte
personnel, via le jeton OAuth de l'utilisateur (à vérifier en R2). » TK-37 lève ce point. Les tickets TK-38 (port
`FournisseurGit`), TK-39 (implémentation GitHub App) et TK-43 (création de repo côté produit) en dépendent. Aucun appel
réel à l'API GitHub n'a pu être fait (pas d'App de test) : la décision repose sur la documentation officielle, une
issue tierce et la documentation d'Octokit, toutes consultées le 2026-10-30.

## Question
Une GitHub App, avec son jeton d'installation (IAT), peut-elle créer un dépôt dans un compte **personnel** ? Quelles
permissions, `POST /user/repos` accepte-t-il un IAT, faut-il un user access token (UAT), quelles alternatives ?

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. UAT de l'App pour `POST /user/repos` (compte personnel), IAT pour l'organisation et tout le reste | Chemin documenté, une seule App, création automatisée, périmètre = permissions App ∩ utilisateur | UAT à obtenir, stocker ou rafraîchir ; accès au repo créé si l'installation est en « select repositories » non documenté ; à prouver par test |
| B. IAT sur `POST /user/repos` | Aucun jeton utilisateur | Table officielle favorable mais 403 rapporté sur le terrain ; ambigu, rien ne se bâtit dessus |
| C. L'utilisateur crée le repo vide puis l'ajoute à l'installation | Aucune dépendance au comportement ambigu ; aucun UAT stocké ; fonctionne à coup sûr | Friction ; repo non initialisé (Koklo pousse le premier commit) ; pas de « création en un clic » |
| D. Repo gabarit (`POST /repos/{template}/generate`) | Structure initiale propre | Même question de jeton et de propriétaire ; comportements contradictoires rapportés ; ne résout pas l'authentification |
| E. Passer par une organisation (invitée ou hébergée par Koklo) | IAT et `/orgs/{org}/repos`, chemin propre | Hors du besoin « repo dans mon compte » ; propriété et transfert du repo ; coût d'adoption |
| F. PAT ou OAuth App séparé | Simple | Hors du modèle GitHub App du §8.1 ; scopes larges ; secret long-lived |

## Décision (recommandée)
- **Organisation** : jeton d'installation de l'App, permission « Repository creation » en écriture, `POST /orgs/{org}/repos`.
- **Compte personnel** : **user access token de la GitHub App** (flux web), `POST /user/repos`. L'IAT sur `/user/repos` est déclaré
  **non fiable** (table officielle contredite par un retour terrain), pas « impossible ».
- Le UAT ne sert **qu'à la création** ; contenu, PR, checks et merge restent en IAT. Il est consommé immédiatement ; s'il est conservé, access et
  refresh token sont chiffrés (expiration 8 h, refresh 6 mois).
- **Repli de premier rang** : l'utilisateur crée le repo vide puis l'ajoute à l'installation (option C), exposé dans TK-43 si l'autorisation est refusée ou si la création échoue.
- Le statut reste `proposed` tant que le test sandbox ci-dessous n'a pas été exécuté.

## Conséquences
### Port `FournisseurGit` (TK-38) et implémentation (TK-39)
- Distinguer le propriétaire : type `Organization` ou `User` (issu de `installation.account.type`).
- Accepter un **contexte d'authentification utilisateur** optionnel en plus de `authentifier(org)` qui rend un IAT.
- Erreur typée (par exemple `CreationRepoNonAutorisee`) pour le 403 « Resource not accessible by integration », avec un message actionnable ; sur UAT expiré (401), refresh puis redemande.
- Faux fournisseur et suite de conformité : couvrir organisation, utilisateur et l'échec « pas de jeton utilisateur ». Test réel marqué sur repo bac à sable des deux types de compte.
- `@octokit/auth-app` (`type: "oauth-user"`, flux web ou device) suffit ; vérifier la dernière version stable au registre avant ajout (skill `dependency-selection`).

### TK-43
- Flux compte personnel : demander l'autorisation GitHub avant la création ; flux organisation : aucune autorisation utilisateur.
- Prévoir le repli de l'option C.

### Configuration des GitHub Apps (une App par environnement, staging et production, jamais partagée)
- Cocher **« Request user authorization (OAuth) during installation »** pour obtenir le UAT à l'installation. Conséquence documentée : le **Setup URL devient
  indisponible** et la **Callback URL devient le point de finalisation de l'installation** (elle doit lire `installation_id`, `code`, `state`).
- **Callback URL exacte par environnement**, sans wildcard, **distincte de celle de Better Auth** (connexion), avec `redirect_uri` explicite à chaque appel (sinon la première URL est utilisée).
- **Expire user authorization tokens** activé : prévoir le refresh.
- Permission **« Repository creation »** plutôt qu'« Administration » si c'est le seul besoin (Administration seulement si l'adoption exige branch protection ou environnements). Aucune permission « account ».
- Device flow : seulement si un CLI doit créer sans navigateur.
- **Client ID et client secret de l'App** en secrets d'environnement, avec App ID, clé privée et webhook secret ; distincts des secrets Better Auth GitHub.

## Test sandbox pour passer en accepté
NEEDS-HUMAN : créer une App de test (permission « Repository creation » en écriture, user authorization activée, tokens expirants), un compte personnel de test et une organisation de test, et fournir App ID, clé privée, client ID et secret. Puis, en notant pour chaque appel le statut HTTP, le corps d'erreur, l'en-tête `x-accepted-github-permissions` et la date :
1. Installer l'App sur le compte personnel de test, **IAT** (`createAppAuth` `type: "installation"`) puis `POST /user/repos` : attendu 403 d'après la source tierce, à consigner.
2. Obtenir un **UAT** (flux web, compte personnel de test), `POST /user/repos` : succès attendu, à confirmer.
3. Avec le repo créé en 2 : est-il accessible à l'IAT quand l'installation est en « Only select repositories » puis en « All repositories » (`GET /repos/{owner}/{repo}` en IAT) ?
4. **IAT** de l'installation sur l'organisation de test, `POST /orgs/{org}/repos` : succès attendu, à confirmer.
5. Optionnel : `POST /repos/{template}/generate` avec UAT puis IAT.
Si 2 et 4 réussissent, passer l'ADR en `accepté` avec les résultats ; si 2 échoue, la décision bascule sur l'option C.

## Correction proposée de la vision §8.1 (DÉCISION HUMAINE)
`vision.md` est en lecture seule pour les agents et n'a pas été modifié. Proposition, à appliquer par un humain une fois l'ADR acceptée :
remplacer « via le jeton OAuth de l'utilisateur » par « via le user access token de la GitHub App » (ni OAuth App séparé, ni PAT). Remplacer aussi « administration »
par « Repository creation » dans la liste des permissions si le besoin se limite à la création.

## Options écartées
- **B (IAT sur `/user/repos`)** : un retour terrain récent donne un 403, la sémantique d'un IAT (agir comme l'App sur la ressource de l'installation, sans utilisateur) l'explique plausiblement (inférence).
- **D** : ne résout pas l'authentification et des comportements contradictoires sont rapportés.
- **E** : ne répond pas au besoin de créer dans le compte de l'utilisateur.
- **F** : sort du modèle GitHub App, scopes `repo` larges, secret long-lived.

## Sources
Toutes consultées le 2026-10-30 (citations de moins de 15 mots).
1. [Permissions required for GitHub Apps](https://docs.github.com/en/rest/overview/permissions-required-for-github-apps) : `POST /user/repos`, `POST /orgs/{org}/repos` et `/generate` listés sous « Repository creation » / « Administration » en écriture, jetons UAT et IAT. « UAT = user access token, IAT = installation access token ».
2. [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) : permission dédiée « Repository creation », l'App accède aux repos qu'elle crée (paraphrase).
3. [Installing a GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party) : « Anyone can install GitHub Apps on their personal account. »
4. [REST API, repositories](https://docs.github.com/en/rest/repos/repos) : scopes `public_repo` ou `repo` pour OAuth App et PAT classic ; la page extraite ne parle pas des IAT. « need the public_repo or repo scope to create a public repository ».
5. [Generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) : pas de scopes, expiration 8 h, refresh 6 mois. « only has permissions that both the user and the app have ».
6. [Authenticating as an installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) : IAT d'une heure ; certains endpoints REST n'acceptent pas les IAT (paraphrase).
7. [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) : Callback URL, « Request user authorization (OAuth) during installation », Setup URL, expiration des tokens.
8. [About the user authorization callback URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url) : « the first callback URL will be used » sans `redirect_uri`.
9. Issue tierce [viamin/paid#4033](https://github.com/viamin/paid/issues/4033) (fermée 2026-09-27) : IAT sur installation de compte utilisateur, `POST /user/repos` répond 403. « Resource not accessible by integration ».
10. Discussion communautaire [community#52316](https://github.com/orgs/community/discussions/52316) (2023-2024), poids faible : on ne crée pas pour le compte d'un autre (paraphrase).
11. Documentation Octokit `@octokit/auth-app.js` via Context7 : `createAppAuth` gère `type: "installation"` et `type: "oauth-user"`.

**Contradiction signalée** : la table officielle (source 1) autorise l'IAT sur `POST /user/repos`, alors que l'issue tierce (source 9) rapporte un 403.
Aucune page officielle consultée ne tranche (l'extraction de la page de l'endpoint et de la table était partielle). La décision écarte donc l'IAT par prudence, jusqu'au test sandbox.

## Preuves
Aucune exécution : spike documentaire (voir `.workflow/TK-37/01-analyse.md`). Points **non vérifiés empiriquement** : 403 de l'IAT sur `/user/repos`, succès du UAT, accès de l'IAT au repo créé en « select repositories », `POST /orgs/{org}/repos` en IAT.
