#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# loop-service.sh — pilote la boucle de livraison, quel que soit son montage.
#
# FICHIER GÉNÉRÉ (propriété du framework, réécrit à chaque mise à jour).
# Appelé par les cibles `make loop-*` ; utilisable seul :
#
#   .project/make/loop-service.sh status|stop|start|restart|logs [--no-follow]
#
# La boucle peut tourner sous trois montages ; ce script les traite tous :
#   • systemd scope système  (unité posée dans /etc/systemd/system)
#   • systemd scope --user   (unité posée dans ~/.config/systemd/user)
#   • tmux                   (make loop, ou lancement manuel)
#
# Le NOM de l'unité n'est pas fixe selon l'âge du projet : on essaie
# successivement $SHIPYARD_UNIT, shipyard-deliver, shipyard-loop.
#
# Une unité systemd est GLOBALE à la machine, pas au dépôt : avant d'agir on
# vérifie donc qu'elle pilote bien CE repo (WorkingDirectory ou ExecStart sous
# $REPO_ROOT). Sans ce garde-fou, un `make loop-stop` lancé depuis n'importe
# quel dossier arrêterait la boucle d'un autre projet. $SHIPYARD_UNIT, posé
# explicitement, court-circuite la vérification.
#
# `stop` arrête le service ET désarme le timer : sans ça le timer relance la
# boucle à la prochaine échéance et l'arrêt ne tient pas.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

ACTION="${1:-status}"
FOLLOW=1
[ "${2:-}" = "--no-follow" ] && FOLLOW=0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
TMUX_SESSION="${SHIPYARD_LOOP_SESSION:-shipyard-loop-$REPO_NAME}"
LOOP_LOG="${SHIPYARD_LOOP_LOG:-$REPO_ROOT/.project/loop/loop.log}"
UNIT_CANDIDATES=(${SHIPYARD_UNIT:-} shipyard-deliver shipyard-loop)
UNIT_FORCED=0
[ -n "${SHIPYARD_UNIT:-}" ] && UNIT_FORCED=1

UNIT=""      # nom de base de l'unité, sans suffixe
SCOPE=""     # system | user | ""
FOREIGN=""   # unité trouvée mais pilotant un autre dépôt

# ── Détection ────────────────────────────────────────────────────────────────

unit_known() {  # unit_known <scope> <unit.suffix>
    local scope="$1" unit="$2"
    if [ "$scope" = user ]; then
        systemctl --user cat "$unit" >/dev/null 2>&1
    else
        systemctl cat "$unit" >/dev/null 2>&1
    fi
}

unit_property() {  # unit_property <scope> <unit.suffix> <property>
    if [ "$1" = user ]; then
        systemctl --user show -p "$3" --value "$2" 2>/dev/null
    else
        systemctl show -p "$3" --value "$2" 2>/dev/null
    fi
}

