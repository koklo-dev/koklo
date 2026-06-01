# Koklo Token Optimization Plan

Ce document sert de référence de travail pour réduire fortement la consommation de tokens de Koklo sans dégrader la qualité utile. Il doit être mis à jour au fur et à mesure de l'implémentation, des mesures, et des arbitrages.

## Objectif

- Réduire le coût fixe par phase et par agent.
- Réduire le rejeu de contexte inutile.
- Réduire les verbatims réinjectés aux modèles.
- Adapter le niveau d'orchestration à la complexité réelle de la demande.
- Ajouter une instrumentation qui permet de piloter la consommation au lieu de la subir.

## État actuel

- Providers ciblés: `claude-code`, `codex-cli`, `openrouter`
- Hors cible coût: `ollama`
- Périmètre: tous les presets
- Branche de travail dédiée: à renseigner après création
- Référence projet:
  - prompts système multicouches reconstruits à chaque appel
  - historique aplati pour les providers CLI
  - boucle synthétique verbeuse côté `openrouter`
  - pas de budget tokens central
  - pas de résumé incrémental inter-phase

## Constats structurants

### 1. Coût fixe élevé par phase

- Chaque agent recharge un prompt système composite depuis les fragments `~/.koklo/agents/...`
- Taille observée des prompts agent partagés + agent:
  - `pm`: ~3313 chars
  - `architect`: ~3195 chars
  - `developer`: ~3275 chars
  - `qa`: ~2988 chars
  - `reviewer`: ~3024 chars
- Ordre de grandeur: ~750 à 830 tokens fixes par appel, hors prompt utilisateur et hors historique

### 2. Rejeu du contexte pour les providers CLI

- `claude-code` et `codex-cli` reçoivent un bloc texte aplati `[System] / [User] / [Assistant]`
- Ce design augmente la redondance et réduit l'efficacité du contexte natif

### 3. Boucle synthétique coûteuse sur `openrouter`

- Chaque tour ajoute un protocole synthétique
- Les lectures de fichiers sont réinjectées dans l'historique
- Les sorties de commandes sont réinjectées avec `stdout` et `stderr` complets
- Un tour de repair peut s'ajouter si la sortie JSON est invalide

### 4. Multiplicateur preset

- Le coût fixe est multiplié par le nombre de phases
- Ordres de grandeur du coût fixe avant travail utile:
  - `light`: ~2.2k à 2.5k tokens
  - `sdd`: ~3.8k à 4.2k tokens
  - `strict`: ~5.3k à 5.8k tokens
  - `bmad`: ~6.0k à 6.7k tokens

## Anti-patterns confirmés dans le code

- Reconstruction complète du system prompt à chaque exécution
- `memory_overrides` non exploité par le pipeline principal
- `messages.clone()` et rejeu de l'historique à chaque tour
- Flattening systématique pour `claude-code` et `codex-cli`
- Réinjection du contenu complet de `read_file`
- Réinjection de `stdout` et `stderr` complets après `run_command`
- Protocole non natif verbeux pour `user_input`
- Pas de budget tokens session / phase / tour
- Pas de résumé incrémental inter-phase
- Orchestration trop lourde pour les petites demandes

## Références code critiques

