#!/usr/bin/env python3
"""Garde-fou des crédits Kie AI.

Aucune génération payante ne part sans un budget accordé par l'utilisateur, dans un
message qu'il a tapé lui-même :

    kie ok 90      → autorise jusqu'à 90 crédits, pendant 30 minutes
    kie stop       → révoque le budget restant

Claude ne peut pas écrire ce message : il peut seulement annoncer le coût et demander.
C'est ce qui rend la confirmation infalsifiable, quel que soit le mode de permission
(auto, bypass…) — un simple « ask » pourrait être tranché sans l'utilisateur.

Points d'entrée :
  kie-guard.py hook                 — hooks UserPromptSubmit et PreToolUse (JSON sur stdin)
  kie-guard.py spend <payload>      — appelé par kie.sh juste avant createTask : débite
                                      le budget ou refuse (exit 1). Seconde barrière, pour
                                      le cas où les hooks ne seraient pas chargés.
  kie-guard.py estimate <payload>   — coût prévu, sans rien débiter.

Le budget n'est jamais rendu, même si createTask échoue : on redemande plutôt que de
risquer une autorisation qui se recharge toute seule.
"""

import fcntl
import json
import math
import os
import re
import shlex
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
STATE = HERE / ".kie-budget.json"
LOCK = HERE / ".kie-budget.lock"
TTL_S = 30 * 60
USD_PER_CREDIT = 0.005

GRANT_RE = re.compile(r"(?<![\w-])kie\s+ok\s+(\d{1,6})(?!\w)", re.I)
REVOKE_RE = re.compile(r"(?<![\w-])kie\s+(?:stop|non|annule)(?!\w)", re.I)

# Sous-commandes de kie.sh qui ne dépensent rien.
FREE_SUBCOMMANDS = {"credits", "upload", "poll", "estimate", "help", "-h", "--help"}
SPEND_SUBCOMMANDS = {"create", "run"}

# Mots qu'on saute pour trouver la vraie commande d'une ligne (`bash kie.sh run …`,
# `for …; do kie.sh run …`).
WRAPPERS = {"bash", "sh", "zsh", "exec", "time", "nohup", "command", "env", "sudo",
            "caffeinate", "source", ".", "do", "then", "else", "elif", "if", "{", "!"}

NET_CLIENT_RE = re.compile(
    r"\b(curl|wget|https?|python3?|node|deno|bun|perl|ruby|nc|openssl|fetch|aria2c)\b")
KIE_API_RE = re.compile(r"api\.kie\.ai|redpandaai\.co|createTask|jobs/recordInfo")
KEY_RE = re.compile(r"KIE_API_KEY|KIE_ENV_FILE")
DOTENV_RE = re.compile(r"(?<![\w.-])\.env(?:\.(?!example\b)[\w.-]+)?(?![\w.-])")
PROTECTED = ("kie-guard", "kie.sh", ".claude/settings")
MUTATORS = {"mv", "cp", "rm", "ln", "tee", "chmod", "truncate", "dd", "install", "rsync"}

HOW_TO_ASK = (
    "Annonce le coût à l'utilisateur (crédits, USD, EUR) et demande-lui de répondre "
    "lui-même « kie ok <crédits> ». Ne relance la commande qu'après ce message.")


# ─── Tarifs ──────────────────────────────────────────────────────────────────────────
# Relevés le 2026-08-31 (voir .claude/skills/kie-ai/references/kling-3-omni.md).
# Un modèle absent de cette table n'est pas estimable : voir `spend`.

KLING_T2V_I2V = {"720p": (14, 18), "1080p": (18, 23), "4k": (67, 67)}  # (sans, avec audio)
KLING_REF = {"720p": (14, 18, 20), "1080p": (18, 23, 27), "4k": (67, 67, 67)}  # + vidéo
KLING_TRANSFORM = {"720p": 20, "1080p": 27, "4k": 67}


