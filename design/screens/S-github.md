---
id: S-github
titre: Application GitHub (installation et autorisation)
version: 3
---
## 1. Utilisateurs et objectif
Propriétaires et administrateurs de l'organisation active (vue équipe, vision §14). Les autres rôles (développeur, designer, client, business) n'ont pas cette page : l'entrée est absente de la navigation et un accès direct affiche un message sans action. Arrivée : entrée « GitHub » de la barre latérale, ou retour de GitHub après une installation (`/github?result=…`), ou lien depuis la création de projet (48c).

Objectif : relier Koklo à un compte GitHub (personnel ou organisation GitHub) pour que Koklo puisse créer le dépôt de spécification des projets et y enregistrer les fonctionnalités. Deux gestes distincts, à expliquer simplement :
- **Installer** l'application GitHub : choisir le compte et les dépôts auxquels Koklo a accès (se fait sur GitHub).
- **Autoriser** Koklo : confirmer que l'on agit en son nom sur ce compte (nécessaire pour créer un dépôt). Se refait si l'autorisation a expiré.

## 2. Tâches et parcours
- Principale : « Installer l'application GitHub » -> `installation.start` -> navigateur redirigé vers l'URL reçue (GitHub) -> GitHub renvoie vers l'API qui redirige en 303 vers `/github?result=<résultat>` -> message de résultat + liste rafraîchie.
- Secondaire : « Autoriser » / « Réautoriser » sur une ligne (`installation.start` avec `installationId`), même mécanique de redirection ; consulter l'état des installations ; réessayer le chargement.
- Entrées : `/github` (navigation), retour de callback. Sans session : `/login` ; session sans organisation active : `/organizations` (même règle que `/members`).
- Sorties : GitHub (installation, autorisation). Aucune autre page. Le lien vers la création de projet n'est pas ajouté ici (hors lot).
- Gabarit : S-projects / S-members (sidebar-07), entrée « GitHub » (icône `link`, `aria-current="page"`), fil d'Ariane « Koklo > GitHub ».
- Navigation : entrée « GitHub » placée après « Membres », visible seulement si le rôle est owner/admin. Tant que le rôle n'est pas connu, l'entrée n'est pas rendue (évite un faux affichage, même principe que le formulaire de S-members).

## 3. Contenu
Sources : `installation.list` (`{ id, provider, ownerKind, ownerLogin, status, userAuthorization, createdAt }[]`, sans identifiant externe ni jeton), `installation.start` (`{ installationId? }` -> `{ url, expiresAt }`), `organization.list` (rôle courant), paramètre d'URL `result` (`installationCallbackOutcomeSchema`).

