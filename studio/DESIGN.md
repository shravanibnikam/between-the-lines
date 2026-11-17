# Between the Lines interface design

The rules every screen follows. Style: **accent ladder** (light first, true-neutral dark mode),
for one author who writes a novel, designs its printed pages and exports print PDF and EPUB, in long
sessions, often at night.

## The idea

The book's own pages are the product's objects. Wherever a page, cover or chapter appears, show the
real typeset page (an SVG from the Rust core, `PageView`) rather than an icon or a grey box. One hue,
**ribbon raspberry** (a silk bookmark ribbon), at full strength only on small marks; its pale tints do
all the area work.

- **Face:** the ladder built from the ribbon hue + the book's real pages and covers in every lead block.
- **Signature element:** "Where this chapter lands in print" — on the Write screen the current
  chapter's actual printed pages as a strip of thumbnails with "Pages 12–19 of 214", updating as you type.
- **Mark:** a narrow book spine with a ribbon tail, drawn in SVG (`AppMark`), next to the words "Between the Lines".

## Tokens (src/index.css — shadcn variables are mapped onto these)

| Role | Light | Dark |
|---|---|---|
| ground (`--background`, sidebar) | #f9fafb | #18181b |
| surface (`--card`, `--popover`, inputs) | #ffffff | #1f1f23 (popover #26262a) |
| raised (`--muted`, `--secondary`, hover) | #f3f4f6 | #2a2a2f |
| border | #e5e7eb | #323238 |
| rule (row dividers) | #f2f2f2 | #27272c |
| control border (`--input`) | #d1d5db | #414148 |
| text | #111827 | #e4e4e1 (off-white, ~14:1, not pure white) |
| muted text (≥4.5:1) | #5f6672 | #a1a1a8 |
| primary button | #1d1f20 on white text | #e4e4e1 with #18181b text |
| brand (small marks only) | #b8336a | #e0679a |
| brand-soft (active nav row, selected rows, badges) | #fdf2f7 | #36242e |
| brand-track (progress tracks) | #f8dbe8 | #4e2d3d |
| brand-ink (text on brand-soft) | #6b1d3e | #f4b5cf |
| positive / negative / warning text | #247b50 / #c4242a / #92400e | #3fc07a / #e5566f / #f0b357 |

**Accent presets** (Settings `accent` → `<html data-accent>`, picked from the swatch beside the Dark
switch or the command palette): raspberry (above, default), ink blue, forest, teal, ochre, copper,
graphite. Each overrides only brand / brand-soft / brand-track / brand-ink, with a tuned light and dark
set; ring, sidebar and chart tokens follow `--brand`. Every set passes 4.5:1 (brand on card and
ground, ink on soft). Never violet/indigo; never red (it reads as an error).

Radius: cards 8px, controls 6px, chips 4px. One gap: 24px between blocks, 16px inside forms,
card padding 20–24px. Control height 32px (form inputs 36–40px). No shadow on anything at rest;
shadows only on menus, popovers, dialogs, tooltips. A border OR a tone step, never both plus a shadow.

## Type

- Interface: **DM Sans** (bundled via @fontsource, never a CDN), weights 400/500/600/700.
  Sizes: page title 32/700 (the only 700), section 18/600, figures 24/400 tabular, body 14/400,
  small 12/400. Line height 20px at 14px. Sentence case everywhere; no tracked capitals; no monospace
  except file paths and typewriter focus.
- Book text (editor, page previews, theme cards) uses the book's own bundled fonts (`fontFamilyFor`).
- `font-variant-numeric: tabular-nums` on every count, word count, size and page number.

## Shell (open plane)

- Labelled sidebar 240px on the page ground, separated by one 1px border; no top bar.
- Top: `AppMark` + "Between the Lines", then the book switcher (cover thumbnail 28×40, title, author; menu:
  other books, "All books", "New book…").
- Nav rows 32px on a 34px pitch, 16px lucide icons at 1.5 stroke, 14px labels in muted ink.
  Active row: brand-soft fill, brand-ink label, brand icon. Order: Write, Details, World notes,
  Design, Preview, Export.