def estimate(payload):
    """Retourne (crédits | None, détail). Les champs absents sont comptés au pire cas."""
    model = str(payload.get("model") or "")
    inp = payload.get("input") or {}

    if model.startswith("kling-3.0-omni/"):
        mode = model.split("/", 1)[1]
        res = str(inp.get("resolution") or "720p").lower()
        duration = inp.get("duration", 5)  # défaut du schéma : 5 s
        shots = inp.get("multi_prompt") or []
        if isinstance(shots, list) and shots:
            duration = max(duration, sum(float(s.get("duration", 0)) for s in shots))
        # « audio » absent : on ne connaît pas le défaut, on compte le tarif avec audio.
        audio = inp.get("audio", True) is not False
        has_video = bool(inp.get("video_urls"))

        if mode in ("text-to-video", "image-to-video") and res in KLING_T2V_I2V:
            rate = KLING_T2V_I2V[res][1 if audio else 0]
        elif mode == "reference-to-video" and res in KLING_REF:
            rate = KLING_REF[res][2 if has_video else (1 if audio else 0)]
        elif mode == "transformation" and res in KLING_TRANSFORM:
            rate = KLING_TRANSFORM[res]
        else:
            return None, f"{model} en {res} : tarif inconnu"
        credits = math.ceil(rate * float(duration))
        return credits, (f"{model}, {duration:g} s × {rate} cr/s ({res}, "
                         f"{'avec' if audio else 'sans'} audio)")

    if model == "nano-banana-pro":
        res = str(inp.get("resolution") or "").lower()
        if res == "4k":
            return 24, "nano-banana-pro, 4K : 24 crédits"
        return None, f"nano-banana-pro en « {res or '?'} » : tarif inconnu"

    return None, f"modèle « {model or '?'} » absent de la table des tarifs"


def usd_to_eur():
    try:
        src = (ROOT / "src/lib/currency.ts").read_text()
        return float(re.search(r"\bUSD:\s*([\d.]+)", src).group(1))
    except Exception:
        return None


def money(credits):
    usd = credits * USD_PER_CREDIT
    rate = usd_to_eur()
    eur = f" ≈ {usd * rate:.2f} €" if rate else ""
    return f"{credits} crédits (${usd:.2f}{eur})"


def load_payload(path, cwd=None):
    p = Path(path)
    if not p.is_absolute():
        p = Path(cwd or os.getcwd()) / p
    return json.loads(p.read_text())


# ─── Budget ──────────────────────────────────────────────────────────────────────────

class Locked:
    def __enter__(self):
        self.f = open(LOCK, "a")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def read_budget():
    """Budget encore valable, ou None."""
    try:
        b = json.loads(STATE.read_text())
    except Exception:
        return None
    if time.time() > b.get("expires_at", 0) or b.get("credits_left", 0) <= 0:
        return None
    return b


def write_budget(b):
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(b, indent=2))
    tmp.replace(STATE)


# ─── Hooks ───────────────────────────────────────────────────────────────────────────

def emit(obj):
    print(json.dumps(obj, ensure_ascii=False))
    sys.exit(0)


def deny(reason):
    emit({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "[kie-guard] " + reason,
    }})


def deny_tamper(name):
    deny(f"Modification de {name} refusée : ce fichier fait partie du garde-fou des "
         "crédits Kie AI. Demande à l'utilisateur de l'éditer lui-même.")


