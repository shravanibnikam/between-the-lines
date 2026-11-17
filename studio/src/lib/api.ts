// The one bridge to the Rust core. Inside the app window it goes through Tauri's `call`
// command; in a plain browser (`npm run dev` + the core's dev server) it posts to
// http://127.0.0.1:1421/call, so the same screens can be checked with real data.
import type {
  Block, Book, Catalog, Check, DocInfo, ExportFile, ExportKind, ExportResult, ImportResult, LayoutMode, Settings, Snapshot, Summary,
} from './types'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const DEV_URL = 'http://127.0.0.1:1421/call'

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (inTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>('call', { cmd, args })
  }
  const res = await fetch(DEV_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd, args }) })
  const body = await res.json()
  if (!res.ok) throw new Error(typeof body === 'string' ? body : JSON.stringify(body))
  return body as T
}

export const api = {
  settingsGet: () => call<Settings>('settings_get'),
  settingsSet: (settings: Settings) => call<void>('settings_set', { settings }),

  libraryList: () => call<Summary[]>('library_list'),
  bookLoad: (id: string) => call<Book>('book_load', { id }),
  /** Saves atomically and records today's word count; returns the saved book (stats updated). */
  bookSave: (book: Book) => call<Book>('book_save', { book }),
  bookCreate: (title: string, author: string, theme: string, trim: string) => call<Book>('book_create', { title, author, theme, trim }),
  bookDelete: (id: string) => call<void>('book_delete', { id }),
  /** Imports a manuscript into a new book (saved); notes say what was kept, dropped or guessed. */
  bookImport: (path: string) => call<ImportResult>('book_import', { path }),
  sampleAdd: () => call<Book>('sample_add'),
  /** The book's title page as an SVG string (used as its cover on the shelf). */
  coverSvg: (id: string) => call<string>('cover_svg', { id }),

  catalog: () => call<Catalog>('catalog'),
  applyTheme: (book: Book, key: string) => call<Book>('apply_theme', { book, key }),
  applyTrim: (book: Book, key: string) => call<Book>('apply_trim', { book, key }),

  /** Typesets (cached by content) and returns page metadata; fetch pages with pageSvg. */
  layout: (book: Book, mode: LayoutMode, scale = 1) => call<DocInfo>('layout', { book, mode, scale }),
  /** One page of the layout `key` (DocInfo.key) as a standalone SVG (width/height in pt). Fails
   *  with "That layout is no longer available." once the core has dropped that layout. */
  pageSvg: (key: string, index: number) => call<string>('page_svg', { key, index }),

  preflight: (book: Book) => call<Check[]>('preflight', { book }),
  exportBook: (book: Book, kind: ExportKind) => call<ExportResult>('export', { book, kind }),
  exportsList: (id: string) => call<ExportFile[]>('exports_list', { id }),
  copyFile: (src: string, dest: string) => call<void>('copy_file', { src, dest }),

  markupBlocks: (text: string) => call<Block[]>('markup_blocks', { text }),
  spellMisspelled: (text: string, extra: string[]) => call<string[]>('spell_misspelled', { text, extra }),
  spellSuggest: (word: string) => call<string[]>('spell_suggest', { word }),

  snapshotsList: (id: string) => call<Snapshot[]>('snapshots_list', { id }),
  snapshotSave: (book: Book, name: string) => call<Snapshot[]>('snapshot_save', { book, name }),
  snapshotLoad: (id: string, file: string) => call<Book>('snapshot_load', { id, file }),
}

export const isTauri = inTauri
