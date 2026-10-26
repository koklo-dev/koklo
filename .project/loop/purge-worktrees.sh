#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# purge-worktrees.sh — récupère l'espace disque laissé par la boucle.
#
# La boucle supprime déjà son worktree sur CHAQUE chemin de sortie de
# process_issue_dev / process_issue_review / doc_pass. Ce script ne double pas
# ce travail : il ramasse ce qu'un run TUÉ ne peut par construction pas nettoyer
# — SIGKILL, timeout du service systemd, reboot, session interrompue. Sans lui
# .worktrees/ ne fait que croître (chaque worktree porte l'arbre complet du
# monorepo, plus les node_modules installés par les gates locaux).
#
# Il purge aussi les branches locales dont la remote a disparu : GitHub supprime
# la branche au merge (deleteBranchOnMerge), mais la référence locale et son
# `origin/<branche>` obsolète survivent indéfiniment dans le clone.
#
# Sûreté — un worktree n'est JAMAIS supprimé s'il porte du travail non sauvegardé :
#   • fichiers modifiés / non commités
#   • commits absents de sa remote (et absents de la base)
#   • merge/rebase/cherry-pick en cours
#   • un processus vivant y a son répertoire courant
#   • activité de moins de $MAX_AGE_MIN minutes (une phase en cours)
# Chaque cas est journalisé avec sa raison, jamais silencieusement ignoré.
#
# Usage :
#   .project/loop/purge-worktrees.sh [--dry-run] [--quiet] [--force] [--age MIN]
#
#   --dry-run   n'affiche que ce qui serait supprimé
#   --quiet     n'affiche que les suppressions effectives (mode boucle)
#   --force     supprime aussi les worktrees porteurs de travail non poussé
#               (le refus par défaut est intentionnel : ce travail est perdu)
#   --age MIN   ancienneté minimale d'inactivité, en minutes (défaut : 120,
#               ou $SHIPYARD_WT_MAX_AGE_MIN)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# Toujours l'arbre PRINCIPAL, jamais celui d'où l'on est lancé : `git rev-parse
# --show-toplevel` depuis un worktree renvoie ce worktree, et le script se
# supprimerait alors le sol sous les pieds. Le premier enregistrement de
# `worktree list` est le worktree principal, par définition de git.
REPO_ROOT="$(git worktree list --porcelain | awk '/^worktree /{sub("^worktree ",""); print; exit}')"
[ -n "$REPO_ROOT" ] || { echo "dépôt git introuvable" >&2; exit 1; }
BASE="${SHIPYARD_BASE:-develop}"
# Référence de base résolue une fois. `origin/$BASE` fait autorité — la copie
# locale peut être en retard, et juger « déjà dans la base » sur une base
# périmée détruirait du travail. Sans remote (clone hors ligne, dépôt purement
# local) on se rabat sur la branche locale. Si aucune des deux n'existe, rien
# n'est jugeable : le script ne supprime alors PLUS RIEN, il ne devine pas.
BASE_REF=""
if git -C "$REPO_ROOT" rev-parse --verify -q "refs/remotes/origin/$BASE" >/dev/null; then
    BASE_REF="origin/$BASE"
elif git -C "$REPO_ROOT" rev-parse --verify -q "refs/heads/$BASE" >/dev/null; then
    BASE_REF="$BASE"
fi
MAX_AGE_MIN="${SHIPYARD_WT_MAX_AGE_MIN:-120}"
DRY_RUN=0
QUIET=0
FORCE=0

# La boucle sérialise toute création/suppression de worktree sur ce verrou
# (_with_lock dans agent-loop.sh). S'en passer exposerait à purger un worktree
# qu'un worker est en train de créer. Ré-exécution sous flock, une seule fois —
# avant l'analyse des options, tant que "$@" est encore intact.
if [ "${SHIPYARD_PURGE_LOCKED:-0}" != 1 ] && command -v flock >/dev/null 2>&1; then
    mkdir -p "$REPO_ROOT/.project" 2>/dev/null
    export SHIPYARD_PURGE_LOCKED=1
    exec flock "$REPO_ROOT/.project/.git.lock" "$0" "$@"
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        --quiet)   QUIET=1 ;;
        --force)   FORCE=1 ;;
        --age)     MAX_AGE_MIN="${2:-$MAX_AGE_MIN}"; shift ;;
        -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
        *) echo "option inconnue : $1" >&2; exit 2 ;;
    esac
    shift
done

log()  { [ "$QUIET" = 1 ] || echo "── $*"; }
act()  { echo "── $*"; }   # toujours affiché : une suppression est une trace

removed_wt=0
removed_br=0
freed_kb=0

