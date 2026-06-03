# Lingua v23

> A zero-backend, single-file browser translation engine with a 10-provider redundant pipeline, context-aware PDF reflow, rich document format support, and an IndexedDB translation cache — all in one self-contained `index.html`.

---

## Table of Contents

1. [Overview](#overview)
2. [Feature Summary](#feature-summary)
3. [Architecture: The Big Picture](#architecture-the-big-picture)
4. [Design Tokens & Theming](#design-tokens--theming)
5. [UI Layout & Components](#ui-layout--components)
   - [Header](#header)
   - [Stats / Provider Bar](#stats--provider-bar)
   - [Language Bar](#language-bar)
   - [Text Translation Panel](#text-translation-panel)
   - [Neural Viz Loading Animation](#neural-viz-loading-animation)
   - [File Drop Zone & Queue](#file-drop-zone--queue)
   - [Console / Log Panel](#console--log-panel)
6. [Translation Provider Engine](#translation-provider-engine)
   - [Google Translate — Primary Endpoint](#google-translate--primary-endpoint)
   - [Google Translate — Secondary Endpoint](#google-translate--secondary-endpoint)
   - [LibreTranslate (3 public instances)](#libretranslate-3-public-instances)
   - [MyMemory](#mymemory)
   - [Lingva (3 public instances)](#lingva-3-public-instances)
   - [Apertium](#apertium)
   - [Provider Health Probing](#provider-health-probing)
7. [Master Translation Orchestrator](#master-translation-orchestrator)
   - [Phase 1 — Google Translate Race](#phase-1--google-translate-race)
   - [Phase 2 — Fallback Provider Sweep](#phase-2--fallback-provider-sweep)
   - [Skip Filter](#skip-filter)
8. [IndexedDB Translation Cache](#indexeddb-translation-cache)
9. [Text Translation Flow](#text-translation-flow)
10. [Language Support](#language-support)
11. [File Translation Pipeline](#file-translation-pipeline)
    - [PDF Pipeline (full detail)](#pdf-pipeline-full-detail)
      - [PDF.js Text Extraction](#pdfjs-text-extraction)
      - [Header/Footer Stripping](#headerfooter-stripping)
      - [Line Grouping Algorithm](#line-grouping-algorithm)
      - [Font Style Detection (bold/italic/underline/strikethrough)](#font-style-detection)
      - [Font Family Detection & Auto-Selection](#font-family-detection--auto-selection)
      - [Paragraph Builder](#paragraph-builder)
      - [Context-Aware Translation for PDF](#context-aware-translation-for-pdf)
      - [Post-Processing Grammar Fixer](#post-processing-grammar-fixer)
      - [PDF Rendering with pdf-lib](#pdf-rendering-with-pdf-lib)
      - [Font Embedding (Standard + Noto Script Fonts)](#font-embedding-standard--noto-script-fonts)
      - [Page Layout & Reflow Engine](#page-layout--reflow-engine)
      - [RTL Language Support](#rtl-language-support)
      - [Page Numbering](#page-numbering)
    - [DOCX / DOC / ODT Pipeline](#docx--doc--odt-pipeline)
    - [EPUB Pipeline](#epub-pipeline)
    - [TXT Pipeline](#txt-pipeline)
12. [File Queue System](#file-queue-system)
    - [Batch Download (ZIP)](#batch-download-zip)
13. [Live Dashboard & Stats](#live-dashboard--stats)
14. [External Libraries (CDN-loaded)](#external-libraries-cdn-loaded)
15. [Everything You Could Have Explicitly Asked For](#everything-you-could-have-explicitly-asked-for)

---

## Overview

Lingua v23 is a **fully client-side, zero-dependency-on-a-backend** translation tool delivered as a single HTML file. It runs entirely in the user's browser, making direct API calls to a cascade of free public translation endpoints. There is no server, no user account, no API key, and no data transmitted to any proprietary service beyond the translation requests themselves.

The application handles two distinct workflows from one unified interface:

- **Text translation** — type or paste up to 5,000 characters and get a translation immediately.
- **Document translation** — drop one or more files (PDF, DOCX, DOC, ODT, EPUB, TXT) and receive translated, downloadable output files.

Both workflows share a single language selector bar, a single provider health dashboard, and a single IndexedDB-backed translation cache.

---

## Feature Summary

| Feature | Detail |
|---|---|
| Translation providers | 10 (2× Google Translate, 3× LibreTranslate, MyMemory, 3× Lingva, Apertium) |
| Languages | 50 source / 49 target (full ISO-639-1 list) |
| Text limit | 5,000 characters per text request |
| File formats | PDF, DOCX, DOC, ODT, EPUB, TXT |
| PDF formatting preserved | Bold, italic, underline, strikethrough, headings, centered text |
| PDF font families | Times Roman, Helvetica, Courier, 8× Noto script variants |
| Translation cache | IndexedDB — persists across sessions, key = `srcLang|tgtLang|text` |
| Batching | GT primary batches 40 texts per request at 30 concurrent batches |
| Concurrency | Per-provider configurable (GT: 30, LT: 20/instance, Lingva: 12, MM: 8, AP: 8) |
| Fallback chain | Phase 1 → Phase 2, priority: GT > LT > MM > Lingva > Apertium |
| RTL rendering | Arabic, Farsi, Urdu, Hebrew — right-aligned text in PDF output |
| Context-aware PDF translation | Previous paragraph passed as context prefix to preserve pronouns/tense |
| Auto language detection | "Auto-detect" option on source language |
| Provider health probing | On startup, all 10 providers tested with "Hello world" |
| Dead provider tracking | Per-instance alive flags — failed providers skipped automatically |
| Grammar post-processing | 8 deterministic regex fixes for Slavic→Latin MT artifacts |
| Batch ZIP download | All translated files packaged into one `.zip` via JSZip |
| Neural network animation | Canvas-rendered pulsing node graph shown during active translation |
| Live stats bar | Strings/sec throughput, translated count, cache hit count |
| Console panel | Timestamped event log (ms precision) with color-coded severity levels |

---

## Architecture: The Big Picture

```
┌─────────────────────────────────────────────────────┐
│                  Browser (index.html)                │
│                                                      │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │  Text UI  │  │ File Queue │  │ Provider Pills  │  │
│  └────┬──────┘  └─────┬──────┘  └────────┬────────┘  │
│       │               │                  │            │
│       └───────┬────────┘                 │            │
│               ▼                          │            │
│     ┌──────────────────┐                 │            │
│     │ TranslationCache │◄────────────────┘            │
│     │   (IndexedDB)    │                              │
│     └────────┬─────────┘                              │
│              │ cache miss                             │
│              ▼                                        │
│     ┌─────────────────────────────────┐               │
│     │   translateAll() orchestrator   │               │
│     │                                 │               │
│     │  Phase 1: GT/primary + GT/alt   │               │
│     │  (both fired in parallel)       │               │
│     │                                 │               │
│     │  Phase 2: LT + MM + Lingva + AP │               │
│     │  (for any GT misses)            │               │
│     └───────────────┬─────────────────┘               │
│                     │                                  │
│        ┌────────────┼────────────┐                    │
│        ▼            ▼            ▼                    │
│   GT endpoints   LT × 3     Lingva × 3               │
│   (primary,      round-     round-robin               │
│    secondary)    robin                                 │
│                  + MM + Apertium                      │
└─────────────────────────────────────────────────────┘
```

The engine is **non-blocking**: all provider calls use `fetch` + `AbortSignal.timeout()`. No provider failure can crash or stall the entire pipeline. Every provider result is written to the IndexedDB cache immediately after receipt.

---

## Design Tokens & Theming

All colors and typography are expressed as CSS custom properties on `:root`, making the entire dark theme trivially reskinnable:

| Variable | Value | Purpose |
|---|---|---|
| `--bg` | `#07070d` | Page background |
| `--sf` | `#0e0e18` | Surface (stats bar, viz loader) |
| `--card` | `#13131e` | Card / text box backgrounds |
| `--bd` | `rgba(255,255,255,0.07)` | Default border |
| `--bhi` | `rgba(255,255,255,0.13)` | Hovered/highlighted border |
| `--tx` | `#f0eff7` | Primary text |
| `--mu` | `rgba(240,239,247,0.42)` | Muted/secondary text |
| `--ac` | `#6c5ce7` | Accent purple |
| `--gl` | `rgba(108,92,231,0.18)` | Accent glow overlay |
| `--ac2` | `#a78bfa` | Lighter accent |
| `--ac3` | `#818cf8` | Tertiary accent (indigo) |
| `--gn` | `#00d68f` | Green (success/done) |
| `--wa` | `#f59e0b` | Amber (warning) |
| `--rd` | `#ef4444` | Red (error) |
| `--mono` | `'DM Mono'` | Monospace font (labels, stats, console) |
| `--sans` | `'Syne'` | Sans-serif font (headings, UI) |

Both fonts are loaded from Google Fonts via a single `@import` at the top of the stylesheet.

---

## UI Layout & Components

### Header

A `position: sticky` header with `backdrop-filter: blur(12px)` and a semi-transparent background (`rgba(7,7,13,.92)`) stays pinned at the top during scroll. It contains:

- **Logo**: "Lingua" in a three-stop linear gradient (`#6c5ce7 → #a78bfa → #818cf8`) applied via `-webkit-background-clip: text` for a gradient text effect.
- **Version badge**: `v23` styled as a pill with a subtle border and accent color tint.
- **Status area** (right): A small dot and text label. The dot turns green (with a box-shadow glow) when providers are live. The `setStatus()` function controls both.

### Stats / Provider Bar

A horizontally scrollable flex row with a left-side purple gradient overlay (`::before` pseudo-element).

**Stat counters** (left side, 3 items separated by 1px dividers):
- `tv-rps` — strings/second throughput, recalculated every 300ms while a translation job is running.
- `tv-done` — total strings translated this session.
- `tv-cache` — total entries currently in IndexedDB (read on startup, incremented on each `setMany()` call).

**Provider pills** (right side, flex-wrap): One pill per provider endpoint. Pills have three CSS states:
- `.ok` — green border/text, green tinted background.
- `.active` — accent border/text with a keyframe blink animation (`pill-blink`, 0.7s infinite).
- `.err` — red border/text at 40% opacity.

Pills are toggled via `setPill(id, cssClass)` at the start and end of every provider call.

### Language Bar

A two-`<select>` row with a swap button between them. Key behaviors:

- Both selects are populated by `buildLanguageSelect()`, which maps the `LANGS` array (50 entries) to `<option>` elements.
- The target language select has `skipAuto = true` — "Auto-detect" is only available as a source language.
- Default target language is `fr` (French), set immediately after population.
- The swap button calls `swapLangs()`, which exchanges the two values only if the source is not "auto". A CSS `transform: rotate(180deg)` plays on hover.
- The `langNote` span to the right can display contextual hints (currently unused in the HTML but wired up).

### Text Translation Panel

A two-column CSS grid (50/50 split):

**Left box (source):**
- `<textarea>` with `maxlength="5000"`.
- An inline `oninput` handler updates the character counter (`#cc`) in real time as `N/5000`.

**Right box (output):**
- Not a textarea — a `<div class="translation-output">` with `white-space: pre-wrap` to preserve line breaks in the result.
- Shows a muted italic placeholder until a translation arrives.
- The provider label (`#wprov`) in the box header shows the elapsed time in milliseconds after completion.

**Action row** below the grid:
- **Translate** button — triggers `translateText()`.
- **Copy** button — `navigator.clipboard.writeText()` on the output div's `textContent`.
- **Clear** button — wipes both the textarea and output, resets the character counter.

### Neural Viz Loading Animation

A `<div class="viz-loader">` that is hidden by default and shown/hidden by `vizShow()`/`vizHide()` toggling the `.active` class.

It contains:
- A `<canvas>` element rendered by the `NeuralViz` class (described in detail below).
- An overlay with a label line (`tVizLabel`) and subtitle (`tVizSub`).
- A progress bar track + fill (`tpbar`) driven by `setProgressBar()`.
- A footer with left label (`tplbl`) and right ETA label (`tpeta`).

#### NeuralViz Class — Canvas Animation Engine

A self-contained ES class that draws an animated neural network graph on a `<canvas>`.

**Node layout**: 9 nodes placed at hardcoded relative positions (`[xRatio, yRatio]`) scaled to the canvas dimensions. Each node has:
- A random starting `phase` for its sinusoidal brightness oscillation.
- A random `speed` multiplier.
- A `pulse` value (0–1) that spikes to 1 when a particle arrives and decays by 0.04 per frame.

**Edge topology**: 12 directed edges connecting the nodes in a roughly left-to-right flow pattern (mimicking signal propagation through layers).

**Particles**: Spawned every 80–200ms on a random edge, travelling from source node to destination node over 30–60 frames. Each particle:
- Interpolates position linearly (`lerp` via `progress = t / dur`).
- Grows in size via `Math.sin(progress * Math.PI)` (bell curve — small at start/end, large in middle).
- Fades alpha the same way.
- Triggers a `pulse` spike on the destination node when it arrives.

**Rendering loop**: Uses `requestAnimationFrame`. Each frame:
1. Clears the canvas.
2. Draws edges with sinusoidally varying alpha.
3. Updates and draws particles with radial gradient fills.
4. Draws nodes with layered radial gradients (outer glow + inner core), sized by current pulse level.

**DPR support**: Canvas width/height are multiplied by `devicePixelRatio` and CSS size is fixed at 100%/90px, giving crisp rendering on retina displays.

### File Drop Zone & Queue

**Drop zone**: A dashed-border `<div>` with an invisible `<input type="file" multiple>` overlaid at `position: absolute; inset: 0; opacity: 0`. This means both click-to-browse and drag-and-drop are handled:
- Click hits the input's native file picker.
- Drag uses `dragover` / `dragleave` / `drop` event listeners on the `#mainDz` element. The `dragover` handler adds the `.over` class (purple border + glow). The `drop` handler filters dropped files by extension regex (`/\.(pdf|docx|doc|odt|epub|txt)$/i`) before calling `addFiles()`.

**Font picker bar** (`#fontBar`): Hidden by default, shown (via `.show` class) whenever a PDF is added to the queue. Gives users 5 output font options:
- Times New Roman (default for serif-detected PDFs)
- Helvetica (default for sans-detected PDFs)
- Courier (default for mono-detected PDFs)
- Noto Serif (user override for non-Latin scripts)
- Noto Sans (auto-selected for CJK, Arabic, Devanagari, Tamil, Telugu, Bengali, Thai targets)

**Queue action bar** (`#queueActs`): Hidden until files are added. Contains:
- **▶ Translate** button — starts `runQueue()`.
- **⬇ Download All** button — appears only when 2+ files are done; triggers `downloadAll()`.
- **✕ Clear** button — wipes the queue.
- Queue summary label (`N files · N done · N failed`).

**File rows**: Each queued file gets a `<div class="file-row">` rendered by `renderFileRow()` with:
- Icon (emoji based on extension: 📄 PDF, 📝 DOCX/DOC/ODT, 📖 EPUB, 📃 TXT).
- File name (truncated with `text-overflow: ellipsis`).
- Subtitle line (`#sub-{id}`) showing status messages, progress descriptions, and final stats.
- Progress bar (`#bar-{id}`) filled by `setRowProgressBar()`.
- Actions area (`#act-{id}`) — starts as a remove (✕) button; replaced with green download button(s) on completion.

Row border color changes via CSS classes:
- `.running` — accent purple border.
- `.done` — green border.
- `.err` — red border.

### Console / Log Panel

A fixed-height scrollable panel styled like a terminal. Features:

- **Timestamps**: `HH:MM:SS.mmm` precision (milliseconds via `Date.getMilliseconds()`).
- **Log levels** via CSS classes on the `.log-msg` span: `d` (default/dim), `i` (info), `h` (highlight/bright), `ok` (green), `w` (amber warning), `e` (red error).
- **Dot indicator** (`#ldot`): Flashes on for 500ms on every new log event.
- **Event counter**: Shows `N events` updated on each `log()` call.
- **Clear button**: Resets the log and counter.
- All user-supplied strings are HTML-escaped (`replace(/</g, '&lt;')`) before insertion.
- Auto-scrolls to bottom on every new entry (`logEl.scrollTop = logEl.scrollHeight`).

---

## Translation Provider Engine

### Google Translate — Primary Endpoint

**Endpoint**: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=...&tl=...&dt=t&q=...`

**Batching strategy**: Multiple texts are joined into a single string using a Unicode sentinel separator: `'\u2060|\u2060'` (word-joiner + pipe + word-joiner). This sequence is:
- Visually invisible to users.
- Rare enough in natural language that it survives the translation engine intact.
- Used to split the translated response back into individual translated strings.

Each batch contains up to `GT_BATCH_MAX = 40` texts. Up to `GT_CONCURRENCY = 30` batches are fired concurrently via `Promise.allSettled()`.

**Splitting logic**: After translation, the result string is split on `\u2060|\u2060`. A fallback newline split is used if the sentinel was lost by Google (some language pairs strip it).

**Timeout**: 14 seconds per batch request via `AbortSignal.timeout(14000)`.

### Google Translate — Secondary Endpoint

**Endpoint**: `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=...&tl=...&q=...`

This endpoint returns inconsistent JSON shapes depending on the language pair, so `extractGtSecondaryValue()` normalizes six different response shapes:
- Plain string
- `[string, ...]`
- `[[string, ...], ...]`
- `[{t/trans/translation: ...}, ...]`
- `{t/trans/translation: ...}`

The secondary endpoint does **not** batch reliably (multi-text joins often produce garbled results), so texts are translated one-at-a-time via `Promise.all()`.

Both GT endpoints are always fired in parallel. In `translateAll()`, `gt2Results` is assigned first and then `gt1Results` overwrites it — so the primary endpoint wins any ties (it's generally more reliable).

### LibreTranslate (3 public instances)

Three public LibreTranslate instances are used:

| Pill ID | URL |
|---|---|
| `lt1` | `https://libretranslate.terraprint.co/translate` |
| `lt4` | `https://lt.er.al/translate` |
| `lt5` | `https://translate.astian.org/translate` |

Each is called via `POST` with a JSON body `{q, source, target, format: "text"}`.

**Dead-instance tracking**: Each instance has an entry in `ltAlive`. HTTP 400, 403, 429, or 503 responses permanently disable the instance for the session (the instance is likely quota-exceeded or down). A JSON-level `error` field also triggers permanent disabling.

**Language code normalization**: LibreTranslate uses ISO-639-1 base codes (e.g., `zh` not `zh-CN`), handled by `ltLangCode(c)` which strips the subtag.

**Concurrency**: Texts are round-robin distributed across alive instances. Up to `20 × alive.length` requests fire concurrently per chunk.

**Timeout**: 10 seconds per request.

### MyMemory

**Endpoint**: `https://api.mymemory.translated.net/get?q=...&langpair=src|tgt`

MyMemory requires BCP-47 style tags with uppercase region subtags (e.g., `zh-CN` not `zh-cn`), normalized by `mmLangCode()`.

**Constraints**:
- Hard 500-character limit per request (longer texts are silently skipped).
- After 5 consecutive failures, `mmFailCount > 5` triggers permanent disabling for the session (quota protection).
- Responses with `responseStatus !== 200 && !== 206` count as failures.
- The literal string `"PLEASE SELECT TWO DISTINCT LANGUAGES"` is detected and treated as an error.

**Concurrency**: 8 requests in parallel.

**Timeout**: 8 seconds.

### Lingva (3 public instances)

Three public Lingva Translate instances (a Google Translate front-end with a REST API):

| Pill ID | URL |
|---|---|
| `lv1` | `https://lingva.garudalinux.org` |
| `lv2` | `https://lingva.ducks.party` |
| `lv3` | `https://translate.plausibility.cloud` |

**Endpoint pattern**: `GET {instance}/api/v1/{src}/{tgt}/{encodedText}`

Response field priority: `json.translation || json.result || json.translated`.

**Dead-instance tracking**: Any non-OK HTTP response permanently disables the instance in `lvAlive`.

**Concurrency**: Texts are round-robin distributed across alive instances. 12 requests fire concurrently.

**Timeout**: 9 seconds.

### Apertium

**Endpoint**: `https://www.apertium.org/apy/translate?q=...&langpair=ISO639-3src|ISO639-3tgt`

Apertium uses ISO-639-3 language codes (3-letter), not ISO-639-1. The `APERTIUM_LANG_MAP` dictionary maps the app's ISO-639-1 codes to Apertium's equivalents for ~20 languages. Unsupported pairs are silently skipped.

**Dead-flag**: A single `apertiumDead` boolean is set to `true` on any 4xx response. Once dead, all subsequent calls are skipped without a network request.

**Concurrency**: 8 requests in parallel.

**Timeout**: 8 seconds.

**Response validation**: Results containing `"ERROR:"` are treated as failures.

### Provider Health Probing

On application startup, `probeAllProviders('en', 'fr')` fires immediately. It runs `Promise.allSettled()` across all 10 provider endpoints simultaneously, sending `"Hello world"` as the test string.

Results are logged to the console and update each pill's state (`.ok` or `.err`). Providers that fail probing have their alive flags set to `false` before any real translation work begins. The header status indicator updates to show `N providers` (green dot) when probing completes.

---

## Master Translation Orchestrator

`translateAll(uniqueTexts, srcLang, tgtLang, onProgress)` is the core function. It accepts an array of **already-deduplicated** text strings and returns a `{ text → translation }` map.

### Phase 1 — Google Translate Race

Both GT endpoints are fired simultaneously with `Promise.all()`. Results from both are merged, with primary taking priority over secondary (`Object.assign(results, gt2Results, gt1Results)`).

After Phase 1, `afterGT` = texts that still have no translation.

### Phase 2 — Fallback Provider Sweep

If any texts remain untranslated after Phase 1, all four fallback providers fire in parallel:
- `ltTranslateAll()` — LibreTranslate (all alive instances)
- `mmTranslateAll()` — MyMemory
- `lingvaTranslateAll()` — Lingva (all alive instances)
- `apertiumBatch()` — Apertium (if pair supported and not dead)

Results are merged in **ascending priority order**: `Object.assign(results, apRes, lvRes, mmRes, ltRes)`. This means LibreTranslate wins over MyMemory, which wins over Lingva, which wins over Apertium. Higher-quality providers overwrite lower-quality ones.

After both phases, all new translation pairs are written to the IndexedDB cache via `TranslationCache.setMany()`.

`onProgress(done, total)` is called after Phase 1 and after Phase 2 to drive the progress bar UI.

### Skip Filter

`SKIP_RE` is applied to every text before any translation attempt:

```
/^[\d\s.,;:!?()\[\]{}\-+=%@#$^&*|/<>~`'"\\]+$|^.{1,2}$|^https?:\/\//
```

This matches (and skips):
- Pure punctuation/number/symbol strings.
- Strings of 1 or 2 characters.
- URLs starting with `http://` or `https://`.

These strings are passed through untranslated in the output.

---

## IndexedDB Translation Cache

Implemented as an IIFE returning `{ getMany, setMany }`.

**Database name**: `lingua23`  
**Object store**: `t`  
**Key path**: `k`  
**Key format**: `` `${srcLang}|${tgtLang}|${text}` ``

This means the same text with different language pairs gets independent cache entries.

**`getMany(texts, srcLang, tgtLang)`**: Opens the DB, fires one `IDBObjectStore.get()` per text wrapped in `Promise.all()`. All lookups happen in a single `readonly` transaction for efficiency. Returns a map of `{ text → cachedTranslation }` for all cache hits.

**`setMany(pairs, srcLang, tgtLang)`**: Opens a single `readwrite` transaction and calls `store.put()` for each `[text, value]` pair in a loop before the transaction commits. After commit, it recounts all entries and updates the `#tv-cache` stats display.

On initial DB open, `countEntries()` populates the cache stat counter immediately so the user sees their accumulated cache size on page load.

---

## Text Translation Flow

`translateText()` is the event handler for the Translate button. Full execution sequence:

1. Reads and trims `#srcText`. Aborts if empty or same src/tgt language.
2. Disables the button, shows spinner text.
3. Clears the output div, shows the neural viz animation.
4. Sets progress bar to 15%.
5. **Fast path**: Fires both GT endpoints in a `Promise.race()`. Whichever returns first wins. If either returns a non-empty result, it's used immediately.
6. If the fast path throws (both GT endpoints fail or both return empty), falls back to the full `translateAll()` engine with all 10 providers.
7. On success: sets the output div's `textContent`, records elapsed time in the provider label.
8. Writes the result to the cache.
9. Stops the neural viz animation, re-enables the button.
10. Hides the viz loader after a 1200ms delay (so the "Done!" state is briefly visible).

---

## Language Support

50 language entries total. The source selector includes "Auto-detect" (`auto`). The target selector starts at French.

Languages covered (BCP-47 codes): `en`, `fr`, `de`, `es`, `it`, `pt`, `ru`, `zh-CN`, `zh-TW`, `ja`, `ko`, `ar`, `hi`, `bn`, `tr`, `vi`, `th`, `pl`, `nl`, `sv`, `uk`, `cs`, `ro`, `hu`, `he`, `id`, `ms`, `el`, `bg`, `sk`, `hr`, `lt`, `lv`, `et`, `sr`, `ta`, `te`, `ur`, `fa`, `sw`, `af`, `ne`, `ca`, `fi`, `da`, `no`, `sl`, `is`, `az`.

---

## File Translation Pipeline

### PDF Pipeline (full detail)

The PDF pipeline is the most complex path. It proceeds through 8 distinct stages.

#### PDF.js Text Extraction

`pdfjs-dist@4.4.168` is dynamically imported from jsDelivr CDN. The worker is pointed at the same CDN:

```js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
```

The original file bytes are loaded into a `Uint8Array` via `File.arrayBuffer()`. PDF.js parses the document to get a `PDFDocumentProxy`. `extractPdfPages()` iterates every page and calls `page.getTextContent()` to get raw `TextItem` objects.

#### Header/Footer Stripping

Each page's height is used to compute exclusion zones:

- **Header zone**: Y > `pageHeight × 0.91` (top 9%)
- **Footer zone**: Y < `pageHeight × 0.09` (bottom 9%)

PDF.js uses a coordinate system where Y=0 is at the **bottom** of the page. Items outside the content band are discarded before any further processing.

Additionally, lines matching `/^[\s\u2013\u2014-]*\d{1,4}[\s\u2013\u2014-]*$/` (bare page numbers, optionally surrounded by dashes) are filtered out.

#### Line Grouping Algorithm

PDF text items do not come pre-grouped into lines. Items are grouped by their Y coordinate using a ±3px tolerance bucket:

1. For each text item, its Y is rounded to the nearest integer.
2. The existing line map is scanned for a key within 3 pixels. If found, the item is added to that bucket. If not, a new bucket is created.

Within each bucket, items are sorted left-to-right by `transform[4]` (the X position). Items are concatenated into a line string, inserting a space when `item.hasEOL` is true or when the gap between adjacent items exceeds 30% of the preceding item's width (detecting word spacing in the original PDF).

Lines are then sorted top-to-bottom by descending Y value.

#### Font Style Detection

`detectFontStyle(fontName)` inspects the PDF font name string for substrings: `bold`, `heavy`, `black` (bold), `italic`, `oblique`, `slant` (italic), `underline`, `underscor` (underline), `strike`, `strikethru` (strikethrough).

Style is determined per line by **majority vote** across all text items in the line. If a style flag is set on at least 40% of items (or at least 1 item), it applies to the whole line. This prevents a single bold character from marking an entire line as bold.

Font size is extracted from the transformation matrix: `Math.max(Math.abs(transform[0]), Math.abs(transform[3]))`, which handles both horizontal and vertical scaling. It's clamped to a minimum of 6pt.

#### Font Family Detection & Auto-Selection

`detectPdfFontFamily()` builds a frequency count of all font names across all text items on the first page (stripping non-alpha characters, lowercasing). The most-used font name is classified:

- Contains `times` or `georgia` → `'times'`
- Contains `helvetica`, `arial`, or `sans` → `'sans'`
- Contains `courier` or `mono` → `'mono'`
- Otherwise → `'serif'`

`autoSelectFont()` then picks the output font picker value:
- If the **target language** uses a special script (CJK, Arabic, Devanagari, Tamil, Telugu, Bengali, Thai) → forces Noto Sans for the appropriate script.
- Otherwise maps the detected family: `times/serif` → Times Roman, `mono` → Courier, everything else → Helvetica.
- Shows the `#fontBar` and writes a note (e.g., "Matched serif.") to `#fontNote`.

#### Paragraph Builder

`buildParagraphs(allPageData, medianFz)` merges the flat array of lines into logical paragraphs before translation. This is a crucial step: translating full paragraphs preserves pronoun, gender, and tense context that would be lost if each line were translated individually.

**Heading detection**: A line is classified as a heading if it is centered, or its font size exceeds `medianFz × 1.15`, or it is bold with font size exceeding `medianFz × 1.05`.

**Y-gap ratio**: The vertical distance between consecutive lines is divided by the expected line height (`fontSize × 1.35`). A ratio > 1.55 is a "big gap" indicating a paragraph break.

**Paragraph break rules** (any condition triggers a new paragraph):
1. No current paragraph exists (start of document).
2. Current line is a heading.
3. Big vertical gap AND the line is not a short fragment (≤3 words without sentence-ending punctuation).
4. The most recently appended line ended with sentence-terminating punctuation (`.!?…»")`]:`), AND the gap ratio is > 0.85.
5. The current paragraph was itself a heading.

**Page boundary handling**: Page transitions set `yGapRatio = 1.0` (neutral) for the first line of a new page. This prevents a new paragraph from being forced solely because lines are on different pages — a sentence that spans a page break continues correctly.

**Hyphenation handling**: If the current paragraph text ends with a hyphen or non-breaking hyphen (`-` or `\u2011`), the next line is joined with no separator (the hyphen acts as the word break). Otherwise a space is inserted.

**Short fragment merging**: Lines of 1–3 words without sentence-ending punctuation are always merged into the current paragraph regardless of other gap/sentence signals, preventing stray words from becoming isolated paragraphs.

#### Context-Aware Translation for PDF

`translateWithContext(paragraphs, srcLang, tgtLang, onProgress)` is a specialized variant of `translateAll()` designed for document-order translation:

1. **Cache warm-up**: All unique paragraph texts are bulk-queried against IndexedDB first.
2. **Context prefix construction**: For each uncached paragraph (in document order), the previous non-heading paragraph's text (up to 120 characters, taken from the tail) is prepended, separated by a **three-em dash** (`\u2E3B`). This character is rare enough in natural text that it survives machine translation without corruption, allowing the context prefix to be stripped after translation.
3. **Augmented batch translation**: The context-augmented strings are translated via `gtTranslateAll()` (both primary and secondary GT endpoints in parallel).
4. **Context stripping**: After translation, the three-em dash is located in each result string, and everything before and including it is discarded, leaving only the translation of the actual target paragraph.
5. **Phase 2 fallback**: Any paragraphs not translated by GT are passed to LT + MM + Lingva (context is less critical for fallback providers, so plain text is used).

#### Post-Processing Grammar Fixer

`postProcessTranslations()` applies 8 deterministic regex-based corrections to translations from **Slavic source languages** (Russian, Ukrainian, Bulgarian, Serbian, Polish, Czech, Slovak, Croatian, Slovenian, Bosnian, Macedonian). These address predictable artifacts that free MT engines produce on this language pair:

1. **Adjective-as-proper-noun**: Strips adjectival suffixes (`-ian/-ean/-an`) from capitalized proper nouns when they appear in an adjectival context (`called`, `known as`, `named`, etc.).
2. **Sentence-start capitalization**: Ensures the first letter after `.!?…` is uppercase.
3. **Doubled articles/prepositions**: Removes duplicates like `"the the"`, `"of of"`, `"in in"`.
4. **Orphan conjunction capitalization**: Capitalizes conjunctions/adverbs at paragraph start that were split from a preceding sentence (`And`, `But`, `However`, `Therefore`, etc.).
5. *(Placeholder)* — short stray fragments handled by `buildParagraphs`.
6. **Bare em/en dash lines**: Removes lines consisting of only a dash (a dialogue marker artifact with no text).
7. **Doubled prepositions from source phrase structure**: Fixes patterns like `"listened to to the end"` → `"listened to the end"`.
8. **First-character capitalization**: Ensures every paragraph's first character is uppercase regardless of source.

#### PDF Rendering with pdf-lib

`renderTranslatedPdf()` dynamically imports `pdf-lib@1.17.1` from jsDelivr. It:

1. Loads the **original** PDF bytes to read the first page's dimensions (width/height in PDF points).
2. Creates a **new blank** `PDFDocument` — it does not modify the original. The output is always a clean reflow.
3. Calls `embedPdfFonts()` to embed the selected font family.
4. Resolves translations: for each paragraph, uses the translation if available, otherwise falls back to the original text.

#### Font Embedding (Standard + Noto Script Fonts)

**Standard fonts** (Times Roman, Helvetica, Courier): These are embedded via `pdf-lib`'s built-in `StandardFonts` enum. All four variants (regular, bold, italic, boldItalic) are embedded for each family.

**Noto fonts** (for special scripts): Fetched as WOFF2/WOFF binaries from jsDelivr's `@fontsource` CDN packages and embedded as custom fonts via `pdfDoc.embedFont(bytes)`. The fonts are cached in the `fontCache` object so they are only fetched once per session, not once per file. If embedding fails (e.g., network error), Helvetica is used as a fallback.

The correct font variant for each paragraph is selected by `pickFontVariant(fonts, style)`: boldItalic → bold → italic → regular, falling back gracefully if a variant isn't available.

#### Page Layout & Reflow Engine

The layout engine processes paragraphs sequentially with **full look-ahead** to avoid mid-paragraph page breaks:

**Margins**: 72pt on all sides (1 inch).

**Body font size**: Clamped between 9pt and 12pt from the detected median PDF font size.

**Heading font sizing**:
- Centered headings with `fzScale > 1.12`: scaled up to `bodyFz × fzScale`, capped at `bodyFz × 2.0`.
- Bold headings: `min(bodyFz × 1.22, 16pt)`.
- Body text: `bodyFz`.
- All sizes quantized to 0.5pt increments.

**Line height**: `fontSize × 1.65`.

**Text wrapping**: `wrapText()` splits text on whitespace and greedily assembles words onto lines, measuring each candidate string with `font.widthOfTextAtSize()`. Falls back to `str.length × fontSize × 0.52` if the font raises an error (encoding issue).

**Page break logic**:
- If the entire paragraph fits on a fresh page AND does not fit on the current page → start a new page.
- If the paragraph is taller than a full page → keep it on the current page and let the line loop split it across pages, UNLESS not even one line fits — in that case, start a new page.
- Centered paragraphs always move to a new page if they don't fit (to avoid splitting headings/titles).

**X positioning**:
- Centered text: `MARGIN_L + (contentW - textWidth) / 2`.
- RTL text: `MARGIN_L + contentWidth - textWidth` (right-aligned).
- LTR body text: `MARGIN_L` (left-aligned).

**Decoration rendering**: After drawing each text line:
- **Strikethrough**: A horizontal line at `y + fontSize × 0.32`, thickness `max(fontSize × 0.07, 0.5)`.
- **Underline**: A horizontal line at `y - fontSize × 0.12`, thickness `max(fontSize × 0.06, 0.4)`.

All `pdfPage.drawText()` and `pdfPage.drawLine()` calls are wrapped in try-catch to silently skip individual render errors.

#### RTL Language Support

If the target language is Arabic (`ar`), Persian (`fa`), Urdu (`ur`), or Hebrew (`he`), `isRTL = true`. In this mode:
- Body text X is calculated as `MARGIN_L + contentWidth - measureTextWidth(line, fz, font)` — text is right-aligned.
- The appropriate Noto Arabic/Hebrew font is auto-selected.

#### Page Numbering

On every non-empty rendered page, a centered page number is drawn at `y = MARGIN_B × 0.42` in 9pt regular font at 45% gray (`rgb(0.45, 0.45, 0.45)`).

---

### DOCX / DOC / ODT Pipeline

`processDocumentFile()` handles Word-compatible formats using **mammoth@1.8.0** (dynamically imported from jsDelivr):

```js
const result = await mammoth.extractRawText({ arrayBuffer: await item.file.arrayBuffer() });
rawText = result.value;
```

The raw text is split into paragraphs on `\n{2,}` (two or more consecutive newlines), normalized (inner newlines → spaces, whitespace collapsed). Duplicate paragraphs are deduplicated before translation. After translation, the full paragraph array (including duplicates) is re-expanded using the translation map.

**Output reconstruction**: The translated paragraphs are joined with `\n\n` and assembled into a new `.docx` file using **docx@8.5.0** (dynamically imported):

```js
const doc = new Document({ sections: [{ children: translatedParas.map(p => new Paragraph({ children: [new TextRun(p)] })) }] });
outBlob = await Packer.toBlob(doc);
```

If `docx` library import or document building fails for any reason, it silently falls back to exporting as `.txt` (plain text).

---

### EPUB Pipeline

`extractEpubText()` implements a full EPUB 2/3 parser using **JSZip@3.10.1**:

1. Loads the `.epub` file (which is a ZIP archive) via JSZip.
2. Reads `META-INF/container.xml` to locate the OPF (Open Packaging Format) file path.
3. Parses the OPF to extract the spine `idref` order and the manifest `id → href` map.
4. Iterates spine items in reading order, reading each XHTML file from the ZIP.
5. Strips HTML tags (regex `<[^>]+>`) and decodes 5 common HTML entities (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&#NNN;`).
6. Collapses whitespace and appends `\n\n` between chapters.

The resulting plain text string is then processed identically to the TXT pipeline (split → translate → join → output as `.txt`).

---

### TXT Pipeline

Plain text files are read with `File.text()` (UTF-8). No library required. Paragraphs are split on `\n{2,}`, translated, and output as a new `.txt` blob. This is the simplest and fastest path.

---

## File Queue System

`fileQueue` is a module-level array of objects with the shape:

```js
{ id: string, file: File, status: 'queued'|'running'|'done'|'err', blobs: [] }
```

`runQueue()` iterates the queue sequentially (one file at a time), dispatching to either `processPdfFile()` or `processDocumentFile()` based on extension. Sequential processing avoids overwhelming the translation providers with concurrent document-level requests (text-level concurrency is still handled within each file's pipeline).

Files already in `'done'` status are skipped on re-runs, allowing partial retries after errors.

Each file ID is generated as `'f' + Date.now() + Math.random().toString(36).slice(2,5)` — millisecond timestamp + 3 random alphanumeric chars — guaranteeing uniqueness even for files added in the same millisecond.

### Batch Download (ZIP)

`downloadAll()` uses JSZip (already loaded for EPUB) to package all done files' primary blobs into a single `lingua_translated.zip` with `DEFLATE` compression. A synthetic `<a>` element with `download` attribute triggers the browser's native save dialog.

If JSZip fails (import error or ZIP generation error), it gracefully degrades to sequential individual downloads with 300ms delays between them (to prevent browsers from blocking rapid programmatic downloads).

---

## Live Dashboard & Stats

Three global variables track session statistics:
- `statsTranslated` — incremented as translations complete in `translateAll()`.
- `statsCache` — updated whenever the cache is read or written.
- `statsStartMs` — recorded by `statsStart()`, used to compute throughput.

`statsStart()` creates a `setInterval(statsTickUpdate, 300)` that refreshes the stats bar every 300ms while a job is running. `statsStop()` clears the interval and calls one final tick to display final values.

`statsTickUpdate()` calculates `elapsed = (performance.now() - statsStartMs) / 1000` and displays `Math.round(statsTranslated / elapsed)` strings/second.

---

## External Libraries (CDN-loaded)

All libraries are loaded **lazily** (only when needed) via dynamic `import()`, keeping initial page load fast:

| Library | Version | CDN | Used for |
|---|---|---|---|
| `pdfjs-dist` | 4.4.168 | jsDelivr | PDF parsing / text extraction |
| `pdf-lib` | 1.17.1 | jsDelivr | PDF creation / rendering |
| `mammoth` | 1.8.0 | jsDelivr | DOCX/DOC/ODT text extraction |
| `docx` | 8.5.0 | jsDelivr | DOCX output creation |
| `jszip` | 3.10.1 | jsDelivr | EPUB parsing + batch ZIP download |
| `@fontsource/noto-*` | 5.0.x | jsDelivr | Script-specific Noto font WOFF files |
| Google Fonts (`Syne`, `DM Mono`) | — | Google Fonts CDN | UI typography |

No library is bundled into the HTML. The file stays small; everything is streamed in on demand.

---

## Everything You Could Have Explicitly Asked For

This section catalogues every specific technical behavior and engineering decision in the codebase — the full answer to "what does it do, precisely?":

**Translation:**
- Translates text up to 5,000 characters via a single textarea.
- Uses a two-phase, 10-provider cascade: GT (primary + secondary) first, then LT + MM + Lingva + Apertium.
- Deduplicates texts before sending to any provider (same string only translated once per job).
- Writes all new translations to a persistent IndexedDB cache keyed by `srcLang|tgtLang|text`.
- On text translation, races both GT endpoints — the first non-empty result wins immediately.
- Skips pure punctuation, symbols, numbers, 1-2 character strings, and URLs.
- Probes all 10 providers on startup with a test string.
- Permanently disables dead providers (per-instance flags) for the rest of the session.
- Auto-detects source language when "Auto-detect" is selected.
- Prevents translation when source and target language are the same.
- Shows elapsed time in milliseconds next to the translation output.

**PDF-specific:**
- Strips headers and footers (top/bottom 9% of page height).
- Strips bare page-number lines.
- Groups text items into lines with ±3px Y tolerance.
- Detects font size from the transformation matrix (handles rotation).
- Classifies font style (bold/italic/underline/strikethrough) per-line by majority vote.
- Detects dominant font family from the first page.
- Auto-selects output font based on detected family and target language script.
- Exposes a manual font picker (Times, Helvetica, Courier, Noto Serif, Noto Sans).
- Detects centered text (chapter titles, epigraphs) by position and word count.
- Merges lines into logical paragraphs across page boundaries.
- Handles hyphenated line breaks without inserting spaces.
- Passes the previous paragraph as a 120-character context prefix to translation.
- Uses a three-em-dash (`⸻`) as a context separator that survives MT.
- Applies 8 post-processing grammar fixes for Slavic-to-Latin translation artifacts.
- Embeds Times/Helvetica/Courier with all four variants (regular/bold/italic/boldItalic).
- Fetches and embeds 8 Noto font variants for non-Latin scripts (CJK, Arabic, Devanagari, Tamil, Telugu, Bengali, Thai).
- Caches fetched font binaries in memory for the session.
- Renders PDF output with 72pt margins on all sides.
- Clamps body font size to 9–12pt, quantized to 0.5pt.
- Scales heading font sizes proportionally from the detected median size.
- Wraps translated text to fit column width using precise font width measurement.
- Falls back to `strlen × 0.52` estimate if font measurement fails.
- Breaks pages with look-ahead — moves whole paragraphs to new pages rather than splitting mid-paragraph.
- Right-aligns text for Arabic, Persian, Urdu, Hebrew targets.
- Draws centered page numbers at the bottom of each non-empty page.
- Draws underline/strikethrough decorations as explicit line primitives.
- Outputs both a `_translated.pdf` and an `_original.pdf` for download.
- Reports page count, paragraph count, and elapsed time in the file row.

**File queue:**
- Accepts PDF, DOCX, DOC, ODT, EPUB, TXT simultaneously.
- Drag-and-drop with visual highlight on the drop zone.
- Click-to-browse via a hidden file input.
- Multiple files in one drop/browse.
- Per-file progress bar with percentage steps matching pipeline stages.
- Per-file status messages updated in real time.
- Color-coded row borders: purple (running), green (done), red (error).
- Sequential file processing (one at a time through the queue).
- Skip already-done files on re-run.
- Individual remove button per file (disabled while running).
- Clear all button.
- "Download All" ZIP button appears when 2+ files are done.
- ZIP falls back to sequential individual downloads if JSZip fails.

**EPUB:**
- Parses EPUB container XML to locate OPF.
- Follows spine reading order from OPF manifest.
- Strips HTML tags and decodes entities.
- Handles both top-level and subdirectory XHTML file paths.

**DOCX:**
- Extracts raw text via mammoth (strips all formatting for translation).
- Outputs a new `.docx` via the `docx` library with one `TextRun` per paragraph.
- Falls back to `.txt` if docx output fails.

**UI/UX:**
- All 50 languages available in both selects.
- Swap button exchanges source and target (disabled if source is Auto).
- Character counter updates on every keystroke.
- Copy button for translated text output.
- Clear button resets text and character counter.
- Neural network canvas animation shown during active translation.
- Provider pills blink during active calls, turn green/red on completion.
- Live strings/second throughput stat.
- Timestamped console log with millisecond precision and color-coded severity.
- Console dot flashes on each new log event.
- Console clear button.
- Font bar only appears when a PDF is in the queue.
- Sticky header with blur backdrop.
- Fully responsive layout (wrapping flex, max-width 1080px centered).
- Custom select dropdown arrow via inline SVG background-image.
- All interactive elements have hover transitions and focus states.
- DPR-aware canvas rendering for retina/HiDPI displays.
