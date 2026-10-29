---
doc_version: 0.2.0
status: draft
last_reviewed: 2026-10-29
covers_commit: 7f97066
---
# 0008 — `/organizations` est la porte d'entrée sans organisation, et la garde web lit la session (`hasSession`, `hasActiveOrganization`)

- **Statut** : accepté
- **Date** : 2026-10-29
- **Décideurs** : product-owner, designer, developer (ticket TK-24)

## Contexte
[ADR 0006](0006-web-same-origin-proxy-runtime-config.md) garde `/login` et `/projects` par un appel à
`/api/auth/get-session` : « toute erreur vaut pas de session ». Depuis TK-11 l'API exige une organisation
active ; un utilisateur connecté sans organisation recevait `UNAUTHORIZED` sur `/projects`, la page le renvoyait
vers `/login`, et `/login` le renvoyait vers `/projects` (boucle, lacune G1 de l'analyse TK-24). Il fallait un
écran de sortie et une règle de redirection qui distingue « pas de session » de « pas d'organisation active ».

## Options considérées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| Garder « UNAUTHORIZED vers /login » | Aucun changement | Boucle `/login` ↔ `/projects` pour toute session sans organisation |
| Créer l'organisation par défaut côté API | Pas d'écran | Hors périmètre (`apps/api` intouché), décision produit non prise |
| Garde fondée sur la session (`hasSession`, `hasActiveOrganization`) et écran `/organizations` | Pas de boucle, un seul point de décision pur et testable | Le proxy lit un champ de plus de la session (`activeOrganizationId`) |

## Décision
- `readSession` (`apps/web/src/lib/session.ts`) rend `{ hasSession, hasActiveOrganization }` à partir de
  `/api/auth/get-session` (`session.activeOrganizationId` non vide) ; toute erreur vaut « pas de session ».
- `resolveAccess` (`apps/web/src/lib/auth-guard.ts`, fonction pure) : sans session, tout chemin gardé mène à `/login` ;
  avec session, `/login` mène à `/projects`, `/projects` et `/members` sans organisation active mènent à `/organizations` ;
  `/organizations` n'est jamais redirigé quand une session existe. Seule l'absence de session mène à `/login`.
- `proxy.ts` garde `/login`, `/projects`, `/members`, `/organizations`.
- Côté client, `redirectForError` / `useUnauthorizedRedirect` : sur `UNAUTHORIZED`, la session est revérifiée
  (`authClient.getSession()`) ; perdue vers `/login`, présente vers `/organizations`.
- `/organizations` est un écran plein page hors gabarit : 0 organisation, formulaire de création ; 1 organisation,
  ouverture automatique si aucune n'est active ; 2 ou plus, liste à choisir. Ouvrir = `authClient.organization.setActive`.

## Conséquences
- Tout nouvel écran protégé s'ajoute à `GuardedPath`, à `resolveAccess` et à `config.matcher`, et dit s'il exige une organisation active.
- Chaque navigation gardée coûte toujours un appel à l'API (inchangé par rapport à l'ADR 0006).
- L'API reste l'autorité : la garde web n'est qu'une redirection de confort.

## Preuves
- `apps/web/test/auth-guard.test.ts`, `session.test.ts`, `proxy.test.ts`.
- `e2e/tests/organizations.spec.ts` (pile réelle) : C1 (session sans organisation, `/projects` renvoie vers `/organizations`, création puis projet),
  G1 (pas de boucle `/login` ↔ `/projects`), C1.d (sans session, trois pages vers `/login`). 5 e2e verts selon `.workflow/TK-24/05-refactor.md`.
