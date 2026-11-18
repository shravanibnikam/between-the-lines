// Shapes shared with the Rust core (serde JSON). Keep in sync with core/src/model.rs,
// core/src/storage.rs and core/src/api.rs. Enums serialize as their Rust variant names.

export type SectionKind =
  | 'TitlePage' | 'Copyright' | 'Dedication' | 'Epigraph' | 'Contents' | 'Foreword' | 'Preface'
  | 'Prologue' | 'Chapter' | 'Part' | 'Epilogue'
  | 'Afterword' | 'Acknowledgements' | 'AboutAuthor' | 'AlsoBy' | 'Custom'
export type Area = 'Front' | 'Body' | 'Back'
export type BodyAlign = 'Justify' | 'Left'
export type HAlign = 'Left' | 'Center' | 'Right'
export type HeadingLayout = 'NumberAboveTitle' | 'TitleOnly' | 'NumberOnly' | 'Inline'
export type NumberFormat = 'Arabic' | 'Word' | 'Roman' | 'LabelArabic' | 'LabelWord' | 'LabelRoman'
export type FirstParagraph = 'Plain' | 'SmallCapsLine' | 'SmallCapsWords'
export type SceneBreakStyle = 'Ornament' | 'Glyph' | 'Space'
export type PageNumberPos = 'BottomCenter' | 'BottomOutside' | 'TopOutside'
export type HeaderContent = 'Nothing' | 'Author' | 'BookTitle' | 'ChapterTitle'
export type Paper = 'Cream' | 'White'
export type Binding = 'Paperback' | 'Hardback'
export type WorldKind = 'Character' | 'Place' | 'Item' | 'Group' | 'Lore'

export interface Section {
  id: string
  kind: SectionKind
  title: string
  subtitle: string
  /** One paragraph per line: *italic*, **bold**, `## ` subheading, `> ` quote, `***` scene break. */
  text: string
  pov: string
  in_contents: boolean
  drop_cap: boolean
  notes: string
}

export interface BookMeta {
  title: string; subtitle: string; author: string; series: string; series_number: string
  publisher: string; year: string; edition: string
  isbn_paperback: string; isbn_hardcover: string; isbn_ebook: string
  language: string; description: string; keywords: string
  /** The ebook cover: a file name in the book's images folder, '' for none. */
  cover: string
}

/** An image copied into the book (`image_add`): its file name and size in pixels. */
export interface ImageInfo { name: string; w: number; h: number }

export interface Terminology { chapter: string; part: string; prologue: string; epilogue: string; contents: string }

export interface StyleProfile {
  name: string; builtin: string
  body_font: string; heading_font: string; number_font: string
  base_size_pt: number; line_height: number; paragraph_spacing_em: number; first_indent_em: number
  no_indent_after_heading: boolean; align: BodyAlign
  heading_layout: HeadingLayout; number_format: NumberFormat; heading_align: HAlign
  title_scale: number; number_scale: number; title_uppercase: boolean; title_italic: boolean; number_uppercase: boolean
  title_color: string; number_color: string
  chapter_ornament: string; ornament_color: string; ornament_scale: number
  scene_break: SceneBreakStyle; scene_ornament: string; scene_glyph: string
  drop_cap: boolean; drop_cap_lines: number; drop_cap_color: string
  first_paragraph: FirstParagraph; small_caps_words: number
  sink_lines: number; opener_gap_em: number; show_pov: boolean
  header_rule: boolean; header_small_caps: boolean; hyphenate: boolean
}

export interface PrintSettings {
  trim_key: string; trim_w_in: number; trim_h_in: number
  margin_top_in: number; margin_bottom_in: number; margin_inside_in: number; margin_outside_in: number
  bleed: boolean; pdfx: boolean; page_numbers: boolean; page_number_pos: PageNumberPos
  running_headers: boolean; header_left: HeaderContent; header_right: HeaderContent
  recto_chapter_start: boolean; paper: Paper; binding: Binding
}