- h1 « GitHub » ; phrase d'introduction : « Koklo utilise l'application GitHub pour créer le dépôt de spécification de vos projets et y enregistrer vos fonctionnalités. Vous choisissez les comptes et les dépôts auxquels elle a accès. »
- Bouton principal « Installer l'application GitHub » (icône `add`). Sous le bouton, texte d'aide : « Vous serez redirigé vers GitHub, puis ramené ici. Il faut être propriétaire du compte GitHub, ou administrateur de l'organisation GitHub. »
- Liste « Installations GitHub » : une entrée par installation (ordre de l'API : création). Chaque entrée affiche :
  - **Compte** : `ownerLogin` (police mono, identifiant) ; dessous, texte secondaire « Compte personnel » (`ownerKind: user`) ou « Organisation GitHub » (`organization`).
  - **Installation** : statut (icône + texte, voir §4 tableau).
  - **Votre autorisation** (seulement pour une installation `active`) : statut (icône + texte) ; action « Autoriser » ou « Réautoriser ».
  - Date : « Installée le <date longue> » (`createdAt`), texte secondaire.
- Aucun identifiant externe, jeton, `state` ou URL n'est affiché ni stocké côté web.

### Statuts (jamais la couleur seule)
| Donnée | Valeur | Rendu (icône + texte) | Composant |
|---|---|---|---|
| Installation | `active` | `check_circle` pleine + « Active » | `StatusBadge` validated |
| Installation | `suspended` | `block` + « Suspendue » | `Badge` outline |
| Installation | `deleted` | `cancel` + « Désinstallée » | `Badge` outline |
| Autorisation | `active` | `check_circle` pleine + « Autorisée » | `StatusBadge` validated |
| Autorisation | `absent` | `schedule` pleine + « À autoriser » | `StatusBadge` pending |
| Autorisation | `expired` | `schedule` pleine + « Autorisation expirée » | `StatusBadge` pending |

`Badge` outline : l'icône (16 px) et le texte sont dans le badge, couleur de texte `foreground` ; aucune couleur de statut hors tokens `status-*` du kit. Le violet de marque n'est jamais utilisé pour un statut ni une alerte. Aucune icône nouvelle : `check_circle`, `schedule`, `block`, `cancel`, `warning`, `lock`, `link`, `add` existent déjà dans `@koklo/ui`.

## 4. États
- **Rôle inconnu** : `LoadingStatus` « Chargement… » ; aucun appel `installation.list` tant que le rôle n'est pas connu et gestionnaire (requête `enabled`), aucun message de droits.
- **Non-gestionnaire** (rôle connu, ni owner ni admin) : h1 « GitHub » + `Alert` neutre, icône `lock`, « Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de relier GitHub. » Aucun bouton, aucun appel d'API. L'API reste l'autorité (`FORBIDDEN`, 403 traité de la même façon si reçu).
- **Chargement** (`installation.list`) : `LoadingStatus` `role="status"` `aria-busy`, « Chargement des installations GitHub… », 2 squelettes (`h-20`). Le bouton « Installer l'application GitHub » reste disponible.
- **Vide** (liste vide) : carte avec le titre « Aucune application GitHub installée » et le texte « Installez l'application pour que Koklo puisse créer le dépôt de spécification de vos projets. Vous choisirez le compte et les dépôts concernés sur GitHub. » ; le bouton « Installer l'application GitHub » (unique) reste celui de l'en-tête, avec son texte d'aide (un bouton qui change de place entre chargement et vide serait remonté pendant le clic).
- **Liste** : compteur « N installation(s) » ; en-tête avec le bouton « Installer l'application GitHub » (autre compte) à droite du h1 (en dessous sur mobile). Cas par entrée :
  - `active` + autorisation `active` : aucune action. Texte : « Koklo peut créer des dépôts sur ce compte. »
  - `active` + autorisation `absent` : texte « Koklo n'a pas encore votre autorisation pour créer des dépôts sur ce compte. » ; bouton « Autoriser » (variante par défaut, `aria-label` « Autoriser Koklo sur <login> »).
  - `active` + autorisation `expired` : texte « Votre autorisation a expiré. » ; bouton « Réautoriser » (`aria-label` « Réautoriser Koklo sur <login> »).
  - `suspended` : entrée en texte secondaire, texte « Suspendue sur GitHub. Réactivez-la depuis vos paramètres GitHub. » ; aucune action, pas d'autorisation affichée.
  - `deleted` : entrée atténuée par la couleur de texte `muted-foreground` (jamais par opacité, pour garder le contraste AA), texte « Désinstallée sur GitHub. Réinstallez l'application pour la relier de nouveau. » ; aucune action, pas d'autorisation affichée, aucune action de création en aval.
- **Erreur de liste** : `ErrorNotice`, `warning`, titre « Impossible de charger les installations », « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », « Réessayer ». Le bouton d'installation reste disponible. `UNAUTHORIZED` : redirection du kit (`useUnauthorizedRedirect`).
- **Redirection en cours** (après clic sur « Installer », « Autoriser » ou « Réautoriser ») : le bouton cliqué passe `disabled` + `aria-busy`, libellé « Redirection vers GitHub… » ; les autres boutons de la page sont désactivés ; `role="status"` « Redirection vers GitHub… ». Un double clic ne produit qu'un appel. L'état reste tant que la page n'est pas quittée ; réarmé seulement en cas d'erreur.
- **Erreurs de `installation.start`** (`Alert` destructive, `role="alert"`, au-dessus de la liste, boutons réarmés) :
  - `PROVIDER_UNAVAILABLE` (503) : titre « L'installation n'est pas disponible pour le moment » ; texte « L'application GitHub n'est pas configurée sur cet environnement, ou GitHub ne répond pas. Réessayez plus tard ou contactez la personne qui administre Koklo. » (Le repli « relier un dépôt existant » sera proposé par la création de projet en 48c ; il n'y a pas de lien ici.)
  - `VALIDATION` `too_many_pending` (422) : titre « Trop de tentatives en cours » ; « Plusieurs installations ont été commencées sans être terminées. Attendez 10 minutes puis réessayez. »
  - `NOT_FOUND` (installation retirée entre-temps) : titre « Cette installation n'existe plus » ; « Rechargez la page pour voir la liste à jour. » + rechargement automatique de la liste.
  - `FORBIDDEN` : même message que « non-gestionnaire », en `Alert`.
  - Autre / réseau : titre « Impossible de lancer l'installation », « Une erreur est survenue. Vérifiez votre connexion puis réessayez. »
  - URL reçue qui n'est pas `https://github.com/…` : traitée comme l'erreur « Impossible de lancer l'installation » ; aucune navigation.
- **Retour de GitHub** (`?result=`) : un seul message au-dessus de la liste, `Alert`, icône + titre + texte. `installed` en `role="status"` (Alert neutre, `check_circle`), tous les autres en `role="alert"` (Alert destructive, `warning`). La valeur est validée par `installationCallbackOutcomeSchema` ; toute autre valeur est ignorée (aucun message, aucune injection, jamais d'affichage de la valeur brute).

| `result` | Titre | Texte |
|---|---|---|
| `installed` | « Application GitHub installée » | « Le compte est relié à votre organisation. S'il reste à autoriser Koklo, utilisez le bouton « Autoriser » de la ligne. » |
| `denied` | « Installation non terminée » | « GitHub n'a pas confirmé votre accès à cette installation, ou l'autorisation a été refusée. Rien n'a été modifié. Vous pouvez recommencer. » |
| `invalid_state` | « Ce retour depuis GitHub n'est plus valable » | « Pour votre sécurité, il dure 10 minutes et ne sert qu'une fois. Relancez l'installation depuis cette page. » |
| `already_linked` | « Installation déjà utilisée » | « Cette installation GitHub est déjà reliée à une autre organisation Koklo. Utilisez un autre compte GitHub, ou contactez la personne qui l'a reliée. » |
| `not_owner` | « Seul le propriétaire du compte peut faire cette liaison » | « Vous n'êtes pas propriétaire de ce compte GitHub (pour une organisation GitHub, il faut en être administrateur). Demandez-le à un propriétaire, ou connectez-vous à GitHub avec le bon compte. » |
| `provider_error` | « GitHub n'a pas répondu comme prévu » | « Un problème est survenu pendant l'échange avec GitHub. Rien n'a été enregistré. Réessayez dans quelques minutes. » |

  Reprise de création de projet (48c) : si un marqueur de reprise valide existe dans `sessionStorage` (posé par « Autoriser Koklo » de S-projects) et que `result` vaut `installed`, le message ajoute un lien « Reprendre la création du projet « <nom> » » vers `/projects`. Aucun autre résultat n'affiche ce lien ; le marqueur n'est jamais lu pour autre chose.

  Comportement : à la lecture de `result`, le message est conservé dans l'état de la page puis le paramètre est retiré de l'URL (`/github`, sans nouvelle entrée d'historique) : un rechargement ne rejoue pas le message. Le message disparaît au prochain clic d'action (pas de minuterie). La liste est rechargée dans tous les cas (surtout `installed`).

## 5. Interactions et retours
- « Installer l'application GitHub » : `installation.start({})` ; au succès, la page navigue vers `url` (aucune URL n'est construite côté web, aucune requête vers GitHub ; vérification `https` + hôte `github.com` avant de naviguer). L'URL n'est jamais journalisée ni affichée.
- « Autoriser » / « Réautoriser » : `installation.start({ installationId })`, même navigation, une seule action en vol sur la page.
- Aucune boîte de dialogue de confirmation : l'action est réversible (on peut annuler sur GitHub) et la page de GitHub joue ce rôle.
- Au retour, le focus n'est pas déplacé de force : l'`Alert` est annoncée (`status` ou `alert`) à son apparition. Les erreurs de `start` ne déplacent pas non plus le focus, mais le bouton cliqué reste focalisable et réarmé.
- Retour au navigateur arrière depuis GitHub : la page se remet à jour (liste rechargée au montage), les boutons ne restent pas désactivés (réarmement au rechargement de la page, y compris restauration depuis le cache de navigation : écouter `pageshow` avec `persisted`).

## 6. Responsive
Sous 768 px : le h1 et le bouton « Installer l'application GitHub » s'empilent, le bouton prend toute la largeur (44 px de haut) ; les entrées sont des cartes pleine largeur, contenu empilé (compte, installation, autorisation, texte, action), boutons d'action pleine largeur de 44 px ; aucun défilement horizontal à 375 px. Dès 768 px : entrées en rangée (compte à gauche, statuts au centre, action à droite), boutons de 36 px, contenu à largeur max 896 px alignée à gauche.

## 7. Accessibilité
- Repères : `main`, h1 unique, `data-testid="github-page"`, liste `ul` avec `aria-label` « Installations GitHub » (une `li` par installation, le compte est un titre de niveau 2 visuellement normal).
- Ordre de focus : trigger, navigation, bouton « Installer l'application GitHub » (ou message puis liste en l'absence de bouton d'en-tête), message de résultat non focalisable, puis boutons de chaque ligne dans l'ordre, « Réessayer » en erreur.
- Statuts : icône + texte, jamais la couleur seule ; paires texte/fond issues des tokens `status-*` (AA ≥ 4,5:1) ; `muted-foreground` pour l'atténuation (pas d'opacité).
- Messages : `role="status"` pour le succès, le chargement et la redirection ; `role="alert"` pour les erreurs ; icône + titre + texte ; liens/boutons en vrais `button`, boutons d'icône sans libellé inexistants (tous ont du texte, `aria-label` complété par le login quand plusieurs lignes ont la même action).
- Libellés d'état `aria-busy` sur le bouton en cours ; `disabled` natif pendant la redirection.
- Clair/sombre : uniquement des tokens (`bg-card`, `text-muted-foreground`, `status-*`, `border`), aucune couleur ni icône en dur. Mouvement réduit : le squelette pulse seulement sous `motion-safe` ; aucune autre animation.
- Texte : français clair, sans « OAuth », « jeton », « callback », « SHA », « installation_id ». « Installation » et « autorisation » sont définis dans l'introduction et l'aide.

## 8. Alternatives écartées
1. **Liste de cartes (retenu)** contre `Table` : trois statuts et une action par entrée ne tiennent pas dans un tableau à 375 px sans défilement ; le nombre d'installations est faible (plafond d'états à 20). La densité du tableau n'apporte rien ici. Le tableau reste la règle pour les listes longues (membres).
2. **Page dédiée « GitHub » dans la navigation (retenu)** contre un panneau dans « Projets » : l'installation est un prérequis rare et indépendant des projets ; un panneau cacherait l'état des autorisations et le retour de GitHub aurait besoin d'une page cible fixe (`/github`, imposée par le contrat du callback).
3. **Message de résultat persistant puis paramètre retiré de l'URL (retenu)** contre toast ou message lié à l'URL : pas de toast dans le kit (inaccessible), et un message lié à l'URL réapparaîtrait au rechargement ou au partage du lien.
4. **Bouton d'installation unique par état (retenu)** contre deux boutons (en-tête et carte vide) : doublon d'action et de tabulation.
5. **Entrée de navigation masquée aux non-gestionnaires (retenu)** contre entrée visible puis refus : un lien qui mène à un refus est du bruit, surtout pour la vue client. Le message du refus direct reste, par défense.
6. **Actions « Autoriser »/« Réautoriser » par ligne (retenu)** contre un bouton global « Autoriser » : plusieurs comptes peuvent avoir des états différents.
7. **Confirmer par une boîte de dialogue avant de partir pour GitHub** écarté : GitHub demande lui-même confirmation, le kit n'a pas de `Dialog`.
8. **Afficher la valeur brute de `result`** écarté : injection de contenu et fuite d'information ; seuls les 6 résultats connus ont un message.
9. **Icône `link` pour la navigation** retenue faute d'icône GitHub dans la bibliothèque (DESIGN §4 liste `link` dans « Interface ») ; aucun logo de marque tiers ajouté.

## 9. Questions ouvertes
- Repli « relier un dépôt existant sans installer l'application » (`repo.link`) : l'écran de liaison n'existe pas avant 48c ; le message 503 n'y renvoie pas. À rediriger vers 48c.
- Suspension et désinstallation : aucun lien direct vers les paramètres GitHub n'est affiché (le contrat n'expose pas l'identifiant externe ni d'URL) ; le texte renvoie aux paramètres GitHub sans lien.
- Pas de bouton « Retirer » ou « Délier » une installation (hors contrat 0.7.0) ; à planifier si besoin.
- `installed` ne dit pas quel compte a été relié (le résultat ne porte pas d'identifiant) ; la liste rafraîchie le montre.
- Autorisation `active` mais proche de l'expiration : non distinguée (le contrat n'expose pas la date).
- Un client/business pourrait vouloir savoir si GitHub est relié : non prévu, la page leur est fermée.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-31 | TK-48 (48b) | Création : installation de l'application GitHub, autorisation utilisateur, retour de callback (6 résultats), droits, états. Détail : `.workflow/TK-48/02-design-48b.md` |
| 2 | 2026-10-31 | TK-48 (48b) | Implémentation : à l'état vide le bouton d'installation reste dans l'en-tête (la carte ne porte que titre + texte) ; captures générées (§12). |
| 3 | 2026-10-31 | TK-48 (48c) | Lien de reprise « Reprendre la création du projet » après `installed` quand un marqueur de création de projet existe (voir S-projects §5.1). |

