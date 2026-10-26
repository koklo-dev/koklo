#!/usr/bin/env bash
# Create or reuse an exact-title issue, then converge its Project/Sprint fields.
set -euo pipefail

PROJECT_NUMBER="${1:?usage: upsert-project-issue.sh <project> <owner> <title> <body-file> [labels...]}"
OWNER="${2:?owner required}"
TITLE="${3:?title required}"
BODY_FILE="${4:?body file required}"
shift 4
[ -f "$BODY_FILE" ] || { echo "body file not found: $BODY_FILE" >&2; exit 2; }
command -v gh >/dev/null || { echo "gh required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

# Content creation is subject to GitHub's secondary rate limits, independently
# from the hourly API quota. Retry only rate-limit/abuse failures; all other
# errors remain immediate and visible to the caller.
gh_retry() {
  local attempt=1 max="${SHIPYARD_GH_RETRY_MAX:-6}" delay retry_after err
  err="$(mktemp)"
  while :; do
    if gh "$@" 2>"$err"; then
      rm -f "$err"
      return 0
    fi
    if ! grep -Eqi '(^|[^0-9])403([^0-9]|$)|secondary rate|abuse|rate limit|retry.after' "$err" \
       || [ "$attempt" -ge "$max" ]; then
      cat "$err" >&2
      rm -f "$err"
      return 1
    fi
    retry_after="$(sed -nE 's/.*[Rr]etry[- ]?[Aa]fter[^0-9]*([0-9]+).*/\1/p' "$err" | head -1)"
    delay="${retry_after:-$((attempt * attempt * 5))}"
    printf 'GitHub throttled content creation; retrying in %ss (attempt %s/%s)\n' \
      "$delay" "$attempt" "$max" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

# Quoted as an exact phrase: unquoted, punctuation in the title (brackets, colons)
# can break GitHub's search grammar and make the query silently match nothing, which
# would make this "upsert" always fall through to "create" (see agent-loop.sh's
# retro-issue bug, 2026-08-08, for the failure mode this guards against).
issues="$(gh_retry issue list --state all --search "\"$TITLE\" in:title" --limit 100 --json number,title,url,state)"
ISSUE_JSON="$(jq -c --arg title "$TITLE" '[.[] | select(.title==$title)][0] // {}' <<<"$issues")"
ISSUE_URL="$(jq -r '.url // empty' <<<"$ISSUE_JSON")"
ISSUE_STATE="$(jq -r '.state // empty' <<<"$ISSUE_JSON")"
if [ -z "$ISSUE_URL" ]; then
  label_args=()
  for label in "$@"; do label_args+=(--label "$label"); done
  [ "${SHIPYARD_ISSUE_CREATE_DELAY:-0}" = 0 ] || sleep "$SHIPYARD_ISSUE_CREATE_DELAY"
  ISSUE_URL="$(gh_retry issue create --title "$TITLE" --body-file "$BODY_FILE" "${label_args[@]}")"
fi

# A completed bootstrap issue is immutable history. Re-running the scaffold must
# not put its Project item back in Todo or reopen delivery work.
if [ "$ISSUE_STATE" = "CLOSED" ]; then
  printf '%s\n' "$ISSUE_URL"
  exit 0
fi

PROJECT_ID="$(gh_retry project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq .id)"
PROJECT_FIELDS="$(gh_retry project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)"
SPRINT_FIELD_ID="$(jq -r '.fields[] | select(.name=="Sprint") | .id' <<<"$PROJECT_FIELDS")"
STATUS_FIELD_ID="$(jq -r '.fields[] | select(.name=="Status") | .id' <<<"$PROJECT_FIELDS")"
TODO_ID="$(jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Todo") | .id' <<<"$PROJECT_FIELDS")"
[ -n "$PROJECT_ID" ] && [ -n "$SPRINT_FIELD_ID" ] && [ -n "$STATUS_FIELD_ID" ] && [ -n "$TODO_ID" ] \
  || { echo "Project is missing its Status/Todo or Sprint contract" >&2; exit 3; }

TODAY="${SHIPYARD_TODAY:-$(date +%F)}"
# GitHub moves an iteration out of `iterations` into `completedIterations` the
# moment its window closes — a Sprint with work still in it is simply filed
# elsewhere. The loop has always read BOTH lists when it picks the Sprint, this
# script only read the first, so once a Sprint ran past its end date the loop
# selected a Sprint this script was structurally unable to find, and every run
# died on "no matching iteration". That is the 2026-10-11 → 2026-10-19 outage.
ITERATION_CONFIG="$(gh_retry api graphql -f query='query($id:ID!){node(id:$id){... on ProjectV2IterationField{configuration{iterations{id title startDate duration} completedIterations{id title startDate duration}}}}}' -f id="$SPRINT_FIELD_ID" --jq '.data.node.configuration')"
# An explicit target names a Sprint, and a named Sprint is found wherever it
# lives. The date-based fallback stays on the open iterations: "the Sprint we
# are in" cannot be one that has already ended.
ALL_ITERATIONS="$(jq -c '[(.completedIterations // [])[], (.iterations // [])[]] | unique_by(.id) | sort_by(.startDate)' <<<"$ITERATION_CONFIG")"
ITERATIONS="$(jq -c '.iterations // []' <<<"$ITERATION_CONFIG")"
if [ -n "${SHIPYARD_TARGET_SPRINT:-}" ]; then
  CURRENT_ITERATION="$(jq -r --arg title "$SHIPYARD_TARGET_SPRINT" \
    '[.[] | select(.title==$title)][0].id // empty' <<<"$ALL_ITERATIONS")"
else
  CURRENT_ITERATION="$(jq -r --arg d "$TODAY" '[.[] | select(.startDate <= $d) | select(((.startDate|strptime("%Y-%m-%d")|mktime)+(.duration*86400)) > ($d|strptime("%Y-%m-%d")|mktime))][0].id // .[0].id' <<<"$ITERATIONS")"
fi
[ -n "$CURRENT_ITERATION" ] && [ "$CURRENT_ITERATION" != "null" ] \
  || { echo "Project Sprint field has no matching iteration${SHIPYARD_TARGET_SPRINT:+: $SHIPYARD_TARGET_SPRINT}" >&2; exit 3; }

items="$(gh_retry project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit "${SHIPYARD_PROJECT_LIMIT:-1200}")"
ITEM_ID="$(jq -r --arg url "$ISSUE_URL" '[.items[]? | select(.content.url==$url)][0].id // empty' <<<"$items")"
if [ -z "$ITEM_ID" ]; then
  ITEM_ID="$(gh_retry project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$ISSUE_URL" --format json --jq .id)"
fi

gh_retry project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$SPRINT_FIELD_ID" --iteration-id "$CURRENT_ITERATION" >/dev/null
gh_retry project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$TODO_ID" >/dev/null
printf '%s\n' "$ISSUE_URL"