export interface EbookSettings { embed_fonts: boolean; contents_page: boolean }

export interface WorldEntry { id: string; kind: WorldKind; name: string; aliases: string; summary: string; notes: string }

export interface Goals { daily_words: number; book_words: number }
export interface WritingDay { date: string; start_words: number; end_words: number }
export interface WritingStats { days: WritingDay[] }
export interface SpellSettings { enabled: boolean; personal: string[] }

export interface Book {
  format: number; id: string; meta: BookMeta
  front: Section[]; body: Section[]; back: Section[]
  style: StyleProfile; print: PrintSettings; ebook: EbookSettings; terms: Terminology
  world: WorldEntry[]; goals: Goals; stats: WritingStats
  restart_numbers_each_part: boolean; smart_quotes: boolean; spelling: SpellSettings
  created: number; modified: number
}

/** One book on the shelf (built from its book.json; `id` is its folder name). */
export interface Summary {
  id: string; title: string; author: string; words: number; chapters: number; modified: number
  /** Words written today (local date) and the daily goal. */
  today_words: number; daily_goal: number
  /** Consecutive local days, ending today or yesterday, on which the daily goal was met. */
  streak: number
  trim_w_in: number; trim_h_in: number
}

export interface ImportResult { book: Book; notes: string[] }

export interface Settings {
  dark: boolean; sample_created: boolean; editor_size: number; last_book: string | null
  typewriter: boolean; dim_others: boolean; lamp_brightness: number; lamp_warmth: number; typewriter_font: boolean
  typewriter_sound: boolean
  accent: string
}

// ---- catalog (themes, trims, fonts, ornaments) ----
export interface ThemeInfo { key: string; name: string; style: StyleProfile; trim: [number, number]; margins: [number, number, number, number] }
export interface TrimInfo { key: string; name: string; w_in: number; h_in: number; margins: [number, number, number, number] }
export interface FaceInfo { index: number; family: string; bold: boolean; italic: boolean; file: string }
export interface FamilyInfo { family: string; kind: 'Serif' | 'Sans serif' | 'Display' | 'Script' | 'Monospace'; italic: boolean; bold: boolean }
export interface OrnamentInfo { key: string; name: string; svg: string }
export interface Catalog { themes: ThemeInfo[]; trims: TrimInfo[]; faces: FaceInfo[]; families: FamilyInfo[]; ornaments: OrnamentInfo[]; glyphs: string[] }

// ---- layout ----
export type LayoutMode = 'print' | 'phone' | 'large'
export interface PageInfo { folio: string | null; recto: boolean; section: [Area, number] | null; blank: boolean; opener: boolean; front: boolean }
export interface TocEntry { title: string; folio: string; level: number }
/** Page size in points (72 per inch). Pages are fetched one by one as SVG with `pageSvg`. */
export interface DocInfo {
  /** Names exactly this layout (mode + content + scale); page it with `api.pageSvg(key, i)`. */
  key: string
  w: number; h: number; pages: PageInfo[]; toc: TocEntry[]; starts: [[Area, number], number][]; warnings: string[] }

// ---- editor ----
export interface Span { text: string; bold: boolean; italic: boolean }
export type Block =
  | { type: 'Para'; spans: Span[] }
  | { type: 'Quote'; spans: Span[] }
  | { type: 'Heading'; level: number; spans: Span[] }
  | { type: 'SceneBreak' }

// ---- export ----
export type ExportKind = 'print' | 'print_bleed' | 'large_print' | 'epub_kindle' | 'epub_apple' | 'epub_generic'
export interface ExportResult { path: string; name: string; bytes: number; pages: number | null }
export interface ExportFile { name: string; path: string; bytes: number; modified: number }
export interface Check { level: 'ok' | 'warn' | 'problem'; text: string }
export interface Snapshot { file: string; name: string; when: number; words: number }