- [`crates/agent-runtime/src/system_prompt.rs`](/home/devops/RustroverProjects/koklo/crates/agent-runtime/src/system_prompt.rs:21)
- [`crates/agent-runtime/src/runtime/runner.rs`](/home/devops/RustroverProjects/koklo/crates/agent-runtime/src/runtime/runner.rs:64)
- [`crates/agent-runtime/src/synthetic_user_input.rs`](/home/devops/RustroverProjects/koklo/crates/agent-runtime/src/synthetic_user_input.rs:8)
- [`crates/providers/src/cli/mod.rs`](/home/devops/RustroverProjects/koklo/crates/providers/src/cli/mod.rs:60)
- [`crates/providers/src/cli/claude_code.rs`](/home/devops/RustroverProjects/koklo/crates/providers/src/cli/claude_code.rs:123)
- [`crates/providers/src/cli/codex.rs`](/home/devops/RustroverProjects/koklo/crates/providers/src/cli/codex.rs:173)
- [`crates/providers/src/openrouter.rs`](/home/devops/RustroverProjects/koklo/crates/providers/src/openrouter.rs:295)
- [`crates/providers/src/openrouter.rs`](/home/devops/RustroverProjects/koklo/crates/providers/src/openrouter.rs:732)
- [`crates/workflow-engine/src/lib.rs`](/home/devops/RustroverProjects/koklo/crates/workflow-engine/src/lib.rs:718)
- [`crates/workflow-engine/src/presets.rs`](/home/devops/RustroverProjects/koklo/crates/workflow-engine/src/presets.rs:140)

## Backlog priorisé

### P0

- [~] Ajouter instrumentation détaillée des coûts de prompt, historique, outils, tours
- [x] Mettre en cache `build_system_prompt()` par agent et contexte
- [x] Supprimer la réinjection complète de `read_file` dans `openrouter`
- [x] Supprimer la réinjection complète de `run_command` dans `openrouter`
- [x] Ajouter un mode `short` et un routage automatique vers `light` ou flux réduit
- [~] Ajouter un budget tokens soft/hard par session et par phase
- [x] Ajouter un handoff inter-phase compact à la place du rejeu implicite

### P1

- [x] Réduire le protocole `user_input` non natif
- [x] Réduire le prompt synthétique `openrouter`
- [x] Désactiver le reasoning visible par défaut pour les runs standard
- [x] Rendre plus déterministes les sorties PM / architect / reviewer
- [x] Transformer le routage preset en heuristique de complexité déterministe

### P2

- [x] Réviser les prompts built-in pour enlever les redondances entre agents
- [x] Étudier une voie native plus compacte pour `claude-code`
- [x] Étudier une voie native plus compacte pour `codex-cli`
- [x] Définir un mode `audit`, `patch`, `review`, `deep`

## Tableau de suivi des recommandations

