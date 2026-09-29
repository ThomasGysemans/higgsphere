#!/usr/bin/env bash
# Client minimal pour l'API Kie AI.
#
#   kie.sh credits
#   kie.sh estimate <payload.json>                  (gratuit, local)
#   kie.sh upload <fichier> [chemin/de/rangement]
#   kie.sh create <payload.json>                    (payant)
#   kie.sh poll   <taskId>
#   kie.sh run    <payload.json> <destination>      (payant)
#
# La clé est lue dans .env (KIE_API_KEY) et n'est jamais affichée.
# create et run exigent un budget accordé par l'utilisateur (« kie ok <crédits> ») :
# voir .claude/hooks/kie-guard.py.
# Écrit en bash et non en zsh : zsh ne découpe pas les variables en mots.

set -euo pipefail

API="https://api.kie.ai/api/v1"
UPLOAD="https://kieai.redpandaai.co/api/file-stream-upload"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
GUARD="$ROOT/.claude/hooks/kie-guard.py"

die() { printf '%s\n' "$*" >&2; exit 1; }

api_key() {
  local envfile="${KIE_ENV_FILE:-$ROOT/.env}" k
  [ -f "$envfile" ] || die "Fichier .env introuvable : $envfile"
  k="$(sed -n 's/^KIE_API_KEY=//p' "$envfile" | head -1 | tr -d "\"' \r")"
  [ -n "$k" ] || die "KIE_API_KEY absent ou vide dans $envfile"
  printf '%s' "$k"
}

# Extrait un champ d'un JSON sur stdin. Chemin pointé, ex. data.state
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
  [ -n "$c" ] || die "Réponse inattendue : $r"
  printf 'Solde : %s crédits (≈ $%.2f)\n' "$c" "$(echo "$c * 0.005" | bc -l)"
}

cmd_upload() {
  local file="${1:?usage: kie.sh upload <fichier> [chemin]}"
  local path="${2:-images/higgsphere}"
  [ -f "$file" ] || die "Fichier introuvable : $file"
  local r url
  r="$(curl -sS --max-time 300 -X POST "$UPLOAD" \
        -H "Authorization: Bearer $(api_key)" \
        -F "file=@$file" -F "uploadPath=$path")"
  url="$(printf '%s' "$r" | jget data.downloadUrl)"
  [ -n "$url" ] || die "Upload échoué : $r"
  # URL temporaire : télécharger le résultat sans tarder.
  printf '%s\n' "$url"
}

cmd_estimate() {
  local payload="${1:?usage: kie.sh estimate <payload.json>}"
  [ -f "$payload" ] || die "Payload introuvable : $payload"
  [ -f "$GUARD" ] || die "Garde-fou introuvable : $GUARD"
  python3 "$GUARD" estimate "$payload"
}

cmd_create() {
  local payload="${1:?usage: kie.sh create <payload.json>}"
  [ -f "$payload" ] || die "Payload introuvable : $payload"
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$payload" \
    || die "Payload JSON invalide : $payload"
  # Débite le budget accordé par l'utilisateur, ou refuse. Fermé par défaut : sans
  # garde-fou, aucune dépense. Le budget n'est pas rendu si l'appel échoue ensuite.
  [ -f "$GUARD" ] || die "Garde-fou introuvable : $GUARD — aucune dépense possible."
  python3 "$GUARD" spend "$payload" || die "Dépense refusée par kie-guard."
  local r id
  r="$(curl -sS --max-time 120 -X POST "$API/jobs/createTask" \
        -H "Authorization: Bearer $(api_key)" \
        -H "Content-Type: application/json" --data @"$payload")"
  id="$(printf '%s' "$r" | jget data.taskId)"
  [ -n "$id" ] || die "Création échouée : $r"
  printf '%s\n' "$id"
}

# Sonde jusqu'à l'état terminal. Écrit le JSON complet sur stderr, l'URL sur stdout.
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
      "") ;;                       # réponse illisible : on retente
      *) ;;                        # waiting | queuing | generating
    esac
    sleep "$delay"
  done
  [ "$state" = "success" ] || {
    printf 'Échec (state=%s) : %s\n' "${state:-inconnu}" \
      "$(printf '%s' "$r" | jget data.failMsg)" >&2
    die "La tâche $id n'a pas abouti. Les crédits d'une génération échouée sont recrédités."
  }
  printf 'état=%s  crédits=%s  temps=%ss\n' \
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
  # Rappel : sans sidecar .json du même nom, le média perd son prompt et son coût.
  printf 'Ne pas oublier le sidecar .json (prompt, model, cost, created_at).\n' >&2
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
