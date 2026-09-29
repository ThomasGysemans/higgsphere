# Kling 3.0 Omni — prices, schemas, constraints

Read on 2026-08-31 from `https://kie.ai/kling-o3` and `https://docs.kie.ai/market/kling/`.
The model is also sold as **Kling O3** and **Kling VIDEO 3.0 Omni**.

## Capabilities

Multimodal references (text, images, videos, reusable "elements"), native audio,
consistent characters, multi-shot storytelling, **up to 15 seconds** per generation.

Compared with Kling VIDEO O1: native audio and multi-shot in every mode, reference by video
element, voice control for elements, duration 10 s → 15 s.

---

## Prices — credits per second ($0.005 per credit)

### `text-to-video` and `image-to-video`

| Resolution | Without audio | With native audio |
| --- | --- | --- |
| 720p | 14 cr/s — $0.070/s | 18 cr/s — $0.090/s |
| 1080p | 18 cr/s — $0.090/s | 23 cr/s — $0.115/s |
| 4K | 67 cr/s — $0.335/s | 67 cr/s — $0.335/s |

### `reference-to-video`

| Resolution | Without audio | With audio | With video input |
| --- | --- | --- | --- |
| 720p | 14 cr/s | 18 cr/s | 20 cr/s |
| 1080p | 18 cr/s | 23 cr/s | 27 cr/s |
| 4K | 67 cr/s | 67 cr/s | 67 cr/s |

### `transformation` (source video required)

720p: 20 cr/s · 1080p: 27 cr/s · 4K: 67 cr/s

> In 4K, audio is free — the price is flat at 67 cr/s in every case.
> Large top-ups give +10% bonus credits, i.e. an effective price ~10% below the amounts
> above.

### Common costs

| | 720p | 1080p | 4K |
| --- | --- | --- | --- |
| 3 s without audio | 42 cr — $0.21 | 54 cr — $0.27 | 201 cr — $1.01 |
| 5 s without audio | 70 cr — $0.35 | **90 cr — $0.45** | 335 cr — $1.68 |
| 10 s without audio | 140 cr — $0.70 | 180 cr — $0.90 | 670 cr — $3.35 |
| 15 s without audio | 210 cr — $1.05 | 270 cr — $1.35 | 1005 cr — $5.03 |

---

## Endpoints

| Role | Method and URL |
| --- | --- |
| Create a task | `POST https://api.kie.ai/api/v1/jobs/createTask` |
| Track a task | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…` |
| Balance | `GET https://api.kie.ai/api/v1/chat/credit` |
| File upload | `POST https://kieai.redpandaai.co/api/file-stream-upload` |

Authentication: `Authorization: Bearer <KIE_API_KEY>` header on every call, upload
included.

### `createTask` body

```json
{
  "model": "kling-3.0-omni/image-to-video",
  "callBackUrl": "https://…/callback",
  "input": { }
}
```

`callBackUrl` is optional and unusable locally (it needs a public endpoint): poll
`recordInfo` instead.

### `recordInfo` states

`waiting` → `queuing` → `generating` → `success` | `fail`

Useful fields: `state`, `creditsConsumed` (**filled in from `waiting` on**), `costTime`
(seconds), `failCode`, `failMsg`, `resultJson` (`{"resultUrls":[…]}`).

---

## `input` schema — `image-to-video`

Two mutually exclusive variants, told apart by the size of `image_urls`.

| Field | Type | Constraints |
| --- | --- | --- |
| `prompt` | string | **required**, ≤ 3072 characters, non-empty after trim |
| `image_urls` | array | **required**. **1** item = start frame. **2** items = start (index 0) + end (index 1) |
| `duration` | integer | 3 to 15, **default 5** |
| `resolution` | string | `720p` (default) \| `1080p` \| `4k` |
| `aspect_ratio` | string | `auto` (default) — `16:9`/`9:16`/`1:1` **only** if `customize_multi_shots: true` |
| `audio` | boolean | pass it explicitly |
| `customize_multi_shots` | boolean | default `false`. **Must be `false`** with two frames |
| `prefer_multi_shots` | boolean | automatic shot splitting. **Mutually exclusive** with `customize_multi_shots` |
| `multi_prompt` | array | required if `customize_multi_shots: true`, ≤ 6 shots, each `{duration: 1-15, prompt: ≤512 chars}` |
| `elements` | array | ≤ 3 reusable subjects, referenced as `@name` in the prompt |

### Input file constraints

| | Images | Videos |
| --- | --- | --- |
| Formats | JPG, JPEG, PNG | MP4, QuickTime |
| Max size | 50 MB | 200 MB |
| Dimensions | width **and** height ≥ 300 px | — |
| Ratio | between **0.4 and 2.5** | — |
| Count | depends on the mode | exactly 1 |

### `elements` sub-object

```json
{
  "name": "element_dog",
  "description": "A happy golden retriever",
  "element_input_urls": ["https://…/front.png", "https://…/side.png"],
  "element_input_audio_urls": [],
  "start_time": 0,
  "end_time": 8000
}
```

`element_input_urls`: **2 to 4 images** for a multi-view subject, **exactly 1 video** for a
character subject. No mixing. `start_time`/`end_time` in milliseconds, video only, with a
trimmed duration between 3000 and 8000 ms.

---

## Other modes — specifics

### `reference-to-video`

`video_urls` (0 or 1 video) and `image_urls` (up to 7 on their own, **capped at 4** if a
video is provided). Dependency rules enforced by the interface:

- video provided → `customize_multi_shots` forced to `false` and `aspect_ratio` forced to `auto`
- no video → `auto` unavailable

### `transformation`

`video_urls` required (exactly 1), `image_urls` up to 4 references.
`auto` required for a video alone, unavailable with a video **and** images.

### Multi-shot (all modes)

At most **6 shots**, **15 s in total**, 1 to 12 s per shot. Single shot: 3 to 15 s.
Global prompt ≤ 3072 characters, per-shot prompt ≤ 500 (interface) / 512 (API).

---

## What the API doesn't provide

- **No `seed`** — no reproducibility between two calls.
- **No `negative_prompt`** on this model.
- No control over motion speed other than through the prompt.

## Account limits

- 20 new generation requests per 10 seconds.
- Credits don't expire.
- A failed generation is fully refunded.
- If moderation strips the audio, half the credits are refunded and **retrying the same
  prompt will fail**.