| Sujet | Problème | Correction | Gain estimé | Difficulté | Priorité | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| Cache prompts système | Coût fixe relu à chaque phase | Cache par hash de contexte | 15-25% | Faible | P0 | Fait |
| Short mode / preset routing | Trop de phases pour petites tâches | Routage vers `light` ou flux réduit | 20-40% | Faible | P0 | Fait |
| `openrouter` read_file | Fichiers complets réinjectés | Résumé borné + références | 10-30% | Moyenne | P0 | Fait |
| `openrouter` run_command | `stdout/stderr` complets réinjectés | Résumé borné + artefact externe | 15-35% | Moyenne | P0 | Fait |
| Handoff inter-phase | Relecture coûteuse des artefacts | Résumé incrémental 300-600 tokens | 15-30% | Moyenne | P0 | Fait |
| Token budget | Pas de garde-fou sur les runs chers | Soft/hard budget + dégradation | Évite les extrêmes | Moyenne | P0 | En cours |
| Protocole user input | Surcoût fixe non natif | Version compacte | 3-8% | Faible | P1 | Fait |
| Prompt synthétique `openrouter` | Coût fixe répété à chaque tour | Version compacte + repair prompt réduit | 3-10% sur runs synthétiques | Faible | P1 | Fait |
| Reasoning visible | Sortie inutilement longue | Désactivation par défaut | 5-15% | Faible | P1 | Fait |
| Sorties PM / architect / reviewer | Réponses trop discursives | Contrats de sortie structurés par phase | 5-12% | Faible | P1 | Fait |
| Routage preset | Presets trop lourds choisis trop tôt | Score de complexité déterministe | 10-25% sur petites demandes | Faible | P1 | Fait |
| Prompts built-in | Consignes redondantes entre agents | Compression et factorisation | 5-15% | Moyenne | P2 | Fait |
| `claude-code` prompt transport | Flattening CLI verbeux | Sérialisation compacte prudente | 3-8% sur prompts Claude | Faible | P2 | Fait |
| `codex-cli` prompt transport | Flattening CLI encore trop verbeux | Sérialisation compacte spécifique Codex | 3-8% sur prompts Codex | Faible | P2 | Fait |
| Modes d'exécution | Même orchestration pour des intentions très différentes | Modes `patch/review/audit/deep` avec presets dédiés | 15-40% selon l'intention | Moyenne | P2 | Fait |
| Audit provider uniforme | Sessions bloquées sans signal exploitable | Probes runtime + timeouts homogènes | Évite les faux `running`, accélère le diagnostic | Moyenne | P2 | Fait |
| `codex-cli` robustesse de mesure | `app-server` peut bloquer avant tout event | Fallback auto vers `exec` | Permet de benchmarker malgré app-server instable | Moyenne | P2 | Fait |
| Worktree benchmark `codex-cli` | Sessions peuvent échouer avant l'inférence à cause du workspace Git isolé | Désactiver automatiquement le worktree dédié pour `codex-cli` avec override env | Évite les faux échecs de mesure, stabilise les runs locaux | Moyenne | P2 | Fait |
| Sandbox providers CLI natifs | Le sandbox Koklo peut bloquer l'init de session de `codex-cli` / `claude-code` | Ne pas wrapper ces providers dans un sandbox externe par défaut, avec override env | Débloque les mesures et évite les erreurs d'initialisation liées à `~/.codex` / `~/.claude` | Moyenne | P2 | Fait |
| Gates benchmark `--no-tui` | Les runs de mesure se bloquent à chaque phase en attendant `stdin` | Auto-approve des gates en `--no-tui`, override possible via env | Permet des benchmarks complets sans intervention manuelle | Faible | P2 | Fait |
| Bridge permissions Claude | `claude-code` peut échouer en non interactif si le MCP tool de permission n'est pas disponible | Désactiver automatiquement le bridge de permissions Claude en `--no-tui` / CI, avec override env | Stabilise les benchmarks Claude sans flag manuel | Faible | P2 | Fait |

## Plan sur 7 jours

### Jour 1

- Instrumenter:
  - taille des prompts système
  - taille du prompt de phase
  - taille de l'historique envoyé au provider
  - tours par agent
  - taille des résultats d'outils réinjectés

### Jour 2

- Implémenter le cache de system prompt
- Ajouter métriques `fixed_prompt_chars` et `fixed_prompt_tokens_estimated`

### Jour 3

- Remplacer les verbatims de `read_file` et `run_command` dans `openrouter`
- Borner les sorties et stocker le détail hors historique

### Jour 4

- Ajouter `mode=short|standard|deep`
- Routage automatique simple selon la complexité estimée

### Jour 5

- Ajouter un handoff inter-phase compact
- Réduire les relances de lecture d'artefacts

### Jour 6

- Compacter les prompts de protocole non natif
- Couper le reasoning visible par défaut

### Jour 7

- Rejouer 3 scénarios réels sur `claude-code`, `codex-cli`, `openrouter`
- Comparer avant / après
- Ajuster le backlog selon les mesures

## Mesures à suivre

| Métrique | Description | Statut |
| --- | --- | --- |
| `system_prompt_chars` | Taille du prompt système par agent | À instrumenter |
| `system_prompt_cache_hit` | Hit/miss du cache de prompt système | À instrumenter |
| `system_prompt_build_ms` | Temps de construction du prompt système | À instrumenter |
| `phase_prompt_chars` | Taille du prompt utilisateur de phase | À instrumenter |
| `history_chars_sent` | Taille totale envoyée au provider | À instrumenter |
| `tool_result_chars_reinjected` | Taille de contexte outil réinjecté | À instrumenter |
| `turn_count` | Nombre de tours par agent | À instrumenter |
| `repair_turn_count` | Nombre de tours de repair JSON | À instrumenter |
| `fixed_tokens_ratio` | Ratio coût fixe / coût total | À instrumenter |
| `tokens_per_preset` | Coût moyen par preset | À instrumenter |
| `tokens_per_phase` | Coût moyen par phase | À instrumenter |
| `useful_output_ratio` | Sortie utile / tokens consommés | À définir |

