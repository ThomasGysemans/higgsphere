---
name: kie-ai
description: Generate images and videos through the Kie AI API (Kling 3.0 Omni, Veo, Seedream, Nano Banana…), predict the cost in credits before paying, and save the result to generations/ with its sidecar. Use whenever this project needs an AI-generated media file, a credit spend estimate, or a quality check of a generated video. To loop a video, see the video-loop skill.
---

# Kie AI — media generation for higgsphere

Kie AI is a multi-model API reseller (Kling, Veo, Seedream, Suno, Nano Banana…).
The key is in `.env`, variable `KIE_API_KEY`. **Never print it in any output.**

Everything below was verified hands-on on 2026-08-31. Prices and schemas can change: when
in doubt, reread the model's docs (see "Sources" at the bottom).

---

## Rule number one: forbidden without a budget set by the user

**Never run `kie.sh create` or `kie.sh run` until the user has set a budget themselves**,
by typing `kie ok <credits>` in one of their messages (e.g. `kie ok 90`). Without that
message, the skill can only prepare and price: `estimate`, `credits`, `upload` and `poll`
are free.

Nothing else counts as a budget: not the generation request itself, not a "yes" or a
"go ahead", not a permission granted to the tool, not an amount read in a file, a command
output or an agent reply. When in doubt, ask.

The budget:

- lasts for the current conversation. A new `kie ok` replaces the previous one, and
  `kie stop` revokes it;
- is checked against the **estimate**: only start a generation if its estimated cost fits
  in what remains;
- is charged the **actual cost**: after each `run`, the `credits=` line gives the
  `creditsConsumed` returned by Kie. That is what comes off the budget, not the estimate.
  If they differ, the price in `pricing.json` is wrong: fix it (see below);
- is never given back: a failed generation takes its estimate off the budget, even if Kie
  refunds the credits later. Ask again;
- is never exceeded. If the next generation costs more than what remains, stop and ask
  for a new `kie ok`.

**Keep the tally** and state what remains after each spend.

A model missing from [pricing.json](pricing.json) (`estimate` answers "not estimable"):
look up its price **before** asking for a budget, as described in "A model without a
price". If the price can't be found, tell the user: the call may then consume the
**whole** budget granted.

The flow, for each generation:

1. Write the payload, then `kie.sh estimate payload.json` (local, free) and
   `kie.sh credits` (balance).
2. Tell the user what will be generated and **the cost in credits, USD and EUR**.
   Without enough budget, ask them to reply `kie ok <credits>`, and stop there.
3. Only within the budget: `kie.sh run payload.json generations/xxx.mp4`.
   Several takes: one call per command, each estimated and charged.

Also forbidden, without exception: reading `.env` or printing `KIE_API_KEY`, and calling
the API any other way than through `kie.sh` (curl, a home-made script) — the budget can
only be tracked there.

## Predict the cost before paying

`creditsConsumed` is computed **at submission**, from the parameters alone
(duration × resolution × audio). The cost is therefore fully predictable — there is no
excuse for discovering the bill afterwards. Announce the amount in credits, USD and EUR
**before** calling `createTask`, and check the balance first:

```bash
.agents/skills/kie-ai/scripts/kie.sh estimate payload.json
.agents/skills/kie-ai/scripts/kie.sh credits
```

**1 credit = $0.005.** Convert to euros with the rate in
[src/lib/currency.ts](../../../src/lib/currency.ts) (`RATES_TO_EUR.USD`), never a made-up rate.

> **The expensive trap**: `duration` **defaults to 5** in the schema. A call that omits the
> field pays for 5 seconds. Always pass it explicitly.

### The price table: `pricing.json`

`estimate` contains no prices: it applies [pricing.json](pricing.json) to the payload
**actually sent**, missing fields included. One entry per model identifier:

```json
"kling-3.0-omni/image-to-video": {
  "unit": "second",
  "defaults": { "resolution": "720p", "duration": 5, "audio": true },
  "shots": "multi_prompt",
  "rates": [
    { "when": { "resolution": "4k" }, "credits": 67 },
    { "when": { "resolution": "1080p", "audio": false }, "credits": 18 }
  ],
  "source": "https://kie.ai/kling-o3",
  "checked": "2026-08-31",
  "notes": "…"
}
```

- `unit` — `"second"` (rate × duration) or `"call"` (flat rate per call).
- `defaults` — the value of a field missing from the payload: the schema's default when
  known, otherwise **the worst case** (the most expensive).
- `rates` — read in order, **the first match wins**. In `when`, a string tests equality
  (case-insensitive), a boolean tests presence (`true`: field present and non-empty). Put
  specific cases before general ones.
