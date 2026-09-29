# higgsphere

**English** · [Français](README.fr.md) · [Español](README.es.md)

A local gallery for every image and video you generate with AI: newest first, each one next
to the exact prompt, model and cost that produced it. This repo comes with Claude skills to
optimise the generation process.

## Why

AI media ends up scattered across provider dashboards, download folders and chat
histories, and the prompt behind a result is usually lost. higgsphere keeps everything in
one folder and shows it as a masonry wall you can search and filter.

It is also built to be driven by an LLM. Instead of writing prompts by hand, you describe
what you want to Claude Code (or another service like Claude Code). It writes a detailed prompt,
calls the model, then saves the result together with its metadata.
Because every prompt stays next to its output, you can compare results,
keep the phrasings that work, and ask the LLM to improve the next attempt from what you already have.

## Setup

Requires Node.js 20.19+ (Vite 8).

```sh
npm install
npm run dev        # http://localhost:5173
```

To generate media from Claude Code, copy `.env.example` to `.env` and add your
[Kie AI](https://kie.ai) key.

## How it works

### Results folder

The `generations/` folder is the wall's only data source. Every image or video is stored
there, next to a `.json` file with the same name that records how it was made:

```
generations/
  2026-08-31-nebula-drift.png
  2026-08-31-nebula-drift.json
```

```json
{
  "prompt": "A vast nebula drifting through deep space, volumetric dust lanes lit from within",
  "model": "imagen-4-ultra",
  "service": "Google Vertex AI",
  "cost": 0.06,
  "created_at": "2026-08-31T10:31:00Z"
}
```

> The JSON files can include custom metadata that the LLM will set up.

New files show up on the wall within a second, with no reload or restart. Every field is
optional, and subfolders are fine. The full schema is in [CLAUDE.md](CLAUDE.md), which
Claude Code reads automatically, so it writes these files correctly without being told.

### The spend ledger

`generations/.higgsphere-ledger.jsonl` records everything you have paid for. A generation
is logged as soon as it appears in the folder, and the entry stays after the file is
deleted, whether you delete it from the app or with `rm`. Deleting a media file removes a
tile from the wall but doesn't lower the total spent. The **Spend** page (`/stats`)
reads the ledger to show spending over time, by provider and by model.

The ledger is append-only and committed to git. It's the one file in the folder that
can't be rebuilt from the others.

## Languages

The interface is available in **English, French and Spanish**. A language picker sits in
the header of every page.

- **What gets translated:** the interface itself (labels, buttons, empty states, error
  messages), plus date, number and percentage formats. Amounts are always shown in euros,
  whatever the language.
- **What never gets translated:** anything that comes from a sidecar. Prompts, notes,
  tags, model and provider names, file names and custom metadata are shown exactly as
  written.
- **Which language is used:** the last one picked in the header (saved in the browser's
  `localStorage`), otherwise the first browser language the app supports, otherwise
  English. The language is resolved before the first render, so the page never flashes
  in the wrong language.
- **Server messages** (read warnings, low-level errors) are developer diagnostics and
  stay in English. Errors a user can actually hit, such as a failed delete, carry a
  `code` that the client translates.

Translations live in [src/lib/i18n/](src/lib/i18n/). There is no i18n library. Each
language is a plain TypeScript object:

```
src/lib/i18n/
  en.ts             ← reference dictionary; its type is the contract (Messages)
  fr.ts, es.ts      ← typed as Messages
  index.svelte.ts   ← LOCALES list + the reactive `i18n` store
  plural.ts         ← plural helper built on Intl.PluralRules
```

Components read strings from `i18n.m`, for example `i18n.m.bar.filters`. `m` is derived
from the current language, so switching languages re-renders everything without a
reload.

### Adding a string

1. Add it to [`en.ts`](src/lib/i18n/en.ts). This file defines the `Messages` type.
2. Add it to every other dictionary. Until you do, `npm run check` fails and names the
   missing key.
3. Read it in a component through `i18n.m`.

A few conventions keep translations safe and type-checked:

- **Anything that depends on a value is a function**, such as
  `since: (date: string) => ...`. The compiler then checks parameters in every language.
- **Plurals use `plural()`** from [`plural.ts`](src/lib/i18n/plural.ts), not `n > 1`.
  Languages disagree: French treats 0 as singular, English and Spanish treat it as plural.
- **Inline code goes between backticks**, for example ``'Drop files into `generations/`'``.
  The `Rich` component renders those segments as `<code>`. Never put HTML in a
  translation.

### Adding a language

1. Copy `src/lib/i18n/en.ts` to `src/lib/i18n/<code>.ts`, type the export as `Messages`,
   and translate the values.
2. Register it in `LOCALES` in [`index.svelte.ts`](src/lib/i18n/index.svelte.ts), with its
   name written in that language (`Deutsch`, not `German`).
3. Run `npm run check`. A missing key, an extra key or a wrong parameter type fails the
   check.
4. Translate this README too, as `README.<code>.md`, and add it to the links at the top of
   each README.

## Skills

The Claude Code skills in [.claude/skills/](.claude/skills/) handle generation for you:

- [`kie-ai`](.claude/skills/kie-ai/SKILL.md) turns a description into a detailed prompt,
  generates images or videos through Kie AI (Kling, Veo, Seedream, Nano Banana…), and
  saves the result and its `.json` file to `generations/`. It estimates the cost first and
  spends nothing until you reply `kie ok <credits>`. A hook enforces this.
- [`video-loop`](.claude/skills/video-loop/SKILL.md) turns a generated video into a
  seamless loop. It runs locally with `ffmpeg`, so it costs nothing.

## Improving it

- **Add a provider:** write a skill in `.claude/skills/` that ends by saving the media and
  its sidecar to `generations/`. The wall doesn't need any changes.
- **Change the UI:** it's SvelteKit with Svelte 5 runes. [CLAUDE.md](CLAUDE.md) maps each
  file to its role. Every user-facing string goes through the dictionaries in
  [src/lib/i18n/](src/lib/i18n/), never hard-coded in a component.
- **Keep it local:** no runtime dependencies beyond SvelteKit, and no outbound network
  calls. Currency rates are fixed in [src/lib/currency.ts](src/lib/currency.ts), so update
  them from time to time.
- Run `npm run check` before opening a PR.
