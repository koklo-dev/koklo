---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: 99e638a
---
# 0014 — Port AgentRuntime et adaptateur Claude Code en sous-processus

- **Statut** : proposé (ticket TK-73 : lot 73a port, faux et suite de conformité ; lot 73c adaptateur Claude Code et frontière ; effectif à la fusion de la PR unique du ticket)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-73, lots 73a et 73c)

## Contexte
La boucle de livraison (TK-75/76) doit lancer des sessions d'agent (développeur, relecteur, rédacteur de doc…) dans un worktree git. L'incident 25 a montré le risque : un appel à l'outil d'agent éparpillé dans le code contourne le budget, la redaction des secrets et la politique d'outils. Le critère d'acceptation de TK-73 exige donc **une seule porte** vers l'outil d'agent, vérifiée en CI. Le cœur de `packages/delivery` reste pur (pas d'I/O, aucune dépendance tierce).

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Port `AgentRuntime` pur dans le cœur + adaptateur qui lance le CLI `claude -p` en sous-processus, dans `src/claude-code/` | Aucune dépendance nouvelle ; budget, outils, environnement et mise à mort entièrement sous notre contrôle ; testable avec un faux exécutable | Dépend du format `stream-json` et des options du CLI (version à surveiller) |
| B. SDK `claude-agent-sdk` | API typée, moins de code de lecture de flux | Nouvelle dépendance tierce lourde ; elle embarque le même CLI ; le contrôle fin (groupe de processus, environnement en liste blanche, plafond de sortie) est moins direct ; exigerait un ADR de framework dédié |
| C. Appeler le CLI depuis chaque module qui en a besoin | Rapide | C'est exactement l'incident 25 |

## Décision
Option A. **Écart assumé du SDK** `claude-agent-sdk` : écarté, car c'est une dépendance nouvelle sans gain de sécurité par rapport au CLI déjà exigé pour l'abonnement.

- **Port** (cœur pur) : `AgentRuntime { id, launchSession(request) }`, une session = une promesse = un résultat typé (`completed | failed | timeout | aborted | quota`), sortie toujours `Untrusted("model-output")`, budget obligatoire, clé opaque, garde unique `assertSessionRequest`. Détail dans `architecture.md`.
- **Adaptateur** `packages/delivery/src/claude-code/`, exporté par `@koklo/delivery/claude-code` (hors de l'index public), **seul** à importer `node:child_process`, `node:fs` et `node:path`. Découpage : `command.ts` (argv figé et règles d'outils), `environment.ts` (liste blanche), `redact.ts`, `classify.ts` (quota, authentification), `worktree.ts` (`realpath` sous une racine autorisée), `stream.ts` (lecture ligne à ligne), `process.ts` (spawn et mise à mort), `outcome.ts` (issue -> résultat), `runtime.ts` (`ClaudeCodeRuntime`).
- **Lancement** : `spawn` **sans shell**, argv en tableau, `detached` (groupe de processus propre), prompt utilisateur par **stdin** (jamais en argv). Option figée : `-p --output-format stream-json --verbose --no-session-persistence --strict-mcp-config --permission-mode dontAsk --permission-prompts none --max-budget-usd … --append-system-prompt … --allowedTools … --disallowedTools …`. Jamais le contournement des permissions, `--add-dir`, `--max-turns` ni `--mcp-config`.
- **Outils** : la politique abstraite du rôle est traduite en règles (lecture, écriture bornée à `writablePaths`, vérifications `pnpm`/`git` sans `push` pour le développeur, ni réseau ni MCP, `.env*` illisible).
- **Environnement** : liste blanche (`PATH`, `HOME`, `LANG`…) ; aucun secret du parent n'est hérité ; la clé opaque devient `ANTHROPIC_API_KEY` du fils seul ; `HOME` est hérité pour le login d'abonnement.
- **Fin de session** : délai écoulé ou annulation -> SIGTERM au groupe, puis SIGKILL après `killGraceMs` (petit-fils compris) ; plafond dur de sortie `HARD_OUTPUT_FACTOR = 20` x `maxOutputChars` -> groupe tué, `failed/budget_exceeded` ; tout ce qui sort est redigé (`redactSecrets`) puis borné.
- **Erreurs** : authentification refusée -> `AgentAuthError` ; exécutable absent -> `AgentRuntimeUnavailableError`, sans chemin ni clé ; un quota n'est jamais un échec (`classifyClaudeFailure`, aucune formulation « limit » seule ; la table exhaustive est TK-74).
- **Frontière vérifiée en CI** (test `incident-25-agent-runtime-boundary`) : aucune source de `packages/*/src` ni `apps/*/src` hors `src/claude-code/` ne contient d'invocation de l'outil d'agent (binaire, options d'outils, format de flux, contournement des permissions, SDK) ; le cœur ne référence pas l'adaptateur (test de pureté) ; la fonction de scan est testée sur des fixtures violantes.
- **Bac à sable** : non imposé ici. Le crochet `wrapCommand(spec) => spec` laisse un futur adaptateur de sandbox (bwrap, conteneur) envelopper la commande sans toucher au reste.

## Conséquences
- Le runner ne dépend que du port ; ajouter un autre moteur d'agent = un autre dossier d'adaptateur passant la même suite de conformité (14 cas).
- Le vrai CLI n'est jamais lancé en CI : les tests utilisent un faux exécutable scripté.
- Un changement de version du CLI peut casser la lecture du flux : l'essai manuel décrit dans `quality-and-operations.md` sert de contrôle.

### Limites assumées
- **Isolation réelle hors TK-73** : aucun conteneur ni utilisateur dédié ; le processus tourne avec les droits de l'utilisateur du runner. Les règles d'outils et la liste blanche d'environnement réduisent la surface, elles ne remplacent pas une isolation. Suite prévue avec `wrapCommand`.
- **Injection de prompt** : non éliminée. Elle est contenue par le cadrage des données non fiables (ADR 0011), les outils restreints par rôle, l'absence de réseau et de MCP, et la sortie traitée comme donnée non fiable validée par un humain avant effet.
- La redaction repose sur des motifs connus et sur la clé fournie : un secret d'un autre format dans la sortie n'est pas masqué.
- Le ramasse-miettes du groupe de processus suppose l'absence de réutilisation de l'identifiant de groupe pendant les millisecondes qui suivent la fin du fils.
- Le format exact des messages de limite d'usage du CLI réel reste à capturer (TK-74).

## Preuves
`pnpm --filter @koklo/delivery test` : suites `test/claude-code/*` (argv figés par rôle, environnement, secrets, cycle de vie, quota, worktree, conformité), `incident-25-agent-runtime-boundary`, `purity`.