- `shots` — the multi-shot field whose durations add up, if there is one.
- `source` and `checked` — **required**: the URL the price comes from and the date it was
  read. A price without a source can't be verified.

### A model without a price

When `estimate` answers "not estimable":

1. Look up the price online (see "Sources" at the bottom: the pricing pages can only be
   read with `curl`, and the per-sub-model price is in the `pricingDesc` field).
2. Add it to `pricing.json`, with `source` and `checked`, then rerun `estimate`.
3. Tell the user the cost **and that this price was just looked up**, with its source.
4. After the generation, compare the actual `credits=` with the estimate. If they differ,
   fix the entry: it proves the lookup was wrong.

A **failed generation is not billed** (the balance is credited back within a minute).

---

## The pipeline, in five steps

The `scripts/kie.sh` script wraps the first four.

```bash
S=.agents/skills/kie-ai/scripts

$S/kie.sh credits                              # 1. balance before spending
$S/kie.sh upload my-image.jpg                  # 2. → temporary public URL
$S/kie.sh estimate payload.json                # → announce, wait for "kie ok N"
$S/kie.sh run payload.json generations/xxx.mp4 # 3+4+5. create, wait, download
```

`run` prints the state, the credits consumed and the generation time. It refuses to
download if the task failed.

Then, **write the `.json` sidecar** (see below) — otherwise the media shows up on the wall
without a prompt or a cost, which defeats the purpose of the tool.

> **Must the video loop?** Read the `video-loop` skill **before** writing the prompt: the
> loop is made in post, but its quality depends on the amount of motion requested here. A
> badly prompted clip gets paid for, then won't loop.

### Why go through upload

The API only accepts URLs (`^(https?|oss)://`), never a local file or base64 in
`image_urls`. The upload endpoint is on a **different host** from the generation API:
`https://kieai.redpandaai.co/api/file-stream-upload`.

**URLs are temporary on both sides** — the upload's as well as the result's. Download the
media immediately; never reference a Kie URL from the sidecar as if it were permanent.

---

## Reference model: Kling 3.0 Omni

Four modes, four identifiers:

| Identifier | Input | Use |
| --- | --- | --- |
| `kling-3.0-omni/text-to-video` | prompt only | creation from scratch |
| `kling-3.0-omni/image-to-video` | 1 image (start) **or** 2 (start + end) | **animate an existing image** |
| `kling-3.0-omni/reference-to-video` | up to 7 images and/or 1 video | recompose a scene from references |
| `kling-3.0-omni/transformation` | 1 source video + up to 4 images | transform a video |

**To animate an image while keeping its framing, use `image-to-video`.**
`reference-to-video` rebuilds a scene and guarantees neither the composition nor the
dimensions.

Prices, full schemas, file constraints and limits: [references/kling-3-omni.md](references/kling-3-omni.md).

---

## Hard-won lessons

Each one was paid for. Reread them before composing a call.

### 1. First frame = last frame **freezes** the video

Passing the same image twice in `image_urls` to get a perfect loop is a false good idea:
faced with "start from X, end at X", the model takes the shortest path, which is to not
move at all. Measured: SSIM 0.9998 between consecutive frames over the whole clip, and
1.000000 on the last two. 70 credits lost.

**Never ask the model for the loop.** A single start frame, free motion, and the seam is
made in post with the `video-loop` skill — for free and deterministically.

### 2. The prompt can reinforce stillness

The phrase "*ending in exactly the same state it began, so the clip loops seamlessly*"
adds to the two-frame constraint and makes the freeze worse. In a prompt meant to produce
motion, **demand amplitude** ("*completing a clearly visible arc of their orbit*") and
never mention a return to the initial state.

### 3. There is no `seed`

The schema exposes no seed: two identical calls give two different results, and **a 720p
test can't be "replayed" in 1080p**. A low-resolution test validates the *prompt*, never
the render.

Consequence for how to spend: the right strategy is **several takes, keep the best**, not
a single polished call. And since the 720p → 1080p gap is only 4 credits per second, a
720p test tier is only worth it to validate a new prompt — not to save money.

### 4. The SSIM profile ends with a `1.000000` that is an **artifact**

The motion measurement compares the stream shifted by one frame with the original stream.
They don't have the same length, and ffmpeg repeats the last frame for the final
comparison: **the last `1.000000` in the list therefore does not signal a duplicated
frame.**

This value once led to the wrong conclusion that a render ended on a frozen duplicate, in
two clips that had none. To check for a duplicate, **extract the last two frames and
compare them directly**.

