#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# happy-pilot.sh — ouvre une session Claude Code pilotable depuis le mobile
# (Happy) pour SURVEILLER et DÉBLOQUER la boucle de livraison shipyard.
#
# Montage hybride, volontaire :
#   • systemd (ou tmux, voir docs/REMOTE.md §3) exécute la boucle H24 ;
#   • cette session sert à diagnostiquer et débloquer, jamais à exécuter la
#     boucle elle-même. Elle n'arrête ni ne démarre le service.
#
# Elle est enveloppée dans tmux : sans ça, fermer le SSH la tuerait.
#
# Usage :  bash .project/loop/happy-pilot.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
SESSION="shipyard-pilot-${REPO_NAME}"

# Où vit la boucle est un choix de déploiement : le scope (--user, recommandé
# par docs/REMOTE.md §3, ou système quand le VPS tourne en root) ET le nom de
# l'unité varient. make/loop-service.sh résout déjà les deux dans cet ordre ;
# n'en coder qu'un ici faisait annoncer « absent » sur un déploiement
# parfaitement sain — à quelqu'un en train de diagnostiquer depuis son mobile.
UNIT=""
SCOPE=""
for candidate in ${SHIPYARD_UNIT:-} shipyard-deliver shipyard-loop; do
    if systemctl --user cat "$candidate.service" >/dev/null 2>&1; then
        UNIT="$candidate"; SCOPE=user; break
    elif systemctl cat "$candidate.service" >/dev/null 2>&1; then
        UNIT="$candidate"; SCOPE=system; break
    fi
done

# `systemctl is-active` ÉCRIT son verdict puis sort non-zéro quand l'unité
# n'est pas active : chaîner les deux scopes avec `||` imprimait donc les deux
# réponses l'une après l'autre, plus le « absent » final, et la bannière
# affichait trois lignes collées. Le scope étant résolu plus haut, une seule
# interrogation suffit.
unit_state() {  # unit_state <suffixe> <verbe>
    local out=''
    case "$SCOPE" in
        user)   out="$(systemctl --user "$2" "$UNIT.$1" 2>/dev/null)" ;;
        system) out="$(systemctl "$2" "$UNIT.$1" 2>/dev/null)" ;;
    esac
    printf '%s' "${out:-absent}"
}

printf '\n\033[1m── Session de pilotage Happy\033[0m\n'
if [ -n "$UNIT" ]; then
    printf '   Service %s : %s   |   Timer : %s\n' \
        "$UNIT" "$(unit_state service is-active)" "$(unit_state timer is-enabled)"
else
    printf '   Aucune unité systemd shipyard installée (boucle en tmux, ou à la main)\n'
fi
cat <<'EOF'
   Si la boucle tourne (systemd ou tmux), cette session ne l'interrompt pas.
   Détacher sans tuer : Ctrl-b puis d
   Revenir            : tmux attach -t <nom-de-session>
EOF

# Le contexte est passé en prompt initial pour que l'agent n'ait pas à
# redécouvrir le montage à chaque session — et surtout pour qu'il connaisse les
# ressources que la boucle possède et auxquelles il ne doit pas toucher.
PROMPT='Tu pilotes la boucle de livraison shipyard de ce projet depuis mon mobile.

La boucle possede git, les worktrees .worktrees/issue-N, les branches feat/N et
le bloc .loop de .project/state.json. NE MODIFIE JAMAIS ces ressources pendant
quun run est en cours : tu corromprais son etat. Verifie dabord si elle tourne
(systemctl --user is-active '"${UNIT:-shipyard-loop}"'.service, ou systemctl is-active si le
service est installe en scope systeme, ou un tmux/agent-loop.sh en tache de
fond).

Ton role est de diagnostiquer et de debloquer :
- etat : jq .loop .project/state.json  et  journalctl --user -u '"${UNIT:-shipyard-loop}"' -n 50 -o cat
  (ou sans --user si le service est en scope systeme)
- raisonnement des agents : les transcripts JSONL dans
  ~/.claude/projects/<repo-slug>--worktrees-issue-N/
- escalades : gh issue list --label status:blocked, puis lire le commentaire
  descalade qui porte la cause et la remediation
- remise en file dune issue corrigee : label status:todo ET statut Todo sur le
  Project v2 GitHub associe — le board fait autorite, pas le label seul

La procedure complete est dans docs/REMOTE.md et docs/PLAN.md §9, lis-les avant
dagir si besoin.

Commence par me faire un point : run en cours ou non, issue traitee, escalades
en attente, et ce qui merite mon attention.'

cd "$REPO_ROOT" || exit 1

# --permission-mode est obligatoire ici, il ne s'agit pas d'une préférence.
# Happy démarre par défaut en « yolo », qu'il traduit en --dangerously-skip-permissions
# lorsqu'il relance Claude via le SDK au premier message venu du mobile. Or Claude
# Code refuse ce drapeau sous root : le process sort en code 1 et l'application
# affiche « process exited unexpectedly ». La session locale, elle, ne reçoit pas
# le drapeau — d'où une panne qui n'apparaît qu'en pilotage mobile (trace :
# `[remote]: launch error` dans ~/.happy/logs/<session>.log). Si le VPS ne tourne
# pas en root, ce garde-fou est inoffensif : il ne fait que basculer les
# commandes hors allowlist vers une confirmation sur le téléphone, ce qui est
# précisément le but du pilotage à distance.
exec tmux new-session -A -s "$SESSION" \
    "happy --permission-mode default $(printf '%q' "$PROMPT")"