## Journal de mise à jour

### 2026-04-15

- Audit initial consolidé
- Document de suivi créé
- Priorités P0/P1/P2 définies
- Instrumentation initiale ajoutée:
  - `system_prompt_chars`
  - `system_prompt_tokens_estimate`
  - `system_prompt_cache_hit`
  - `system_prompt_build_ms`
  - `phase_prompt_chars`
  - `phase_prompt_tokens_estimate`
  - `turn_count`
  - `request_metrics` pour `claude-code` et `codex-cli`
  - `synthetic_request_metrics` pour `openrouter`
  - `tool_context_metrics` pour la réinjection `read_file` et `run_command` côté `openrouter`
- Validation ciblée passée:
  - `cargo test -p koklo-agent-runtime`
  - `cargo test -p koklo-providers`
  - `cargo test -p koklo-workflow-engine`
- Cache `build_system_prompt()` ajouté:
  - cache mémoire par clé dérivée de l'agent, du contexte, du daily log, des overrides mémoire, et d'un snapshot des sources
  - invalidation automatique si un fragment ou fichier source change
- Réinjection `openrouter` réduite:
  - `read_file` réinjecte maintenant un résumé + excerpt borné
  - `run_command` réinjecte maintenant un résumé + excerpts bornés pour `stdout` et `stderr`
  - les verbatims complets ne repartent plus dans l'historique modèle
- Robustesse benchmark `codex-cli` ajoutée:
  - désactivation automatique du worktree Git dédié quand `codex-cli` est utilisé dans le mix provider
  - override explicite possible via `KOKLO_DISABLE_GIT_WORKTREE=1` ou `KOKLO_FORCE_GIT_WORKTREE=1`
  - objectif: éviter les échecs `thread/start` avant même la première inférence pendant les mesures locales
- Sandbox des providers CLI natifs assoupli:
  - `codex-cli` et `claude-code-cli` ne sont plus wrappés dans un sandbox Koklo externe par défaut
  - override explicite possible via `KOKLO_WRAP_NATIVE_CLI_PROVIDER_SANDBOX=1`
  - objectif: laisser ces CLIs gérer leur propre sandbox/session sans bloquer l'écriture de leur état local
- Gates non interactifs assouplis:
  - en `--no-tui` et en CI, les phases sont approuvées automatiquement par défaut
  - override explicite possible via `KOKLO_NO_TUI_GATE_MODE=stdin`
  - objectif: permettre des runs de benchmark complets sans blocage sur `stdin`
- Bridge permissions Claude assoupli:
  - en `--no-tui` et en CI, Koklo pose automatiquement `KOKLO_DISABLE_CLAUDE_PERMISSION_BRIDGE=1`
  - override explicite possible via `KOKLO_ENABLE_CLAUDE_PERMISSION_BRIDGE=1`
  - objectif: éviter les erreurs `MCP tool koklo_permission_prompt not found` dans les runs non interactifs
- Budget tokens initial ajouté:
  - `KOKLO_TOKEN_BUDGET_SOFT` pour émettre un avertissement avant la phase suivante
  - `KOKLO_TOKEN_BUDGET_HARD` pour stopper la session avant la phase suivante
  - portée initiale: budget session
- Budget tokens étendu:
  - `KOKLO_TOKEN_BUDGET_PHASE_SOFT` pour avertir sur les reprises ou dérives d'une phase
  - `KOKLO_TOKEN_BUDGET_PHASE_HARD` pour empêcher de relancer une phase déjà hors budget dur
  - le prompt de phase bascule en `Budget mode: compact` quand le soft budget session ou phase est atteint
  - en mode compact, seuls les derniers handoffs sont listés et les consignes imposent une réponse plus courte et moins exploratoire