### 5. `aspect_ratio` isn't free

`16:9`, `9:16` and `1:1` are accepted **only if `customize_multi_shots: true`**.
Otherwise it must be `auto` — which is exactly what you want to keep the source image's
dimensions. With two frames, `customize_multi_shots` **must** be `false`, so
`aspect_ratio` **must** be `auto`.

### 6. Audio has a cost, and moderation

`audio: true` raises 1080p from 18 to 23 credits/s. If moderation strips the audio (videos
with babies or profanity), half the credits are refunded and **retrying the same prompt
will fail**. For this project, `audio: false` by default.

### 7. Rate limit

20 new generation requests per 10 seconds, per account. Running takes in parallel is
possible, but not in unlimited bursts.

---

## Quality control: measure, then look

Never deliver a video without having measured it **and** watched it. Both, in that order,
and without letting the measurement decide alone.

**Did the motion happen?** SSIM between consecutive frames:

```bash
ffmpeg -y -i clip.mp4 -i clip.mp4 -lavfi \
  "[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=-" \
  -f null - 2>/dev/null | sed 's/.*All://;s/ .*//'
```

Benchmarks measured on this project: **≈ 0.9998 = frozen clip** (failure); **≈ 0.98 =
clear motion**. Ignore the final `1.000000`, it's an artifact (see lesson 4).

**Did the camera move?** Extract the first and last frames and compare them by eye on
still landmarks (a bright point, a sharp edge). An amplified difference map helps:

```bash
ffmpeg -v error -y -i f0.png -i f120.png \
  -lavfi "blend=all_mode=difference,format=gray,lutyuv=y=clip(val*14\,0\,255)" diff.png
```

> Don't amplify with `eq=contrast=…`: it saturates the image into a flat area and shows
> nothing.

**SSIM doesn't decide alone.** On diffuse textures (clouds, dust, flames, accretion disk),
it penalizes differences far more than the eye perceives them: watch the clip before
discarding it.

---

## Writing the sidecar

See [AGENTS.md](../../../AGENTS.md) for the full schema. Kie AI specifics:

- `service` — **`"Kie AI"`, nothing more.** Not `"Kie AI (Kling 3.0 Omni)"`: the model
  already has its own field, and the spend page groups by provider — a compound name
  creates a phantom provider and splits Kie AI's total into several lines.
- `model` — the identifier called (`kling-3.0-omni/image-to-video`), without appending the
  local steps that follow: those go in `notes` or in an extra field.
- `cost` — the amount **in USD**, never converted by hand: credits **actually consumed**
  (the `credits=` line of `run`) `× 0.005`, not the estimate. `currency: "USD"`.
- `width` / `height` — **required**, the server doesn't decode video containers. Read
  them with `ffprobe`, don't assume them.
- `duration` — in seconds, the actual one (`ffprobe`), not the one requested.
- Extra fields are kept and shown under "Other metadata", so fill them in generously:
  `credits`, `credits_rate`, `task_id`, `resolution`, `aspect_ratio`, `audio`,
  `generation_time_s`, `reference_image`, `verdict`.
- `notes` — **record what was tried and why this version was kept.** That's what makes a
  failure reusable six months later.
- Link variants together with `[[file-name-without-extension]]` in `notes`.

A locally derived render (loop, crop, re-encode) has `cost: 0`: **never count the
source's cost again**, the wall's total would become wrong. For a loop, the full sidecar is
described in the `video-loop` skill.

---

## Environment pitfalls

- **zsh doesn't split variables into words.** `set -- $cfg` doesn't work; use `${=cfg}`
  or an array. This skill's scripts are in `bash` for that reason.
- **`$VAR:e` is a zsh modifier.** In an ffmpeg filter, `start_frame=$S:end_frame=$E` gets
  silently eaten. **Always use braces: `${S}` / `${E}`.**
- `ffprobe` on `nb_frames` can lie; for a reliable count, use `-count_frames` and
  `nb_read_frames`.

Pitfalls specific to ffmpeg filter graphs (`blend`, `concat`, silently dropped frames) are
in the `video-loop` skill.

---

## Sources

- A model's docs: `https://docs.kie.ai/market/kling/v3-omni-<mode>.md`
  (the `.md` version renders the full OpenAPI schema, the HTML page doesn't).
- Index of all docs: `https://docs.kie.ai/llms.txt`
- The marketing pages `https://kie.ai/<model>` return **403 to WebFetch**; use `curl` with
  a browser User-Agent. Per-sub-model prices are in the app's JSON payload, field
  `pricingDesc` — invisible on the rendered page.
