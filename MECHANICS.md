# How Between the Lines sets type

Between the Lines is a free, open-source book-formatting app for indie writers: writing, designing
printed pages and exporting print PDF and EPUB, with no licence fees and nothing locked behind a
paywall. It has no
AI features, no account and no cloud: your manuscript stays on your computer and is never sent
anywhere.

This file records the typesetting numbers the app uses and where they live in the code.

## Headings

- Chapter titles default to 2.0 x the body size (designs may change it).
- `##` subheadings are 1.5 x and `###` 1.2 x the body size (`layout.rs`, `subheading`).

## Images

`layout/paragraph.rs` (`image`), constants in `layout/mod.rs`, files in `image.rs`:

- A line `![caption](name.png)` sets a PNG or JPEG from the book's `images/` folder. Names are
  letters, digits, `-`, `_` and `.` only, ending in .png, .jpg or .jpeg; anything else is refused.
- The image is scaled to the text width, or to the text block's height less its caption if that
  is smaller, and centred. Half a line of space above it (none at a page top), half a line below,
  then the text snaps back to the baseline grid.
- Captions are 0.85 x the body size (`CAPTION_SCALE`), italic, centred, 0.35 lines below the image.
- An image that doesn't fit in the rest of the page starts the next one; the gap stays empty.
- Under 200 pixels per inch at its printed size (`MIN_IMAGE_DPI`) gives a warning; 300 is best.
- Added images may be up to 40 MB and 50 megapixels. PDFs carry decoded pixels (Flate, alpha as
  a soft mask); EPUBs carry the original file, and the cover gets its own first page.

## Tables

`layout/table.rs`, written as `|` lines (a `|---|:--:|---:|` row under the first makes it a
header and sets left, centre or right alignment per column):

- Body font at 0.9 x the body size and leading (`TABLE_SCALE`); the header row is bold.
- Columns take their natural one-line widths when they fit the text width. Otherwise every column
  keeps its longest word and gives up the same share of the rest; cells wrap ragged.
- Booktabs rules, no vertical rules: top and bottom 0.08 em, under the header 0.05 em, each with
  0.3 x the table leading above and below. The table is centred in the text block, half a body
  line below the text before it.
- Rows never split. A table that runs onto a new page closes with its bottom rule and starts
  again with its header row. Text after the table snaps back to the baseline grid.

## Footnotes

`layout/notes.rs`, written `[^label]` with a `[^label]: text` line anywhere in the section:

- Numbered 1, 2, 3… in order of first reference, starting again in each section. A reference
  without a definition prints as typed, and a definition never referenced is left out; both add
  a warning to the pre-flight checks.
- The reference is a number 0.65 x the size of its text (`NOTE_REF_SCALE`), raised 0.6 x its own
  size (`NOTE_REF_RISE`).
- Notes sit at the foot of the page where they are first referenced, in the body font at 0.8 x
  the body size and leading (`NOTE_SCALE`), each starting with its raised number. A rule 0.3 x the
  text width sits in a body line of space above them.
- Space is reserved as lines are set: the text bottom rises by the notes owed to the page, and a
  line whose notes no longer fit moves to the next page with them. A note longer than the room
  left continues at the foot of the next page.
- Word counts include the note definitions as written.

## Running heads and page numbers

Constants at the top of `layout.rs`:

- Running heads and page numbers are 0.8 x the body size (`FURNITURE_SCALE`).
- Running-head baseline: 0.55 x the top margin below the trim edge (`HEADER_DROP`).
- Page-number baseline: 0.5 x the bottom margin above the trim edge (`FOLIO_RISE`).
- The rule under a running head sits 2 mm below its baseline (`HEADER_RULE_GAP_PT`).
- Page numbers can sit bottom centre, bottom outside or top outside; running heads align left,
  centre or right.
- No running head on chapter openings or blank pages. Front matter is unnumbered, and the story
  starts on a right-hand page numbered 1 (standard book convention).

## Book model

`model.rs`, one JSON file per book: page settings (trim and four margins), typography (fonts,
size, line spacing, paragraph gap, first-line indent, alignment), a design (chapter openings,
numbering, scene breaks, ornaments, drop caps, page furniture), print export settings (page
numbers, running heads, recto chapter starts, bleed, paper, binding) and the words used for
chapter labels.

## Trim sizes and margins

