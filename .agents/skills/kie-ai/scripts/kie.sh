#!/usr/bin/env bash
# Minimal client for the Kie AI API.
#
#   kie.sh credits
#   kie.sh estimate <payload.json>                  (free, local)
#   kie.sh upload <file> [storage/path]
#   kie.sh create <payload.json>                    (paid)
#   kie.sh poll   <taskId>
#   kie.sh run    <payload.json> <destination>      (paid)
#
# The key is read from .env (KIE_API_KEY) and is never printed.
# create and run are forbidden without a budget set by the user ("kie ok <credits>"):
# see rule number one in SKILL.md.
# Written in bash, not zsh: zsh doesn't split variables into words.

set -euo pipefail

API="https://api.kie.ai/api/v1"
UPLOAD="https://kieai.redpandaai.co/api/file-stream-upload"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"

die() { printf '%s\n' "$*" >&2; exit 1; }

api_key() {
  local envfile="${KIE_ENV_FILE:-$ROOT/.env}" k
  [ -f "$envfile" ] || die ".env file not found: $envfile"
  k="$(sed -n 's/^KIE_API_KEY=//p' "$envfile" | head -1 | tr -d "\"' \r")"
  [ -n "$k" ] || die "KIE_API_KEY missing or empty in $envfile"
  printf '%s' "$k"
}

# Extracts a field from JSON on stdin. Dotted path, e.g. data.state
jget() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for k in sys.argv[1].split("."):
    if d is None: break
    d = d.get(k) if isinstance(d, dict) else None
print("" if d is None else d)
' "$1"
}

cmd_credits() {
  local r
  r="$(curl -sS --max-time 30 -H "Authorization: Bearer $(api_key)" "$API/chat/credit")"
  local c; c="$(printf '%s' "$r" | jget data)"
  [ -n "$c" ] || die "Unexpected response: $r"
  printf 'Balance: %s credits (≈ $%.2f)\n' "$c" "$(echo "$c * 0.005" | bc -l)"
}

cmd_upload() {
  local file="${1:?usage: kie.sh upload <file> [path]}"
  local path="${2:-images/higgsphere}"
  [ -f "$file" ] || die "File not found: $file"
  local r url
  r="$(curl -sS --max-time 300 -X POST "$UPLOAD" \
        -H "Authorization: Bearer $(api_key)" \
        -F "file=@$file" -F "uploadPath=$path")"
  url="$(printf '%s' "$r" | jget data.downloadUrl)"
  [ -n "$url" ] || die "Upload failed: $r"
  # Temporary URL: use it without delay.
  printf '%s\n' "$url"
}

cmd_estimate() {
  local payload="${1:?usage: kie.sh estimate <payload.json>}"
  [ -f "$payload" ] || die "Payload not found: $payload"
  python3 "$HERE/estimate.py" "$payload"
}

cmd_create() {
  local payload="${1:?usage: kie.sh create <payload.json>}"
  [ -f "$payload" ] || die "Payload not found: $payload"
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$payload" \
    || die "Invalid payload JSON: $payload"
  local r id
  r="$(curl -sS --max-time 120 -X POST "$API/jobs/createTask" \
        -H "Authorization: Bearer $(api_key)" \
        -H "Content-Type: application/json" --data @"$payload")"
  id="$(printf '%s' "$r" | jget data.taskId)"
  [ -n "$id" ] || die "Creation failed: $r"
  printf '%s\n' "$id"
}

# Polls until a terminal state. Writes the summary to stderr, the URLs to stdout.
cmd_poll() {
  local id="${1:?usage: kie.sh poll <taskId>}"
  local key; key="$(api_key)"
  local tries="${KIE_POLL_TRIES:-180}" delay="${KIE_POLL_DELAY:-10}"
  local r state
  for ((i = 0; i < tries; i++)); do
    r="$(curl -sS --max-time 30 -H "Authorization: Bearer $key" \
          "$API/jobs/recordInfo?taskId=$id" || true)"
    state="$(printf '%s' "$r" | jget data.state 2>/dev/null || true)"
    case "$state" in
      success|fail) break ;;
      "") ;;                       # unreadable response: retry
      *) ;;                        # waiting | queuing | generating
    esac
    sleep "$delay"
  done
  [ "$state" = "success" ] || {
    printf 'Failure (state=%s): %s\n' "${state:-unknown}" \
      "$(printf '%s' "$r" | jget data.failMsg)" >&2
    die "Task $id did not complete. Credits for a failed generation are refunded."
  }
  printf 'state=%s  credits=%s  time=%ss\n' \
    "$state" \
    "$(printf '%s' "$r" | jget data.creditsConsumed)" \
    "$(printf '%s' "$r" | jget data.costTime)" >&2
  printf '%s' "$r" | python3 -c '
import json, sys
d = json.load(sys.stdin)["data"]
print("\n".join(json.loads(d["resultJson"])["resultUrls"]))
'
}

cmd_run() {
  local payload="${1:?usage: kie.sh run <payload.json> <destination>}"
  local dest="${2:?usage: kie.sh run <payload.json> <destination>}"
  local id; id="$(cmd_create "$payload")"
  printf 'taskId=%s\n' "$id" >&2
  local urls; urls="$(cmd_poll "$id")"
  local n=0
  while IFS= read -r u; do
    [ -n "$u" ] || continue
    local out="$dest"
    [ "$n" -gt 0 ] && out="${dest%.*}-$n.${dest##*.}"
    curl -sSL --max-time 600 "$u" -o "$out"
    printf '%s\n' "$out"
    n=$((n + 1))
  done <<< "$urls"
  # Reminder: without a .json sidecar of the same name, the media loses its prompt and cost.
  printf "Don't forget the .json sidecar (prompt, model, cost, created_at).\n" >&2
}

case "${1:-}" in
  credits) shift; cmd_credits "$@" ;;
  estimate) shift; cmd_estimate "$@" ;;
  upload)  shift; cmd_upload  "$@" ;;
  create)  shift; cmd_create  "$@" ;;
  poll)    shift; cmd_poll    "$@" ;;
  run)     shift; cmd_run     "$@" ;;
  *) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