## 11. Plan d'implémentation web (brief développeur)
Routes et garde
- `apps/web/src/app/github/layout.tsx` : `AppFrame current="GitHub"`. `page.tsx` : composant serveur, `metadata.title` « GitHub · Koklo », lit `searchParams.result` (Promise en Next 15+), le valide par `installationCallbackOutcomeSchema.safeParse` (inconnu -> `undefined`) et le passe à `<GithubPage result={…} />`.
- `lib/auth-guard.ts` : ajouter `"/github"` à `GuardedPath` et aux chemins qui exigent une organisation active. `proxy.ts` : ajouter `"/github"` au `matcher` et au commentaire (le relais `/api/github/callback` est déjà en place, `/github` est une page distincte).
- `components/app-sidebar.tsx` : entrée `{ title: "GitHub", url: "/github", icon: "link" }` ajoutée seulement si `canManage(role)` (`useActiveOrganization`), après « Membres ».

Composants (`apps/web/src/components`, tous <= 300 lignes, un fichier par composant)
- `github-page.tsx` : orchestre rôle, requête `useQuery(orpc.installation.list.queryOptions({ enabled: canManage(role) }))`, message de résultat, erreurs de `start`, mutation `useMutation(orpc.installation.start.mutationOptions())`.
- `github-installations.tsx` : liste, une entrée par installation.
- `github-status.tsx` : rendu icône + texte des statuts (tableau §3).
- `github-result-notice.tsx` : correspondance `result` -> titre/texte/variante (tableau §4).
- `github-empty.tsx` : état vide.
- `lib/github-labels.ts` (textes de statuts, résultats, erreurs) et `lib/github-redirect.ts` (validation `https` + hôte `github.com`, navigation), pour garder les composants courts et testables.
- Réutiliser : `Alert`, `AlertTitle`, `AlertDescription`, `Badge`, `StatusBadge`, `Button`, `Card`, `Icon`, `Skeleton` via `LoadingStatus`, `ErrorNotice`, `useUnauthorizedRedirect`, `GENERIC_ERROR`, `canManage`, `useActiveOrganization`. Aucun composant, icône, couleur ni police nouveau dans `@koklo/ui`.