`themes.rs` lists 20 trim sizes: the paperback sizes published by Amazon KDP ("Set trim size,
bleed, and margins") and IngramSpark (file creation guide), plus the ISO A-sizes. Picking one
resets the four margins (top, bottom, inside, outside, in inches) to its defaults. The margin
values are our own, chosen from two public sources:

- Printer minimums (KDP): outside margin at least 0.25 in; inside (gutter) margin at least
  0.375 in up to 150 pages, 0.5 to 300, 0.625 to 500, 0.75 to 700, 0.875 beyond. IngramSpark asks
  for a 0.5 in safety margin.
- Book-design convention (e.g. Bringhurst, *The Elements of Typographic Style*; Tschichold's
  page-proportion canons): the inside margin is larger than the outside, the bottom is a little
  larger than the top (room for the folio), and margins grow with the page.

| Class | Sizes | Margins (top, bottom, inside, outside) |
|---|---|---|
| Compact | 4 × 6, 4.12 × 6.75, 4.25 × 7, 4.37 × 7 | 0.6, 0.65, 0.65, 0.4 |
| A6 | 4.13 × 5.83 | 0.55, 0.6, 0.6, 0.4 |
| Small | 5 × 8, 5.25 × 8, 5.5 × 8.5, 5.12 × 7.09, 4.72 × 7.48, 5.31 × 8.07, 5.31 × 8.46, 5.06 × 7.81 | 0.7, 0.8, 0.8, 0.5 |
| Mid | 6 × 9, A5 | 0.8, 0.9, 0.85, 0.6 |
| Large | 7 × 10, 8 × 10, 8.25 × 11, 8.5 × 11, A4 | 0.9, 1.0, 1.0, 0.7 |

New books start at 5.5 × 8.5 in with 0.7 / 0.8 / 0.8 / 0.5 margins. The inside margins above clear
the KDP minimum for books up to 700 pages; the preflight check warns when a book needs more.

Print-on-demand rules:

- Bleed is 0.125 in on the outside, top and bottom edges (KDP).
- Smallest inside margin by page count: 0.375 in up to 150 pages, 0.5 to 300, 0.625 to 500,
  0.75 to 700, 0.875 beyond (KDP).

## Built-in designs

17 designs in `themes.rs`. All fonts are bundled under the SIL Open Font License
(`core/assets/fonts`). Each design's numbers come from standard book-typography practice
(Bringhurst, *The Elements of Typographic Style*; Butterick, *Practical Typography*; Felici,
*The Complete Manual of Typography*):

- Measure of about 55 to 70 characters a line for running text (Bringhurst's 45 to 75 range, 66
  ideal), checked per design against the face's average character width and the text block.
- Leading of 1.3 to 1.45 times the type size for text (1.5 for the dyslexia-friendly design,
  following the British Dyslexia Association style guide: sans serif, 12 to 14 pt, left aligned).
- Faces with a small x-height (EB Garamond, Alegreya) are set larger (11.5 to 12 pt) than faces
  with a large one (Gelasio, Instrument Sans, 10 to 10.5 pt) so they read at the same apparent size.
- First-line indent of 1 to 1.3 em for indented designs, or a 0.6 to 1 em gap for block designs;
  never both.
- Large print is 16 pt, the usual minimum for the category.

Columns: body / heading font, size pt / leading, paragraph gap em, first-line indent em, trim,
chapter numbers, scene break, drop cap lines.

| Key | Fonts | Size / lead | Gap, indent | Page | Numbers | Break | Drop cap |
|---|---|---|---|---|---|---|---|
| classic-fiction | Gelasio | 10.5 / 1.38 | 0, 1.2 | 5.5 × 8.5 | none | * * * | – |
| literary | EB Garamond | 12 / 1.32 | 0, 1.1 | 5.5 × 8.5 | roman | leaves | 3 |
| thriller | Gelasio, Libre Franklin | 10 / 1.3 | 0, 1.0 | 5.5 × 8.5 | numeric | * * * | 2 |
| romance | PT Serif, Gelasio | 10.5 / 1.4 | 0, 1.3 | 5.5 × 8.5 | written | flourish | 2 |
| fantasy | EB Garamond, Cinzel | 12 / 1.35 | 0, 1.3 | 6 × 9 | roman | asterism | 3 |
| romantasy | Lora, Cormorant | 11 / 1.42 | 0, 1.25 | 5.5 × 8.5 | written | stars | 3 |
| gothic-romance | Lora, Cinzel Decorative | 10.5 / 1.38 | 0, 1.1 | 5.5 × 8.5 | roman | moon | 4 |
| horror | Alegreya, Playfair Display | 11.5 / 1.35 | 0, 1.15 | 5.5 × 8.5 | numeric | dots | 3 |
| sci-fi | PT Serif, Source Code Pro | 10.5 / 1.35 | 0.6, 0 | 6 × 9 | numeric | compass | – |
| memoir | PT Serif | 11 / 1.4 | 0, 1.2 | 5.5 × 8.5 | written | ~ | – |
| clean-nonfiction | PT Serif, Libre Franklin | 10.5 / 1.4 | 0.6, 0 | 6 × 9 | none | diamond rule | 3 |
| modern-minimal | Instrument Sans | 10 / 1.45 | 0.8, 0 | 6 × 9 | none | — | 3 |
| academic | Source Serif 4 | 11 / 1.4 | 0, 1.2 | 6 × 9 | numeric | * * * | – |
| poetry | EB Garamond | 11.5 / 1.45 | 1.0, 0 | 5.5 × 8.5 | none | asterism | – |
| childrens | Gelasio, Libre Franklin | 13 / 1.45 | 0.6, 0 | 6 × 9 | written | stars | – |
| large-print | Gelasio | 16 / 1.4 | 0.6, 0 | 6 × 9 | numeric | * * * | 3 |
| dyslexia-friendly | Instrument Sans | 13 / 1.5 | 1.0, 0 | 6 × 9 | numeric | * * * | 3 |

- Margins per design are in `themes.rs`; they start from the size class above and widen for
  designs that want white space (e.g. modern-minimal 1 / 1.1 / 1 / 0.8, poetry 0.9 / 1 / 0.9 / 0.75).
- Ornaments are vector shapes drawn by `ornaments.rs`.
- "written" numbers read "Chapter One", "numeric" "Chapter 1", "roman" "IV".
- Paragraph shape: switching to spaced paragraphs gives a 0.9 em gap and no indent; switching
  back to indented gives a 1.2 em indent and no gap.
- Large-print export: 16 pt body on 1.4 line spacing, ragged right, no drop caps.

## Other defaults

- Daily goal 500 words, book goal 80,000 words, reading speed 250 words a minute.
- Drop cap: as tall as N lines, its capital height spanning from the first line's capitals to the
  N-th baseline; following text wraps beside it, even into the next paragraph.
- Chapter openings start 5 body lines down (designs vary), 2 em above the text.

## Line breaking

`linebreak.rs`: optimal fit over the whole paragraph, after Knuth and Plass, "Breaking Paragraphs
into Lines" (Software: Practice and Experience, 1981) and the parameters in *The TeXbook*.

- Justified word gaps stay between 0.75 x and 2.5 x a normal space; otherwise the line isn't
  justified.
- It first tries whole words with TeX's pretolerance (badness 100), then adds English (US)
  hyphenation (the `hyphenation` crate's patterns, at least 2 letters before and 3 after a
  split), then any setting inside the gap limits, and only then falls back to filling lines one
  by one.
- Costs are TeX's: line penalty 10, hyphen 50, two hyphens in a row 10,000, a hyphen before the
  last line 5,000. Glue stretches by half a space and shrinks by a third for badness.
- Lines may also break after an existing hyphen or dash. Ragged-right text is filled line by line
  without hyphenation.
- At least two lines of a paragraph stay together at the foot and head of a page.

## PDF/X-1a print export

`pdf.rs`, with "PDF/X-1a" on in Export. The print and print-with-bleed PDFs then follow ISO 15930-1
(PDF/X-1a:2001), which printers such as IngramSpark prefer; large print is unaffected.

- PDF 1.3 header, no `/Lang`, no transparency, every font embedded. The Info dictionary has the
  title, creation and modification dates, `/Trapped /False` and the PDF/X version and conformance.
- The catalog names an output intent, CGATS TR 001 (SWOP), from the ICC registry. A registered
  characterization needs no embedded profile.
- No RGB: neutral colours (channels within 3 of 255) are DeviceGray, the rest DeviceCMYK by the naive
  `k = 1 - max(r, g, b)` conversion with no ink limit, so saturated colours print duller than on
  screen. Preflight notes any title, number, ornament or drop-cap colour that will go to CMYK.
- Neutrals with luminance 0.15 or less (Rec. 601) are written as solid black (`0 g`). The body ink
  is #1a1a1a, which as a 90% grey would be halftoned on press and print fuzzy; small text must come
  from one plate. Mid and light greys stay as grey tints.
- Boxes: `/TrimBox` is the trim size; `/BleedBox` equals `/MediaBox`, which adds the bleed (0.125 in)
  on the top, bottom and outside edges only.

## Spell checking

- The open-source English (US) Hunspell dictionary from LibreOffice (SCOWL word list, permissive
  licence; `core/assets/dictionaries`), read with the `spellbook` crate.
- Misspelled words are underlined in red as you type. A "Spelling" list under the text offers up
  to three suggestions (replacing every occurrence in the section), "Add to this book's words"
  and "Skip for now".
- Names in the world notes (and their other names) are always accepted, as are single letters and
  words in capitals. British spellings ("grey") are flagged by the US dictionary.

## Typewriter mode

- "Typewriter" keeps the cursor's line at 1/3 of the editor height (extra room below the text lets
  the last line reach it).
- "Dim" fades every paragraph except the cursor's to 32 %.
- Focus + Typewriter shows a paper page with a warm radial lamp light (Lamp and Warmth sliders),
  a ruled type guide and an optional monospaced "typewriter type" (Source Code Pro).
- With Typewriter on, keys make typewriter sounds ("Sound" in the toolbar, "Key sounds" in the
  type head's menu). They are synthesised with Web Audio, with no audio files. A letter, digit or
  mark is a typebar strike: capitals land harder, small marks lighter, and each physical key keeps
  its own pitch. Space is the bar and the carriage step, Backspace and Delete knock the carriage
  back, and Enter rings the margin bell and returns the carriage. Arrows, Tab and shortcuts are
  silent.

## Not in this version

Maps, series, branches, collaboration, cloud sync, audiobook narration and ambient
sound. AI tools are deliberately left out.