# Une unité systemd est globale à la machine : sans cette vérification, un
# `stop` lancé depuis un autre dossier arrêterait la boucle d'un autre projet.
unit_drives_this_repo() {  # unit_drives_this_repo <scope> <unit>
    local scope="$1" unit="$2" workdir exec_line
    workdir="$(unit_property "$scope" "$unit.service" WorkingDirectory)"
    [ "$workdir" = "$REPO_ROOT" ] && return 0
    exec_line="$(unit_property "$scope" "$unit.service" ExecStart)"
    case "$exec_line" in
        *"$REPO_ROOT"/*) return 0 ;;
    esac
    return 1
}

detect_unit() {
    local candidate scope
    for candidate in "${UNIT_CANDIDATES[@]}"; do
        [ -n "$candidate" ] || continue
        candidate="${candidate%.service}"
        candidate="${candidate%.timer}"
        for scope in user system; do
            unit_known "$scope" "$candidate.service" || unit_known "$scope" "$candidate.timer" || continue
            if [ "$UNIT_FORCED" = 1 ] || unit_drives_this_repo "$scope" "$candidate"; then
                UNIT="$candidate"
                SCOPE="$scope"
                return 0
            fi
            [ -n "$FOREIGN" ] || FOREIGN="$candidate ($scope) → $(unit_property "$scope" "$candidate.service" WorkingDirectory)"
        done
    done
    return 1
}

warn_foreign_unit() {
    [ -n "$FOREIGN" ] || return 0
    echo "ℹ️  unité systemd ignorée, elle pilote un autre dépôt : $FOREIGN"
    echo "    (forcer malgré tout : SHIPYARD_UNIT=<nom> make <cible>)"
}

# systemctl avec le bon scope, et sudo quand l'unité est système et qu'on ne
# l'est pas — plutôt qu'un « Access denied » nu.
sc() {
    if [ "$SCOPE" = user ]; then
        systemctl --user "$@"
    elif [ "$(id -u)" = 0 ]; then
        systemctl "$@"
    else
        sudo systemctl "$@"
    fi
}

jc() {
    if [ "$SCOPE" = user ]; then
        journalctl --user "$@"
    elif [ "$(id -u)" = 0 ]; then
        journalctl "$@"
    else
        sudo journalctl "$@"
    fi
}

tmux_running() {
    command -v tmux >/dev/null 2>&1 && tmux has-session -t "$TMUX_SESSION" 2>/dev/null
}

# ── Actions ──────────────────────────────────────────────────────────────────

# `systemctl is-active` sort en non-zéro dès que l'état n'est pas « active »
# (inactive, activating, failed…) tout en imprimant l'état : sans passer par une
# substitution, le `|| echo` de repli ajouterait une seconde ligne parasite.
unit_state() {  # unit_state <unit.suffix> <property>
    local value
    value="$(sc "$2" "$1" 2>/dev/null)"
    printf '%s' "${value:-absent}"
}

do_status() {
    echo "── boucle"
    jq -r '(.loop // {}) |
        "  statut : \(.status // "?")   issue courante : \(.current_issue // "-")   sprint : \(.current_iteration.title // "-")",
        "  blocages : \((.blockers // []) | length)   escalades : \((.escalated_issues // []) | unique | length) issue(s)   pause : \(.paused_reason // "non")"' \
        "$REPO_ROOT/.project/state.json" 2>/dev/null \
        || echo "  (state.json illisible)"
    echo "  détail : jq .loop .project/state.json"
    echo "── montage"
    if [ -n "$UNIT" ]; then
        printf '  systemd (%s) : %s\n' "$SCOPE" "$UNIT"
        printf '    service : %s\n' "$(unit_state "$UNIT.service" is-active)"
        printf '    timer   : %s / %s\n' \
            "$(unit_state "$UNIT.timer" is-active)" \
            "$(unit_state "$UNIT.timer" is-enabled)"
        sc list-timers "$UNIT.timer" --no-pager 2>/dev/null \
            | awk 'NR == 2 && NF >= 5 { printf "    prochain run : %s %s %s (dans %s)\n", $2, $3, $4, $5 }'
    else
        echo "  ⚪ aucune unité systemd pour ce dépôt (essayés : ${UNIT_CANDIDATES[*]})"
        warn_foreign_unit
    fi
    if tmux_running; then
        echo "  ✅ session tmux '$TMUX_SESSION' active"
    else
        echo "  ⚪ pas de session tmux '$TMUX_SESSION'"
    fi
}

do_stop() {
    local stopped=0
    if [ -n "$UNIT" ]; then
        echo "→ arrêt de $UNIT ($SCOPE)"
        sc stop "$UNIT.timer" 2>/dev/null
        sc disable "$UNIT.timer" 2>/dev/null
        sc stop "$UNIT.service" 2>/dev/null
        echo "  ✅ service arrêté et timer désarmé — la boucle ne repartira pas toute seule"
        echo "     (un run en cours est interrompu ; la reprise repart de l'issue courante)"
        stopped=1
    fi
    if tmux_running; then
        tmux kill-session -t "$TMUX_SESSION" && echo "  ✅ session tmux '$TMUX_SESSION' tuée"
        stopped=1
    fi
    if [ "$stopped" != 1 ]; then
        echo "ℹ️  rien à arrêter : ni unité systemd ni session tmux pour ce dépôt"
        warn_foreign_unit
    fi
}

do_start() {
    if [ -n "$UNIT" ]; then
        echo "→ démarrage de $UNIT ($SCOPE)"
        sc enable "$UNIT.timer" 2>/dev/null
        sc start "$UNIT.timer" 2>/dev/null
        # --no-block : le service est Type=oneshot, donc sans lui `systemctl start`
        # n'imprime rien et attend la FIN du run — des heures — avant de rendre la
        # main. Le run appartient à systemd, pas au terminal : il survit au Ctrl-C
        # comme à la fermeture du terminal (vérifié sur systemd 255 — un SIGINT sur
        # le client laisse l'unité en « activating »). Le défaut est donc trompeur
        # plutôt que destructeur, et c'est bien le problème : rien ne distingue « la
        # boucle tourne en arrière-plan » d'un process au premier plan qu'il faudrait
        # garder ouvert, ce qui pousse à croire qu'on doit laisser la session ouverte.
        sc start --no-block "$UNIT.service" || {
            echo "  ❌ démarrage refusé par systemd — make loop-status / make loop-logs"
            return 1; }
        echo "  ✅ timer réarmé, run lancé en arrière-plan — logs : make loop-logs"
        return 0
    fi
    echo "ℹ️  aucune unité systemd pour ce dépôt — montage tmux : make loop"
    warn_foreign_unit
    return 1
}

do_restart() {
    if [ -n "$UNIT" ]; then
        echo "→ redémarrage de $UNIT ($SCOPE)"
        sc enable "$UNIT.timer" 2>/dev/null
        sc restart "$UNIT.timer" 2>/dev/null
        # Même raison que dans do_start : sans --no-block, `restart` attend la fin du
        # nouveau run avant de rendre la main.
        sc restart --no-block "$UNIT.service" || {
            echo "  ❌ redémarrage refusé par systemd — make loop-status / make loop-logs"
            return 1; }
        echo "  ✅ relancé en arrière-plan — logs : make loop-logs"
        return 0
    fi
    if tmux_running; then
        tmux kill-session -t "$TMUX_SESSION"
        echo "→ session tmux tuée ; relancez avec : make loop"
        return 0
    fi
    echo "ℹ️  rien à redémarrer — make loop (tmux) ou installez le service (docs/REMOTE.md §3)"
    warn_foreign_unit
    return 1
}

do_logs() {
    local follow=()
    [ "$FOLLOW" = 1 ] && follow=(-f)
    if [ -n "$UNIT" ]; then
        jc -u "$UNIT.service" -n 100 -o cat "${follow[@]}"
        return $?
    fi
    if [ -f "$LOOP_LOG" ]; then
        tail -n 100 "${follow[@]}" "$LOOP_LOG"
        return $?
    fi
    echo "ℹ️  ni unité systemd pour ce dépôt, ni $LOOP_LOG"
    warn_foreign_unit
    return 1
}

detect_unit || true

case "$ACTION" in
    status)  do_status ;;
    stop)    do_stop ;;
    start)   do_start ;;
    restart) do_restart ;;
    logs)    do_logs ;;
    *)
        echo "usage: loop-service.sh status|stop|start|restart|logs [--no-follow]" >&2
        exit 2
        ;;
esac