Gestion des erreurs
- Erreurs typées lues par leur `code` (voir `lib/api-error.ts`) : `PROVIDER_UNAVAILABLE`, `VALIDATION` (`data.message === "too_many_pending"`), `NOT_FOUND`, `FORBIDDEN`.
- `router.replace("/github", { scroll: false })` après lecture de `result` ; invalider/recharger `installation.list` au montage quand `result` est présent.

Tests attendus (Red)
- Unitaires `github-labels` : un texte par statut et par résultat ; valeur inconnue ignorée.
- `auth-guard.test.ts` : `/github` sans session -> `/login`, sans organisation -> `/organizations`. `proxy.test.ts` : `/github` gardé.
- `github-page.test.tsx` : chargement (`role=status`) ; vide (un seul bouton « Installer l'application GitHub ») ; liste (chaque statut a icône + texte, jamais seulement la couleur) ; `suspended`/`deleted` sans action ; `absent` -> « Autoriser », `expired` -> « Réautoriser » avec `installationId` ; non-gestionnaire (aucun appel `installation.list`, aucun bouton) ; rôle inconnu sans message ; erreur de liste + « Réessayer ».
- Clic « Installer » : un seul appel `installation.start` même en double clic, navigation vers l'URL reçue ; URL non `https://github.com` -> erreur, pas de navigation ; chaque erreur typée (503, `too_many_pending`, `NOT_FOUND`, `FORBIDDEN`, réseau) rend son message en `role="alert"`.
- `?result=` : chacun des 6 résultats rend son message (`installed` en `status`, les autres en `alert`) ; valeur inconnue : aucun message ; paramètre retiré de l'URL ; la valeur brute n'apparaît jamais dans le DOM.
- `app-sidebar` : « GitHub » visible pour owner/admin, absent pour dev/designer/client/business et tant que le rôle est inconnu.
- `design-conformity.test.ts` (existant) : aucune couleur/icône en dur dans les nouveaux fichiers.
- e2e Playwright `github.spec.ts` (pile locale avec faux fournisseur, jamais github.com) : vide -> clic « Installer » intercepté jusqu'à l'URL générée ; retour `?result=…` pour les 6 résultats ; clair/sombre ; 375 px sans défilement horizontal ; axe sans violation (ajouter `/github` à `a11y.spec.ts`) ; mouvement réduit. Captures clair/sombre dans la PR.

## 12. Captures (générées par `apps/web/e2e/github.spec.ts`, clair et sombre)
Dossier `design/screens/captures/S-github/` : `data`, `empty`, `error`, `loading` (chacun `-light` / `-dark`), `data-mobile` (375 px), `result-<installed|denied|invalid_state|already_linked|not_owner|provider_error>-<light|dark>`, `start-unavailable-<light|dark>`, `start-too-many-<light|dark>` (25 fichiers).
