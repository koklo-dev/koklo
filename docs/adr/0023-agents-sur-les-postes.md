---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-27
covers_commit: 36d17672
---
# 0023 — Faire tourner les agents de code sur les postes et retirer leur exécution de Koklo

- **Statut** : accepté le 2026-11-27 (TK-130) ; applique la décision du 06/11/2026 et remplace l'ADR 0014
- **Date** : 2026-11-27
- **Décideurs** : Brice (décision du 06/11/2026), developer (ticket TK-130)

## Contexte
La décision du 06/11/2026 (`docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1) l'emporte sur la conception antérieure :

1. Koklo n'exécute aucun agent de code. L'agent tourne sur le poste d'un membre de l'équipe, avec l'outil de son choix (Claude Code, Codex, Cursor, autre).
2. L'agent parle à Koklo par le MCP Koklo et le CLI `koklo` : il prend un ticket, reçoit sa tranche de spec, remonte son avancement et le résultat des étapes.
3. La clé d'IA de l'organisation ne sert qu'au travail en ligne de Koklo, jamais aux jetons d'un agent de code.
4. Les contrôles qui font foi tournent en CI, et la revue humaine reste obligatoire pour fusionner.
5. Un exécuteur dans le cloud pourra s'ajouter plus tard, en option ; il n'est pas dans la vision actuelle.

`packages/delivery` portait alors trois ensembles : la machine d'étapes pure (TK-72), la détection des quotas du fournisseur (TK-74), et le port d'exécution d'une session d'agent avec son adaptateur en sous-processus (TK-73, ADR 0014). Aucune application ni aucun paquet n'en dépendait, et aucun runner ni triage n'était codé. La remontée `ticket.progress` (« étape courante du workflow, message court », passation 17 §3) reste à construire.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Retirer l'exécution et les quotas, garder la machine d'étapes pure | Plus aucune surface d'exécution ; paquet sans dépendance d'exécution ; la machine reste disponible pour `ticket.progress` | La machine reste sans appelant jusqu'au lot 12 ; un futur exécuteur cloud sera à réécrire |
| B. Garder l'adaptateur dormant pour un futur exécuteur cloud | Code déjà écrit et testé | Code mort à maintenir ; surface d'exécution de processus conservée, contraire au point 1 ; options du CLI qui vieillissent sans contrôle |
| C. Supprimer le paquet `delivery` entier | Moins de code | Perd la machine d'étapes, utile à `ticket.progress`, et ses tests d'incidents |

## Décision
Option A (en cas de doute, on garde la machine).

- **Retirés** : le port d'exécution, son faux et sa suite de conformité, l'adaptateur en sous-processus, la détection et l'attente des quotas du fournisseur, avec leurs erreurs et leurs tests.
- **Gardée** : la machine d'étapes, 13 fichiers de `packages/delivery/src` (`run*`, `block-cause`, `errors`, `one-of`, `value-check`, `index`), sans entrée-sortie. Son comportement et son API ne changent pas ; l'événement `quota_hit` et la cause de blocage `quota` restent. Ses effets (`start_dev`, `open_pr`…) décrivent une étape : Koklo n'en exécute aucun. Son adéquation aux sept étapes de la maquette 23 sera jugée par le lot 12c.
- **Paquet** : plus de dépendance d'exécution, export `.` seul ; son étiquette dans `turbo.json` et ses seuils de couverture sont inchangés.
- **Garde en CI** : le test `incident-25-agent-runtime-boundary` garde son nom et n'autorise plus aucun adaptateur : aucune invocation d'outil d'agent dans `packages/*/src` ni `apps/*/src`, `node:child_process` réservé à deux aides de test de `packages/db`, aucune dépendance `@anthropic-ai/claude-*` dans un `package.json`.

## Conséquences
- Koklo n'a plus à héberger, isoler ni budgéter de sessions d'agent de code, et n'a aucune clé à leur confier.
- Le MCP Koklo et le CLI `koklo` sont à construire (TK-63 à TK-65, lot 12 ; outils `ticket.*` et serveur MCP avec TK-131 et TK-69). Le titulaire « runner » des baux et du journal d'audit est retiré par TK-131 ; ce ticket ne touche ni au schéma ni aux migrations.
- Les gestes humains liés au CLI d'agent deviennent sans objet : l'essai manuel de TK-73 et la capture d'un message de quota de TK-74.
- Les incidents 22 (quota confondu avec une spec ambiguë ou compté comme essai) et 26 (chaque exécutant redécouvrait la limite) n'ont plus de code : la détection et l'attente partagée sont retirées. La machine garde `quota_hit` neutre.
- Un exécuteur cloud demandera un nouvel ADR et passera par le même protocole MCP.
- La garde par motifs est un filet, pas une preuve : un lancement indirect (binaire ou chemin construit) peut lui échapper.

## Preuves
- Recherche `git grep` avant suppression (2026-11-27) : aucune application ni aucun paquet ne dépendait de `@koklo/delivery` ; aucun fichier gardé n'importait un fichier retiré.
- `vitest run --coverage` sur les 14 fichiers de test gardés de `packages/delivery` : 550 tests réussis, couverture 100 % ; typecheck du paquet et `pnpm lint` (dont `turbo boundaries`) verts.
- Détail : `docs/changelog/reports/2026-11-27-TK-130.md`.