- Mode `short` et routage auto ajoutés au CLI:
  - `--mode auto|short|standard|deep`
- Protocole `user_input` non natif compacté:
  - format principal raccourci en `<koklo:ui>{"q":[{"q":"..."}]}</koklo:ui>`
  - compatibilité conservée avec l'ancien format `<koklo:user-input>...`
  - historique de demande/réponse utilisateur réduit pour éviter les reformulations verbeuses
- Prompt synthétique `openrouter` compacté:
  - liste d'actions conservée mais raccourcie
  - règles condensées sur une seule ligne
  - prompt de repair réduit au strict minimum
- Reasoning visible coupé par défaut dans le runtime:
  - `auto`, `short` et `standard` n'exposent plus `Reasoning` / `Plan` dans le transcript runtime
  - `deep` réactive explicitement cette visibilité
  - portée actuelle: réduction du bruit UI/transcript et du contexte stocké; une coupure provider-native reste une optimisation distincte
- Sorties `pm`, `architect`, `reviewer` rendues plus déterministes:
  - contrat de sortie injecté par phase dans le prompt orchestration
  - sections obligatoires et ordre imposé
  - réduction visée: moins de narration, plus de décisions, listes et handoff actionnable
- Routage preset rendu plus déterministe:
  - score de complexité basé sur type de pipeline, longueur, mots-clés et portée multi-partie
  - `auto` et `short` s'appuient maintenant sur une classification `small / medium / large`
  - raison du routage plus explicite avec score et signaux retenus
- Prompts built-in compactés:
  - wrappers `IDENTITY/SOUL/AGENTS/GUARDRAILS` raccourcis
  - séparateurs `---` retirés du fallback built-in et de l'assemblage du system prompt
  - objectif: réduire le coût fixe répété sans changer les responsabilités des agents
- `codex-cli` compacté:
  - nouveau flattening spécifique avec marqueurs `SYS/USR/AST`
  - fusion des tours adjacents de même rôle
  - utilisé en `exec` et `app-server` pour réduire la taille du texte transmis
- `claude-code` compacté prudemment:
  - même flattening compact `SYS/USR/AST`
  - protocole stream-json et flags sensibles conservés
  - réduction ciblée sur le payload texte envoyé au bridge Claude Code
- Modes d'exécution explicites ajoutés:
  - `patch` force un flux minimal (`light` ou `bugfix`)
  - `review` force un pipeline `test -> review`
  - `audit` force un pipeline `analysis -> security -> review`
  - `deep` conserve le preset demandé avec visibilité du reasoning
- Audit provider uniformisé dans le runtime:
  - probes transcriptées pour `session_started` et `first_event_received`
  - timeouts homogènes pour `start_session`, premier événement, et inactivité
  - variables d'environnement:
    - `KOKLO_PROVIDER_START_TIMEOUT_MS`
    - `KOKLO_PROVIDER_FIRST_EVENT_TIMEOUT_MS`
    - `KOKLO_PROVIDER_IDLE_TIMEOUT_MS`
- `codex-cli` fallback ajouté:
  - tentative `app-server` bornée par timeout
  - bascule automatique vers `codex exec` si le démarrage échoue ou time out
  - événement `session_fallback` émis pour garder la traçabilité du chemin réellement utilisé
  - `auto` downgrade `sdd/custom` vers `light` ou `bugfix` pour les petites demandes
  - `short` force un preset plus léger pour les tâches simples
  - logique purement déterministe, sans appel LLM
- Handoff inter-phase compact ajouté:
  - un fichier `*-handoff.md` est généré pour chaque phase
  - le prompt des phases suivantes préfère le handoff compact à l'artefact complet
  - objectif: réduire les relectures volumineuses d'artefacts
- Prochaine étape: compléter le budget par phase et raffiner le routing auto à partir des métriques
