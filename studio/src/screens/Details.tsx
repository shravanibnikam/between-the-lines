import { ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Field, Pill, ScreenHeader, SettingsSection, SwitchRow } from '@/components/kit'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, isTauri, pickImage } from '@/lib/api'
import { bookWords, countWords, fmt } from '@/lib/book'
import type { BookMeta, Terminology } from '@/lib/types'
import { useStore } from '@/state/context'
import { isbnValid } from './details/isbn'

const LANGS: [string, string][] = [
  ['en', 'English'], ['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-AU', 'English (Australia)'],
  ['en-CA', 'English (Canada)'], ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['pt-BR', 'Portuguese (Brazil)'], ['nl', 'Dutch'], ['sv', 'Swedish'], ['da', 'Danish'], ['nb', 'Norwegian'], ['fi', 'Finnish'],
  ['pl', 'Polish'], ['cs', 'Czech'], ['ru', 'Russian'], ['tr', 'Turkish'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'],
]
const OTHER = '__other'

function MetaField({ k, label, hint, placeholder, className }: { k: keyof BookMeta; label: string; hint?: ReactNode; placeholder?: string; className?: string }) {
  const { book, updateBook } = useStore()
  const id = `meta-${k}`
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <Input id={id} value={book!.meta[k]} placeholder={placeholder} onChange={(e) => updateBook((d) => { d.meta[k] = e.target.value })} />
    </Field>
  )
}

function IsbnField({ k, label }: { k: 'isbn_paperback' | 'isbn_hardcover' | 'isbn_ebook'; label: string }) {
  const { book, updateBook } = useStore()
  const v = book!.meta[k]
  return (
    <Field label={label} htmlFor={`meta-${k}`}>
      <div className="flex items-center gap-2">
        <Input id={`meta-${k}`} value={v} placeholder="Optional" inputMode="text" onChange={(e) => updateBook((d) => { d.meta[k] = e.target.value })} />
        <span className="w-28 shrink-0" aria-live="polite">
          {v.trim() && (isbnValid(v) ? <Pill tone="ok">Valid</Pill> : <Pill tone="warn">Check the digits</Pill>)}
        </span>
      </div>
    </Field>
  )
}

function Language() {
  const { book, updateBook } = useStore()
  const lang = book!.meta.language
  const known = LANGS.some(([k]) => k === lang)
  const [other, setOther] = useState(!known)
  const set = (v: string) => updateBook((d) => { d.meta.language = v })
  return (
    <Field label="Language" htmlFor="meta-language" hint="The tag stores read, such as en-GB or fr.">
      <div className="flex gap-2">
        <Select
          value={other || !known ? OTHER : lang}
          onValueChange={(v) => {
            if (v === OTHER) setOther(true)
            else { setOther(false); set(v) }
          }}
        >
          <SelectTrigger id="meta-language" className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGS.map(([k, n]) => <SelectItem key={k} value={k}>{n} ({k})</SelectItem>)}
            <SelectItem value={OTHER}>Other…</SelectItem>
          </SelectContent>
        </Select>
        {(other || !known) && <Input aria-label="Language tag" className="w-32" value={lang} placeholder="e.g. ga" onChange={(e) => set(e.target.value.trim())} />}
      </div>
    </Field>
  )
}