- Bottom: today's words as a thin brand-track bar with "312 of 500 words today", the light/dark
  switch, "Saved" stamp (or "Saving…", or "Couldn't save — Retry" in negative).
- Canvas: fluid, 32px gutter, title row 32px from the top. Every screen's h1 is its noun
  (Bookshelf, Book details, World notes, Design, Preview, Export); Write uses the chapter title.

## Screens and their one question

| Screen | Question it answers first | Biggest thing |
|---|---|---|
| Bookshelf | Which book do I open? | The covers (real title pages) |
| Write | What am I writing now? | The editor column |
| Book details | Is the book's information complete? | The settings rows |
| World notes | Who/what is this, and where do they appear? | The selected entry |
| Design | How will my pages look? | The live spread |
| Preview | Does the finished book read right? | The spread / phone page |
| Export | Is it ready, and where are my files? | Preflight + the export rows |

## Patterns

- **Settings rows** (Book details, Design panels where wide): label column (16/500 title + 14px muted
  description) beside a panel (raised fill, radius 8–12, padding 16–20, no border). Sections split by
  a 1px rule with 32px above and below. Every control saves itself; the sidebar shows "Saved".
- **Lists** (outline, world entries, export history): 1px row rules, no zebra, 12px muted
  sentence-case headers, numbers right-aligned tabular. Selected row: brand-soft fill.
- **Pills** (status): 20px tall, pale tint + dark ink of the same hue: ok = #dcfce7/#14532d,
  warn = #fffbeb/#92400e, problem = #ffedea/#831c1e, neutral = #f3f4f6/#374151.
- **Buttons:** one filled near-black primary per screen; secondary = white + 1px control border;
  tertiary = text. All controls in a row share one height.
- **People and things** (world notes): a stable initial in a pale tint of its own hue (hues ≥60° apart,
  never the brand hue), in rows only.

## States (every block)

- Empty: keep the frame and header, one sentence + the first action ("No world notes yet. Add a character").
- Loading: the final layout with flat grey bars at real sizes; no shimmer; no layout shift.
- Error: inside the block that failed: one sentence + "Retry" text button.
- Zero prints as 0; missing as a grey "—".
- Hover / focus-visible (2px ring in brand) / pressed / disabled (still legible, says why).

## Typewriter focus ("carriage")

Focus + Typewriter replaces the page with a desk: a cool grey ground (near-black in dark) and a thin
rail at 70% height. Every block is one unwrapped line in Courier (system face; bundled Source Code
Pro as fallback, "Typewriter type" off uses the book's body font). The text slides so the caret
stays mid-screen on the rail; earlier lines rise above it and fade; nothing shows below it. A pill
(the type head, its last dot in the accent) sits on the rail under the caret and casts the lamp: a
short spotlight, narrow at the pill and widening upward over the typing line and the two above it
(cream, not amber) and a short spill below, brightness and warmth from the lamp settings (kept faint
in dark so light text stays readable). The pill is the only control: lamp, typewriter type, dim,
Leave focus. The toolbar fades out on typing and back in on mouse movement; Esc leaves.

## Motion

Feedback only: press (scale .98), hover tone step, menus/dialogs/sheets opening (150–200ms),
a row arriving. No entrance animations. Respect `prefers-reduced-motion`.

## Banned (checked by lint/inspect)

Gradients and glows (sole exception: the typewriter-focus desk and lamp above), glass/backdrop blur, icons in tinted
squares/circles, emoji, eyebrow labels above headings, uppercase tracked labels, index numbering
(01/02), violet/indigo, cream ground with terracotta, sparklines, lorem/placeholder names,
monospace outside paths, more than one filled primary per screen, shadows on resting cards.

## Desktop sizes

The window is at least 1040×680 (Tauri min size). Design for 1360×880 and check 1040×680; there is no
phone layout, but nothing may overflow horizontally at 1040.
