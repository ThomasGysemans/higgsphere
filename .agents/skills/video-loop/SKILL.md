---
name: video-loop
description: Turn a video from generations/ into a seamless perpetual loop, locally and for free with ffmpeg — search for a clean cut point, half-period blend or localized crossfade, seam measurement, and the sidecar of the derived render. Use whenever a video must loop (animated background, wallpaper, GIF), or before generating a video meant to loop, to choose how much motion to ask for.
---

# Seamless video loop

Makes a loop from a video that was **already generated**, whatever service produced it.
Everything runs locally with `ffmpeg`: no credits, deterministic result, source left
untouched. Only requirement: `ffmpeg` (and `python3` for the cut-point search, with no
external dependency).

Everything below was verified hands-on between 2026-08-31 and 2026-09-01.

---

## Before generating the source

The loop is prepared from the prompt onwards. Two rules, learned the hard way:

- **Never ask the model for the loop.** Passing the same image as first and last frame, or
  writing "*ending in exactly the same state it began*", **freezes** the video: the model
  takes the shortest path, which is to not move at all. A single start frame, free motion,
  and the seam is made here. (Details and measurements: lessons 1 and 2 of the `kie-ai`
  skill.)
- **Ask for slow, continuous motion.** It's the total amount of motion that decides whether
  the clip will blend cleanly — see "What drives quality".

---

## Choosing the method

```bash
S=.agents/skills/video-loop/scripts
```

**1. Look for a clean cut first.** On near-periodic motion there may be two very similar
frames, and a clean cut always beats a blend:

```bash
python3 $S/find-loop-point.py source.mp4
```

It compares the MSE of the best pair with that of two consecutive frames. **If the ratio
exceeds ~10×, there is no cut point** — this is the case for any turbulent flow (smoke,
flames, dust, accretion disk), which never goes back through an earlier state. You then
have to blend, and there are two ways to do it.

**2. `halfperiod-loop.sh` — preferred.**

```bash
$S/halfperiod-loop.sh source.mp4 output.mp4 [slowdown]
```

Blends the first half of the clip with the second using a linear ramp. The wrap-around then
joins two **consecutive** frames of the source: **there is no localized transition,
anywhere**. The duration is halved, and the image is permanently an overlay of two states —
invisible on a diffuse texture, visible on sharp edges.

The `slowdown` parameter (motion interpolation) **lengthens the loop without making the
overlay worse**: the content gap between the two layers depends only on the source, never
on playback speed. A 15 s clip slowed down ×2 gives a 15 s loop.

**3. `seamless-loop.sh` — localized crossfade.**

```bash
$S/seamless-loop.sh source.mp4 output.mp4 [crossfade_frames]
```

Fades the last `D` frames into the first `D` and keeps almost the whole duration. In
return, a localized transition remains, all the more visible the longer the clip — the
crossfade then pairs very distant states. Reserve it for short clips or low-amplitude
motion. It drops the source's final frame if it is really duplicated (direct comparison
of the last two frames).

---

## What drives quality

It isn't the duration, it's **the total amount of motion** in the clip. Measure the gap of
the pair that will be blended (frame 0 against the middle frame): above ~0.75 SSIM the
blend is clean, below it starts to show. Hence the consequence for the prompt: **explicitly
asking for a slow rotation** makes a long clip compatible with blending. Verified — 15 s at
0.9923 per frame gives a better pair (0.754) than 5 s at 0.983 (0.705).

---

## Checking the result: measure, then look

Both blending scripts print the SSIM of the seam and that of the worst internal transition.
A seam close to the worst internal transition is invisible.

**Beware of over-trusting SSIM.** On diffuse textures (clouds, dust, flames, accretion
disk), SSIM penalizes a crossfade far more than the eye perceives it. A seam measured at
0.94 against a floor of 0.955 turned out perfectly clean on visual inspection. **Measuring
without looking leads to throwing away good results.** Play the loop several times in a
row before concluding.

**Check the frame count** of the output file against the expected value — a loop that ends
one frame early still looks plausible but is no longer a loop:

```bash
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames -of csv=p=0 output.mp4
```

(`nb_frames` without `-count_frames` can lie.)

In a frame-by-frame SSIM profile, the final `1.000000` is an **artifact** of the
measurement (ffmpeg repeats the last frame of the shorter stream), not a duplicated frame.

---

## Writing the sidecar of the derived render

The loop is a **new file** in `generations/`, never an overwrite of the source (rule from
[AGENTS.md](../../../AGENTS.md)). Its sidecar:

- `cost: 0` — **never count the source's cost again**, the wall's total and the spend page
  would count the same payment twice. Keep the source's `currency`.
- `service` and `model` — **the source's, as is.** The ffmpeg step belongs to neither:
  `"kling-3.0-omni/image-to-video + blend (ffmpeg)"` creates a phantom model in the facets.
- `prompt` — copied from the source, so the loop can still be found by search.
- `width` / `height` / `duration` — **required**, read with `ffprobe` on the output file
  (the duration is no longer the source's).
- Loop-specific fields, kept under "Other metadata": `source_file`, `loop_method` (method
  and script, e.g. `"halfperiod, .agents/skills/video-loop/scripts/halfperiod-loop.sh"`),
  `slowdown`, `frames`, `fps`, `seam_ssim`, `seam_ssim_worst_internal`, `verdict`.
- `notes` — the method chosen, why (clean cut failed, MSE ratio…), and a link to the
  source: `[[source-name-without-extension]]`.
- `tags` — the source's, plus `loop`.

---

## ffmpeg pitfalls

All hit while writing the scripts; none of them produces an error.

- **`$VAR:e` is a zsh modifier.** In an ffmpeg filter, `start_frame=$S:end_frame=$E` gets
  silently eaten. **Always use braces: `${S}` / `${E}`.** The scripts are in `bash` for
  this reason, among others.
- **In the `blend` filter, the `N` variable starts at 1, not 0.** A ramp written
  `N/(D-1)` therefore never equals 0 at the start and exceeds 1 at the end: both ends of
  the crossfade stay polluted, and the seam degrades with nothing to signal it. Write
  `(N-1)/(D-1)`. Checkable in one command — `blend=all_expr='N*10'` with raw `yuv420p`
  output gives 10, 20, 30… and not 0, 10, 20.
- **`concat` leaves irregular timestamps.** When encoding at a fixed frame rate, ffmpeg
  then drops a frame *with no error or warning* — in a loop, it is precisely the last one
  of the crossfade, and the seam shifts by one frame. Always renormalize with a
  `,fps=<rate>` after the `concat`, and check the frame count.
- After a filter graph, never assume the result: `ffmpeg` can succeed (exit code 0) having
  dropped everything. Read the `frame= … drop=N` summary line.
