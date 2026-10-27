---
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_commit: 540932a
---
# 0006 — `apps/web` : API relayée en même origine par un proxy et configuration lue à l'exécution

- **Statut** : accepté
- **Date** : 2026-10-27
- **Décideurs** : tech-lead, developer

## Contexte
TK-14 livre la connexion GitHub et la liste des projets. Le cahier des charges (§20.4) exige des images
promouvables : un même build doit servir tous les environnements. Le cookie de session Better Auth
doit aussi rester utilisable sans configuration CORS entre deux origines.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| `NEXT_PUBLIC_API_URL` figée au build | Simple | Une image par environnement, contraire à §20.4 |
| Le navigateur appelle l'API directement | Pas de relais | CORS et cookies inter-origines, URL de l'API exposée |
| Proxy Next.js (`src/proxy.ts`) vers `API_URL` lue à l'exécution | Même origine, une image | Un saut réseau de plus, la garde de session fait un appel à l'API |

## Décision
- Aucune variable `NEXT_PUBLIC_*` (test `no-public-env`). `API_URL`, `APP_ENV` et `APP_VERSION` sont lues
  côté serveur par `readRuntimeConfig` ; `output: "standalone"`.
- `src/proxy.ts` relaie `/api/auth/*` tel quel et `/api/orpc/*` (préfixe retiré) vers `API_URL`.
- La garde des pages `/login` et `/projects` interroge `/api/auth/get-session` avec les cookies de la requête ;
  toute erreur vaut « pas de session ».
- Thème clair par défaut (H-24), sombre seulement sur choix enregistré.

## Conséquences
`API_URL` doit être joignable depuis le conteneur web. Chaque navigation gardée coûte un appel à l'API.
Les écrans futurs s'ajoutent à `config.matcher` et à `GuardedPath` pour être gardés.