def on_user_prompt(data):
    prompt = data.get("prompt") or ""
    if REVOKE_RE.search(prompt):
        with Locked():
            STATE.unlink(missing_ok=True)
        emit({"systemMessage": "Kie AI : budget révoqué.",
              "hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                     "additionalContext": "L'utilisateur a révoqué le budget "
                                     "Kie AI : aucune génération payante n'est autorisée."}})
    m = GRANT_RE.search(prompt)
    if not m:
        return
    credits = int(m.group(1))
    with Locked():
        write_budget({"credits_granted": credits, "credits_left": credits,
                      "granted_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                      "expires_at": time.time() + TTL_S})
    msg = f"Kie AI : budget de {money(credits)} accordé, valable 30 min."
    emit({"systemMessage": msg,
          "hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                 "additionalContext": msg + " Il remplace tout budget "
                                 "précédent et se débite à chaque createTask."}})


def simple_commands(cmd):
    """Découpe grossièrement une ligne shell en commandes simples."""
    for part in re.split(r"&&|\|\||[;|\n`]|\$\(|[()]", cmd):
        try:
            words = shlex.split(part, posix=True)
        except ValueError:
            words = part.split()
        while words and (re.match(r"^\w+=", words[0]) or words[0] in WRAPPERS
                         or words[0].startswith("-")):
            words.pop(0)
        if words:
            yield words


def check_bash(cmd, cwd):
    # 1. Altération de la garde elle-même.
    if ".kie-budget" in cmd:
        deny("Le fichier de budget ne se manipule pas : seul un message de "
             "l'utilisateur (« kie ok <crédits> ») l'écrit.")
    for name in PROTECTED:
        if re.search(r">\s*[\"']?[^\s;&|]*" + re.escape(name), cmd):
            deny_tamper(name)
    for words in simple_commands(cmd):
        head = os.path.basename(words[0])
        inplace = head in ("sed", "perl") and any(
            re.fullmatch(r"-\w*i\w*", w) or w.startswith("--in-place") for w in words[1:])
        if head in MUTATORS or inplace:
            for name in PROTECTED:
                if any(name in w for w in words[1:]):
                    deny_tamper(name)
    if "disableAllHooks" in cmd:
        deny("Désactiver les hooks contournerait le garde-fou des crédits Kie AI.")

    # 2. La clé ne se lit que par kie.sh, qui ne l'affiche jamais.
    if KEY_RE.search(cmd) or DOTENV_RE.search(cmd):
        deny("Accès à .env / KIE_API_KEY refusé : la clé ne s'utilise que via "
             ".claude/skills/kie-ai/scripts/kie.sh.")

    # 3. Pas d'appel direct à l'API : tout passe par kie.sh, qui débite le budget.
    if KIE_API_RE.search(cmd) and NET_CLIENT_RE.search(cmd):
        deny("Appel direct à l'API Kie AI refusé : passe par "
             ".claude/skills/kie-ai/scripts/kie.sh (create / run), qui débite le budget.")

    # 4. Les sous-commandes payantes de kie.sh.
    total, unknown, details = 0, [], []
    for words in simple_commands(cmd):
        if not words[0].endswith("kie.sh"):
            continue
        sub = words[1] if len(words) > 1 else None
        if sub is not None and not re.fullmatch(r"[\w-]+", sub):
            deny("Sous-commande de kie.sh non littérale : écris `kie.sh run <payload.json> "
                 "<destination>` en clair, pour que le coût soit vérifiable.")
        if sub not in SPEND_SUBCOMMANDS:
            continue
        if re.search(r"\b(for|while|until|xargs|parallel)\b", cmd):
            deny("Pas de kie.sh create/run dans une boucle : un appel littéral par "
                 "payload, pour que chaque coût soit estimé.")
        payload = words[2] if len(words) > 2 else ""
        if not payload or re.search(r"[$*?`{]", payload):
            deny("Payload de kie.sh non littéral : donne le chemin du fichier en clair.")
        try:
            credits, detail = estimate(load_payload(payload, cwd))
        except Exception as e:
            deny(f"Payload illisible ({payload}) : {e}. Utilise un chemin absolu ou "
                 "relatif à la racine du projet.")
        details.append(detail)
        if credits is None:
            unknown.append(detail)
        else:
            total += credits

    if not details:
        return
    b = read_budget()
    cost = money(total) if total else "coût non estimable"
    if b is None:
        deny(f"Aucun budget Kie AI accordé. Coût prévu : {cost} "
             f"({'; '.join(details)}). {HOW_TO_ASK}")
    if total > b["credits_left"]:
        deny(f"Budget insuffisant : il reste {b['credits_left']} crédits, la commande en "
             f"coûte {total} ({'; '.join(details)}). {HOW_TO_ASK}")
    if unknown and len(details) > 1:
        deny("Un modèle sans tarif connu consomme tout le budget : lance-le seul, "
             "dans sa propre commande.")
    # Budget suffisant : on laisse le circuit de permission habituel décider.


def check_file_tool(tool, inp):
    path = str(inp.get("file_path") or inp.get("notebook_path") or inp.get("path") or "")
    name = os.path.basename(path)

    if tool in ("Read", "Grep"):
        target = path + " " + str(inp.get("glob") or "")
        if DOTENV_RE.search(target):
            deny("Lecture de .env refusée : la clé ne s'utilise que via kie.sh.")
        return

    # Outils d'écriture.
    if name == "kie-guard.py" or name.startswith(".kie-budget"):
        deny("Ce fichier fait partie du garde-fou des crédits Kie AI : demande à "
             "l'utilisateur de le modifier lui-même.")

    if tool == "MultiEdit":
        olds = [e.get("old_string", "") for e in inp.get("edits") or []]
        news = [e.get("new_string", "") for e in inp.get("edits") or []]
    else:
        olds = [inp.get("old_string") or ""]
        news = [inp.get("new_string") or inp.get("content") or inp.get("new_source") or ""]
    old, new = "\n".join(olds), "\n".join(news)

    # Ce que chaque fichier protégé doit continuer de contenir. Pour kie.sh, c'est
    # l'appel qui débite le budget et le chemin du garde-fou, pas un simple mot-clé.
    if re.search(r"/\.claude/settings(\.local)?\.json$", path):
        markers = ["kie-guard"]
    elif path.endswith("kie-ai/scripts/kie.sh"):
        markers = ['"$GUARD" spend', '/.claude/hooks/kie-guard.py"']
    else:
        markers = None
    if markers:
        if "disableAllHooks" in new:
            deny("Désactiver les hooks contournerait le garde-fou des crédits Kie AI.")
        try:
            current = Path(path).read_text() if tool == "Write" else ""
        except Exception:
            current = ""
        for m in markers:
            if (tool == "Write" and m in current and m not in new) or (
                    tool != "Write" and old.count(m) > new.count(m)):
                deny(f"Cette modification retire le garde-fou ({m}) de {name} : refusée.")
        return

    # Un nouveau client de l'API contournerait kie.sh et son débit du budget.
    if KIE_API_RE.search(new) and not path.endswith(".md"):
        deny("Écrire un autre client de l'API Kie AI est refusé : les générations "
             "passent par kie.sh, qui débite le budget accordé par l'utilisateur.")


def on_pre_tool_use(data):
    tool = data.get("tool_name") or ""
    inp = data.get("tool_input") or {}
    if tool == "Bash":
        check_bash(str(inp.get("command") or ""), data.get("cwd"))
    elif tool in ("Read", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit"):
        check_file_tool(tool, inp)


def run_hook():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
        event = data.get("hook_event_name")
        if event == "UserPromptSubmit":
            on_user_prompt(data)
        elif event == "PreToolUse":
            on_pre_tool_use(data)
    except SystemExit:
        raise
    except Exception as e:
        # Fermé par défaut : dans le doute sur une commande qui touche à Kie, on refuse.
        if re.search(r"kie", raw, re.I) and '"PreToolUse"' in raw:
            deny(f"Garde-fou en erreur ({type(e).__name__}: {e}) : refus par précaution.")
    sys.exit(0)


# ─── CLI pour kie.sh ─────────────────────────────────────────────────────────────────

def cli_estimate(path):
    credits, detail = estimate(load_payload(path))
    if credits is None:
        print(f"Coût non estimable — {detail}.")
        sys.exit(2)
    print(f"Coût prévu : {money(credits)} — {detail}.")


def cli_spend(path):
    credits, detail = estimate(load_payload(path))
    with Locked():
        b = read_budget()
        if b is None:
            what = money(credits) if credits is not None else "coût non estimable"
            print(f"Refusé : aucun budget Kie AI accordé. Coût prévu : {what} — {detail}.\n"
                  f"L'utilisateur doit répondre lui-même « kie ok <crédits> ».",
                  file=sys.stderr)
            sys.exit(1)
        if credits is None:
            # Pas de tarif : on ne peut pas garantir le plafond, seulement « un appel
            # par autorisation ». Le budget entier est consommé.
            print(f"Attention : {detail}. L'autorisation entière est consommée "
                  f"({b['credits_left']} crédits) ; vérifier creditsConsumed ensuite.",
                  file=sys.stderr)
            b["credits_left"] = 0
        elif credits > b["credits_left"]:
            print(f"Refusé : il reste {b['credits_left']} crédits, cette génération en "
                  f"coûte {credits} — {detail}.", file=sys.stderr)
            sys.exit(1)
        else:
            b["credits_left"] -= credits
            print(f"Budget Kie AI : −{money(credits)}, reste {b['credits_left']} crédits.",
                  file=sys.stderr)
        write_budget(b)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["hook"]:
        run_hook()
    elif len(args) == 2 and args[0] == "estimate":
        cli_estimate(args[1])
    elif len(args) == 2 and args[0] == "spend":
        cli_spend(args[1])
    else:
        print(__doc__.strip(), file=sys.stderr)
        sys.exit(64)
