// Small pure helpers over the book model. They mirror core/src/model.rs so labels in the
// interface match the printed book.
import type { Area, Book, Section, SectionKind } from './types'

export const KIND_LABEL: Record<SectionKind, string> = {
  TitlePage: 'Title page', Copyright: 'Copyright', Dedication: 'Dedication', Epigraph: 'Epigraph',
  Contents: 'Contents', Foreword: 'Foreword', Preface: 'Preface', Prologue: 'Prologue', Chapter: 'Chapter',
  Part: 'Part', Epilogue: 'Epilogue', Afterword: 'Afterword', Acknowledgements: 'Acknowledgements',
  AboutAuthor: 'About the author', AlsoBy: 'Also by', Custom: 'Other page',
}

export const FRONT_KINDS: SectionKind[] = ['TitlePage', 'Copyright', 'Dedication', 'Epigraph', 'Contents', 'Foreword', 'Preface']
export const BODY_KINDS: SectionKind[] = ['Chapter', 'Prologue', 'Epilogue', 'Part']
export const BACK_KINDS: SectionKind[] = ['Afterword', 'Acknowledgements', 'AboutAuthor', 'AlsoBy', 'Custom']
export const AREA_LABEL: Record<Area, string> = { Front: 'Front matter', Body: 'Story', Back: 'Back matter' }

/** Title page and contents are generated; they have no text the author writes. */
export const hasBody = (k: SectionKind) => k !== 'TitlePage' && k !== 'Contents'

export function countWords(text: string): number {
  let n = 0
  for (const w of text.split(/[\s—–]+/)) if (/[\p{L}\p{N}]/u.test(w)) n++
  return n
}

export const bookWords = (b: Book) =>
  [...b.front, ...b.body, ...b.back].reduce((n, s) => n + countWords(s.text), 0)

export function area(b: Book, a: Area): Section[] {
  return a === 'Front' ? b.front : a === 'Body' ? b.body : b.back
}

export function findSection(b: Book, id: string): Section | undefined {
  return b.front.find((s) => s.id === id) ?? b.body.find((s) => s.id === id) ?? b.back.find((s) => s.id === id)
}

/** Chapter numbers for body sections (null for prologue/epilogue), part numbers for parts. */
export function numbers(b: Book): (number | null)[] {
  let ch = 0
  let part = 0
  return b.body.map((s) => {
    if (s.kind === 'Chapter') return ++ch
    if (s.kind === 'Part') {
      part++
      if (b.restart_numbers_each_part) ch = 0
      return part
    }
    return null
  })
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

export function numberWords(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) return n % 10 === 0 ? TENS[Math.floor(n / 10)] : `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}`
  if (n < 1000) {
    const h = `${ONES[Math.floor(n / 100)]} Hundred`
    return n % 100 === 0 ? h : `${h} and ${numberWords(n % 100)}`
  }
  return String(n)
}

export function roman(n: number): string {
  if (n <= 0) return String(n)
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'],
    [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let s = ''
  for (const [v, r] of t) while (n >= v) { s += r; n -= v }
  return s
}

/** "Chapter Three", "Part II", "Prologue"… as the design's number format sets it. */
export function numberLabel(b: Book, s: Section, n: number | null): string {
  const fmt = b.style.number_format
  const f = (label: string, k: number, f2: string) =>
    f2 === 'Arabic' ? String(k) : f2 === 'Word' ? numberWords(k) : f2 === 'Roman' ? roman(k)
      : f2 === 'LabelArabic' ? `${label} ${k}` : f2 === 'LabelWord' ? `${label} ${numberWords(k)}` : `${label} ${roman(k)}`
  if (s.kind === 'Chapter') return f(b.terms.chapter, n ?? 1, fmt)
  if (s.kind === 'Part') {
    const pf = fmt === 'Arabic' || fmt === 'LabelArabic' ? 'LabelArabic' : fmt === 'Word' || fmt === 'LabelWord' ? 'LabelWord' : 'LabelRoman'
    return f(b.terms.part, n ?? 1, pf)
  }
  if (s.kind === 'Prologue') return b.terms.prologue
  if (s.kind === 'Epilogue') return b.terms.epilogue
  return KIND_LABEL[s.kind]
}

/** The name shown in lists: the section's own title, else its label. */
export function displayTitle(b: Book, s: Section, n: number | null): string {
  if (s.title.trim()) return s.title.trim()
  if (['Chapter', 'Part', 'Prologue', 'Epilogue'].includes(s.kind)) return numberLabel(b, s, n)
  return KIND_LABEL[s.kind]
}

export const fmt = (n: number) => n.toLocaleString('en-US')

export function timeAgo(secs: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - secs)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`
  if (d < 86400 * 2) return 'yesterday'
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} days ago`
  return new Date(secs * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const newId = () => Date.now().toString(16) + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')

export function newSection(kind: SectionKind, title = ''): Section {
  const front = ['TitlePage', 'Copyright', 'Dedication', 'Epigraph', 'Contents'].includes(kind)
  return { id: newId(), kind, title, subtitle: '', text: '', pov: '', in_contents: !front, drop_cap: true, notes: '' }
}

/** Accent presets; the colours live in index.css under [data-accent]. */
export const ACCENTS: [id: string, name: string][] = [
  ['raspberry', 'Raspberry'], ['ink', 'Ink blue'], ['forest', 'Forest'], ['teal', 'Teal'],
  ['ochre', 'Ochre'], ['copper', 'Copper'], ['graphite', 'Graphite'],
]