# ─── Le répertoire courant d'un processus vivant vaut occupation ─────────────
# Une session Claude, un `pnpm test`, un shell ouvert dans le worktree : le
# supprimer sous les pieds d'un processus casse ce processus. /proc est la seule
# source fiable ici (lsof/fuser ne sont pas garantis présents sur l'hôte).
path_in_use() {  # path_in_use <dir>
    local dir="$1" p target
    [ -d /proc ] || return 1
    for p in /proc/[0-9]*; do
        target="$(readlink "$p/cwd" 2>/dev/null)" || continue
        case "$target" in "$dir"|"$dir"/*) return 0 ;; esac
    done
    return 1
}

# ─── Normalisation des compteurs ─────────────────────────────────────────────
# Une sortie non numérique (git en échec, `gh` bidonné ou hors ligne, JSON
# inattendu) rendrait `[ "$x" -gt 0 ]` faux ET renverrait 2 : le garde-fou
# sauterait, et la suppression aurait lieu. On force donc l'inconnu vers la
# valeur PRUDENTE, propre à chaque appelant.
as_count() {  # as_count <valeur> <défaut-si-illisible>
    case "$1" in ''|*[!0-9]*) echo "$2" ;; *) echo "$1" ;; esac
}

# ─── Activité récente = phase probablement en cours ──────────────────────────
# node_modules et .git sont écartés du parcours : ils dominent le nombre de
# fichiers et leur mtime ne dit rien du travail de l'agent.
recently_active() {  # recently_active <dir>
    local dir="$1" hit
    hit="$(find "$dir" \( -name node_modules -o -name .git \) -prune -o \
             -newermt "-${MAX_AGE_MIN} minutes" -print -quit 2>/dev/null)"
    [ -n "$hit" ]
}

# ─── Travail non sauvegardé ──────────────────────────────────────────────────
# Renvoie 0 (= à conserver) et écrit la raison sur stdout. Un worktree détaché
# ou sans remote est jugé sur son écart avec la base : ce qui est déjà dans
# origin/$BASE est récupérable, le reste ne l'est pas.
unsaved_reason() {  # unsaved_reason <dir>
    local dir="$1" branch ahead

    if [ -e "$dir/.git" ] && [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]; then
        echo "modifications non commitées"; return 0
    fi
    local gitdir; gitdir="$(git -C "$dir" rev-parse --git-dir 2>/dev/null)"
    if [ -n "$gitdir" ]; then
        case "$gitdir" in /*) ;; *) gitdir="$dir/$gitdir" ;; esac
        if [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ] \
           || [ -f "$gitdir/MERGE_HEAD" ] || [ -f "$gitdir/CHERRY_PICK_HEAD" ]; then
            echo "opération git en cours (merge/rebase)"; return 0
        fi
        if [ -f "$gitdir/index.lock" ]; then
            echo "index.lock présent (git actif)"; return 0
        fi
    fi

    branch="$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null)"
    local ref="HEAD"
    [ -n "$branch" ] && ref="$branch"
    if [ -n "$branch" ] && git -C "$REPO_ROOT" rev-parse --verify -q "refs/remotes/origin/$branch" >/dev/null; then
        # Illisible → 1, soit « il reste du travail » : on conserve.
        ahead="$(as_count "$(git -C "$REPO_ROOT" rev-list --count "origin/$branch..$ref" 2>/dev/null)" 1)"
        [ "$ahead" -gt 0 ] && { echo "$ahead commit(s) non poussé(s) sur origin/$branch"; return 0; }
    elif [ -n "$BASE_REF" ]; then
        ahead="$(as_count "$(git -C "$dir" rev-list --count "$BASE_REF..$ref" 2>/dev/null)" 1)"
        [ "$ahead" -gt 0 ] && { echo "$ahead commit(s) hors de $BASE_REF, sans branche distante"; return 0; }
    else
        # Ni branche distante, ni base résolvable : impossible de dire si ce
        # travail est récupérable ailleurs. On conserve — un faux positif coûte
        # de l'espace disque, un faux négatif coûte le travail d'un agent.
        echo "base '$BASE' introuvable — rien n'est jugé récupérable"; return 0
    fi
    return 1
}

drop_worktree() {  # drop_worktree <dir>
    local dir="$1" kb
    kb="$(du -sk "$dir" 2>/dev/null | cut -f1)"
    if [ "$DRY_RUN" = 1 ]; then
        act "[dry-run] supprimerait $dir (${kb:-?} Ko)"
        return 0
    fi
    if git -C "$REPO_ROOT" worktree remove --force "$dir" 2>/dev/null; then
        act "worktree supprimé : $dir (${kb:-?} Ko libérés)"
        removed_wt=$((removed_wt + 1))
        freed_kb=$((freed_kb + ${kb:-0}))
    else
        log "échec de la suppression de $dir (laissé en place)"
    fi
}

# ─── 1. Worktrees ────────────────────────────────────────────────────────────
git -C "$REPO_ROOT" worktree prune 2>/dev/null

while IFS= read -r line; do
    case "$line" in worktree\ *) ;; *) continue ;; esac
    wt="${line#worktree }"
    [ "$wt" = "$REPO_ROOT" ] && continue     # jamais l'arbre principal
    [ -d "$wt" ] || continue                 # déjà nettoyé par worktree prune

    if reason="$(unsaved_reason "$wt")"; then
        if [ "$FORCE" = 1 ]; then
            act "--force : suppression malgré « $reason » → $wt"
            drop_worktree "$wt"
        else
            log "conservé $wt — $reason"
        fi
        continue
    fi
    if path_in_use "$wt"; then
        log "conservé $wt — un processus y travaille"
        continue
    fi
    if recently_active "$wt"; then
        log "conservé $wt — actif il y a moins de $MAX_AGE_MIN min"
        continue
    fi
    drop_worktree "$wt"
done < <(git -C "$REPO_ROOT" worktree list --porcelain)

# ─── 2. Branches locales orphelines ──────────────────────────────────────────
# `fetch --prune` d'abord : sans lui, une branche supprimée sur GitHub au merge
# garde une `origin/<branche>` locale et ne ressort jamais comme « gone ».
git -C "$REPO_ROOT" fetch --prune --quiet origin 2>/dev/null

# Une branche extraite dans un worktree survivant n'est pas supprimable.
# Aplati en une ligne séparée par des espaces : le test `case` ci-dessous
# encadre le nom de branche par des espaces, un séparateur newline le ferait
# échouer en silence et supprimerait une branche pourtant extraite.
checked_out="$(git -C "$REPO_ROOT" worktree list --porcelain \
               | awk '/^branch /{sub("refs/heads/","",$2); print $2}' | tr '\n' ' ')"

[ -n "$BASE_REF" ] || log "base '$BASE' introuvable — purge des branches locales ignorée"

while IFS='|' read -r branch track; do
    [ -n "$BASE_REF" ] || break
    [ -n "$branch" ] || continue
    case "$branch" in main|develop|"$BASE") continue ;; esac
    case " $checked_out " in *" $branch "*) log "conservée $branch — extraite dans un worktree"; continue ;; esac

    # Deux cas sûrs : la remote a disparu (donc la PR a été mergée, GitHub
    # supprimant la branche au merge), ou l'historique est déjà contenu dans la
    # base. Le dépôt merge en squash/rebase : `git branch -d` refuserait à tort,
    # d'où la vérification explicite auprès de GitHub avant un `-D`.
    contained=1
    git -C "$REPO_ROOT" merge-base --is-ancestor "$branch" "$BASE_REF" 2>/dev/null || contained=0

    if [ "$contained" = 0 ]; then
        [ "$track" = "[gone]" ] || { log "conservée $branch — branche distante toujours présente"; continue; }
        if command -v gh >/dev/null 2>&1; then
            # Illisible → 0, soit « merge non confirmé » : on conserve.
            merged="$(as_count "$(gh pr list --head "$branch" --state merged --json number \
                        --jq 'length' 2>/dev/null)" 0)"
            if [ "$merged" -lt 1 ]; then
                log "conservée $branch — remote disparue mais aucune PR mergée trouvée (à vérifier)"
                continue
            fi
        else
            log "conservée $branch — gh indisponible, impossible de confirmer le merge"
            continue
        fi
    fi

    if [ "$DRY_RUN" = 1 ]; then
        act "[dry-run] supprimerait la branche locale $branch"
        continue
    fi
    sha="$(git -C "$REPO_ROOT" rev-parse --short "$branch" 2>/dev/null)"
    if git -C "$REPO_ROOT" branch -D "$branch" >/dev/null 2>&1; then
        act "branche locale supprimée : $branch ($sha)"
        removed_br=$((removed_br + 1))
    fi
done < <(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)|%(upstream:track)' refs/heads)

# ─── 3. Bilan ────────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = 1 ]; then
    log "purge : dry-run, rien n'a été supprimé"
elif [ "$removed_wt" -gt 0 ] || [ "$removed_br" -gt 0 ]; then
    act "purge : $removed_wt worktree(s), $removed_br branche(s) locale(s), $((freed_kb / 1024)) Mo libérés"
else
    log "purge : rien à supprimer"
fi
exit 0