/** The ebook cover: a thumbnail of the chosen image, and buttons to choose or remove it. */
function Cover() {
  const { book, updateBook } = useStore()
  const { id, meta: { cover } } = book!
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [img, setImg] = useState<{ key: string; src: string | null }>({ key: '', src: null })
  const key = `${id}/${cover}/${retry}`
  useEffect(() => {
    if (!cover) return
    let dead = false
    api.imageData(id, cover).then((src) => { if (!dead) setImg({ key, src }) }, () => { if (!dead) setImg({ key, src: null }) })
    return () => { dead = true }
  }, [id, cover, key])
  const shown = cover && img.key === key ? img.src : null
  const failed = !!cover && img.key === key && !img.src

  const choose = async () => {
    setBusy(true)
    try {
      const added = await pickImage(id)
      if (added) updateBook((d) => { d.meta.cover = added.name })
    } catch (e) {
      toast.error("Couldn't add that image", { description: String(e) })
    } finally {
      setBusy(false)
    }
  }
  const pick = (
    <Button variant="outline" onClick={() => void choose()} disabled={!isTauri || busy}>
      <ImagePlus /> {cover ? 'Change image…' : 'Choose image…'}
    </Button>
  )

  return (
    <SettingsSection title="Cover" description="The front cover ebook stores and readers show. A JPEG or PNG about 1600 × 2560 pixels works everywhere.">
      <div className="flex items-start gap-5">
        <div className="grid aspect-5/8 w-30 shrink-0 place-items-center overflow-hidden rounded-md bg-card ring-1 ring-border">
          {shown
            ? <img src={shown} alt="The book's cover" className="size-full object-cover" />
            : <span className="px-3 text-center text-[12px] text-muted-foreground">{cover ? (failed ? '—' : '') : 'No cover yet'}</span>}
        </div>
        <div className="flex flex-col items-start gap-2">
          <div className="flex gap-2">
            {isTauri ? pick : (
              <Tooltip>
                <TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{pick}</span></TooltipTrigger>
                <TooltipContent>Available in the desktop app</TooltipContent>
              </Tooltip>
            )}
            {cover && <Button variant="ghost" onClick={() => updateBook((d) => { d.meta.cover = '' })}>Remove</Button>}
          </div>
          {failed && <p className="text-[13px] text-muted-foreground">The cover image couldn't be loaded. <Button variant="ghost" size="xs" onClick={() => setRetry((r) => r + 1)}>Retry</Button></p>}
        </div>
      </div>
    </SettingsSection>
  )
}

const TERMS: [keyof Terminology, string][] = [
  ['chapter', 'Chapter'], ['part', 'Part'], ['prologue', 'Prologue'], ['epilogue', 'Epilogue'], ['contents', 'Contents'],
]

function Chips({ items, onRemove, label }: { items: string[]; onRemove: (w: string) => void; label: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((w) => (
        <li key={w} className="inline-flex h-7 items-center gap-1 rounded bg-card pr-1 pl-2 text-[13px] ring-1 ring-border">
          {w}
          <button type="button" aria-label={`Remove ${w}`} onClick={() => onRemove(w)} className="grid size-5 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function Details() {
  const { book, updateBook, closeBook, refreshLibrary } = useStore()
  const [word, setWord] = useState('')
  const [confirm, setConfirm] = useState(false)
  const words = useMemo(() => (book ? bookWords(book) : 0), [book])
  if (!book) return null

  const { meta, terms, goals, spelling } = book
  const goalPct = goals.book_words > 0 ? Math.min(100, (words / goals.book_words) * 100) : 0
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  const addWord = () => {
    const w = word.trim()
    if (!w) return
    if (!spelling.personal.includes(w)) updateBook((d) => { d.spelling.personal = [...d.spelling.personal, w].sort((a, b) => a.localeCompare(b)) })
    setWord('')
  }
  const remove = async () => {
    const id = book.id
    const title = meta.title.trim() || 'Untitled book'
    try {
      if (!(await closeBook())) return // couldn't save; it stays open and says so
      await api.bookDelete(id)
      await refreshLibrary()
      toast.success(`Deleted “${title}”`)
    } catch (e) {
      toast.error("Couldn't delete the book", { description: String(e) })
    }
  }

  return (
    <div className="h-full overflow-auto px-8 pt-8 pb-12">
      <div className="max-w-[1040px]">
        <ScreenHeader title="Book details" sub="Used on the title and copyright pages, in running heads and in store listings. Changes save as you type." className="mb-8" />

        <div>
        <SettingsSection title="Title and author" description="As they appear on the title page and the cover.">
          <MetaField k="title" label="Title" />
          <MetaField k="subtitle" label="Subtitle" hint="Optional" />
          <MetaField k="author" label="Author" hint="The name as it should appear, such as your pen name." />
        </SettingsSection>

        <Cover />

        <SettingsSection title="Series" description="Leave empty for a standalone book.">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <MetaField k="series" label="Series name" />
            <MetaField k="series_number" label="Number" placeholder="e.g. 2" />
          </div>
        </SettingsSection>

        <SettingsSection title="Publishing" description="Printed on the copyright page. ISBNs are checked as you type.">
          <div className="grid gap-4 sm:grid-cols-2 min-[1280px]:grid-cols-[1fr_120px_1fr]">
            <MetaField k="publisher" label="Publisher" hint="Your imprint, if any" />
            <MetaField k="year" label="Year" />
            <MetaField k="edition" label="Edition" placeholder="e.g. First edition" />
          </div>
          <IsbnField k="isbn_paperback" label="ISBN, paperback" />
          <IsbnField k="isbn_hardcover" label="ISBN, hardcover" />
          <IsbnField k="isbn_ebook" label="ISBN, ebook" />
        </SettingsSection>

        <SettingsSection title="Store listing" description="What readers see in ebook stores.">
          <Field label="Description" htmlFor="meta-description" hint={<span className="num">{fmt(countWords(meta.description))} words</span>}>
            <Textarea id="meta-description" className="min-h-28" value={meta.description} placeholder="The blurb readers see in ebook stores" onChange={(e) => updateBook((d) => { d.meta.description = e.target.value })} />
          </Field>
          <MetaField k="keywords" label="Keywords" hint="Separated by commas" />
          <Language />
        </SettingsSection>

        <SettingsSection title="Words used in headings" description="Rename the labels the book prints for its parts.">
          <div className="grid gap-4 sm:grid-cols-3">
            {TERMS.map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`term-${k}`}>
                <Input id={`term-${k}`} value={terms[k]} onChange={(e) => updateBook((d) => { d.terms[k] = e.target.value })} />
              </Field>
            ))}
          </div>
          <p className="text-[13px] text-muted-foreground">
            Headings will read like “{terms.chapter} Three”, “{terms.part} Two”, “{terms.prologue}” and “{terms.epilogue}”; the contents page is called “{terms.contents}”.
          </p>
        </SettingsSection>

        <SettingsSection title="Writing goals" description="Your daily target shows beside the sidebar; the book goal shows here.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Words per day" htmlFor="goal-daily">
              <Input id="goal-daily" type="number" min={0} step={50} className="num" value={goals.daily_words} onChange={(e) => updateBook((d) => { d.goals.daily_words = num(e.target.value) })} />
            </Field>
            <Field label="Words in the book" htmlFor="goal-book">
              <Input id="goal-book" type="number" min={0} step={1000} className="num" value={goals.book_words} onChange={(e) => updateBook((d) => { d.goals.book_words = num(e.target.value) })} />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-muted-foreground">Progress toward the book goal</span>
              <span className="num">{fmt(words)} of {fmt(goals.book_words)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-brand-track" role="progressbar" aria-label="Progress toward the book goal" aria-valuenow={words} aria-valuemin={0} aria-valuemax={goals.book_words}>
              <div className="h-full rounded-full bg-brand" style={{ width: `${goalPct}%` }} />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Text" description="How the writing is turned into printed text.">
          <SwitchRow
            title="Smart quotes"
            description="Curly quotes, dashes and ellipses: “ ” for straight quotes, — for --, … for three dots."
            control={<Switch checked={book.smart_quotes} onCheckedChange={(v) => updateBook((d) => { d.smart_quotes = v })} aria-label="Smart quotes" />}
          />
          <SwitchRow
            title="Restart chapter numbers in each part"
            description="Chapter 1 begins again after every part title."
            control={<Switch checked={book.restart_numbers_each_part} onCheckedChange={(v) => updateBook((d) => { d.restart_numbers_each_part = v })} aria-label="Restart chapter numbers in each part" />}
          />
          <SwitchRow
            title="Check spelling"
            description="Underlines unknown words while you write."
            control={<Switch checked={spelling.enabled} onCheckedChange={(v) => updateBook((d) => { d.spelling.enabled = v })} aria-label="Check spelling" />}
          />
          <Field label="Personal word list" htmlFor="spell-add" hint="Names and made-up words the spell checker should accept.">
            {spelling.personal.length > 0 && <Chips items={spelling.personal} label="Personal word list" onRemove={(w) => updateBook((d) => { d.spelling.personal = d.spelling.personal.filter((x) => x !== w) })} />}
            <div className="flex gap-2">
              <Input id="spell-add" className="max-w-64" value={word} placeholder="Add a word" onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWord() } }} />
              <Button variant="outline" onClick={addWord} disabled={!word.trim()}>Add</Button>
            </div>
          </Field>
        </SettingsSection>

        <SettingsSection title="Danger zone" description="Things that can't be taken back.">
          <SwitchRow
            title="Delete this book"
            description="Its exports and snapshots are deleted too."
            control={
              <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirm(true)}>
                Delete this book…
              </Button>
            }
          />
        </SettingsSection>
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{meta.title.trim() || 'Untitled book'}”?</AlertDialogTitle>
            <AlertDialogDescription>Its exports and snapshots are deleted too. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>Delete book</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
