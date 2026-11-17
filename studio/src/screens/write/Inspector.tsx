// The right column of the Write screen: this chapter's settings, where it lands in print,
// today's progress, spelling and snapshots.
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Bar } from '@/components/kit'
import { PageView } from '@/components/PageView'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { countWords, findSection, fmt, hasBody } from '@/lib/book'
import type { Area, Section, Snapshot, WritingDay } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/context'
import { useLayout, wordsToday } from '@/state/layout'

export interface SpellProps {
  /** null while checking. */
  words: string[] | null
  error: boolean
  onRetry: () => void
  onAdd: (w: string) => void
  onIgnore: (w: string) => void
}

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border px-5 py-5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const Retry = ({ text, onRetry }: { text: string; onRetry: () => void }) => (
  <p className="text-[13px] text-muted-foreground">
    {text}{' '}
    <button type="button" className="text-foreground underline underline-offset-2" onClick={onRetry}>Retry</button>
  </p>
)

export function Inspector({ section, area, index, spell, className }: { section: Section; area: Area; index: number; spell: SpellProps; className?: string }) {
  return (
    <aside aria-label="Chapter details" className={cn('overflow-y-auto', className)}>
      <ChapterBlock section={section} area={area} />
      <PrintBlock area={area} index={index} chapter={area === 'Body'} />
      <TodayBlock />
      <SpellBlock spell={spell} body={hasBody(section.kind)} />
      <SnapshotsBlock />
    </aside>
  )
}

function ChapterBlock({ section, area }: { section: Section; area: Area }) {
  const { book, updateBook } = useStore()
  const set = <K extends 'pov' | 'in_contents' | 'drop_cap' | 'notes'>(k: K, v: Section[K]) =>
    updateBook((d) => {
      const s = findSection(d, section.id)
      if (s) s[k] = v
    })
  const story = area === 'Body' && section.kind !== 'Part'
  const body = hasBody(section.kind)
  return (
    <Block title={area === 'Body' && section.kind === 'Chapter' ? 'Chapter' : 'Section'}>
      {story && (
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Point of view</span>
          <Input value={section.pov} onChange={(e) => set('pov', e.target.value)} placeholder="Whose eyes, e.g. Nell" className="h-9" />
        </label>
      )}
      {body && (
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-medium">Show in contents</span>
          <Switch checked={section.in_contents} onCheckedChange={(v) => set('in_contents', v)} />
        </label>
      )}
      {story && book!.style.drop_cap && (
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-medium">Drop cap</span>
          <Switch checked={section.drop_cap} onCheckedChange={(v) => set('drop_cap', v)} />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="font-medium">Notes</span>
        <Textarea value={section.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Reminders, research, what happens next" className="min-h-20 text-[14px]" />
        <span className="text-[12px] text-muted-foreground">Private: never printed or exported.</span>
      </label>
    </Block>
  )
}

// ---- where this chapter lands in print (the signature element) ---------------------------

const MAX_THUMBS = 6

function PrintBlock({ area, index, chapter }: { area: Area; index: number; chapter: boolean }) {
  const { book, setScreen } = useStore()
  const [on, setOn] = useState(true)
  const L = useLayout('print', 1, on)
  const doc = L.doc
  const aspect = `${book!.print.trim_w_in} / ${book!.print.trim_h_in}`
  const retry = () => {
    setOn(false)
    requestAnimationFrame(() => setOn(true))
  }
  const title = chapter ? 'Where this chapter lands in print' : 'Where this page lands in print'

  const k = doc ? doc.starts.findIndex(([[a, i]]) => a === area && i === index) : -1
  if (!doc || (k < 0 && L.loading)) {
    if (L.error) return <Block title={title}><Retry text="Couldn't typeset the book." onRetry={retry} /></Block>
    return (
      <Block title={title}>
        <Bar className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3" aria-busy>
          {[0, 1].map((i) => <span key={i} className="block rounded-[2px] bg-raised" style={{ aspectRatio: aspect }} />)}
        </div>
      </Block>
    )
  }
  if (k < 0) return <Block title={title}><p className="text-[13px] text-muted-foreground">This section has no pages of its own in print.</p></Block>

  const start = doc.starts[k][1]
  const next = doc.starts.map(([, p]) => p).filter((p) => p > start)
  let end = (next.length ? Math.min(...next) : doc.pages.length) - 1
  while (end > start && doc.pages[end].blank) end--
  const folio = (i: number) => doc.pages[i].folio ?? String(i + 1)
  const lastNum = [...doc.pages].reverse().find((p) => p.folio && /^\d+$/.test(p.folio))?.folio ?? String(doc.pages.length)
  const unnumbered = doc.pages[start].front && !doc.pages[start].folio
  const pages = Array.from({ length: end - start + 1 }, (_, j) => start + j)
  const shown = pages.slice(0, MAX_THUMBS)

  return (
    <Block title={title}>
      <p className="num text-[18px] leading-6 text-foreground">
        {unnumbered ? 'Front matter (unnumbered)' : start === end ? `Page ${folio(start)} of ${lastNum}` : `Pages ${folio(start)}–${folio(end)} of ${lastNum}`}
      </p>
      <div className={cn('grid grid-cols-2 gap-3 transition-opacity', L.loading && 'opacity-70')}>
        {shown.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setScreen('preview')}
            className="group flex flex-col gap-1 rounded-[3px] text-left"
            aria-label={`Page ${folio(p)}, open in Preview`}
          >
            <PageView index={p} version={L.version} w={doc.w} h={doc.h} lazy className="w-full rounded-[2px] border border-border group-hover:border-input" />
            <span className="num text-[12px] text-muted-foreground">{doc.pages[p].folio ?? (doc.pages[p].blank ? 'Blank' : '—')}</span>
          </button>
        ))}
      </div>
      {pages.length > MAX_THUMBS && (
        <button type="button" onClick={() => setScreen('preview')} className="self-start text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          +{pages.length - MAX_THUMBS} more in Preview
        </button>
      )}
    </Block>
  )
}

// ---- today ------------------------------------------------------------------------------------

function streak(days: WritingDay[], goal: number): number {
  const met = new Set(days.filter((d) => d.end_words - d.start_words >= goal).map((d) => d.date))
  const d = new Date()
  const key = () => d.toLocaleDateString('en-CA')
  if (!met.has(key())) d.setDate(d.getDate() - 1) // today still being written doesn't break it
  let n = 0
  while (met.has(key())) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-brand-track" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
    </div>
  )
}

function TodayBlock() {
  const { book } = useStore()
  const b = book!
  const today = wordsToday(b)
  const goal = Math.max(1, b.goals.daily_words)
  const days = streak(b.stats.days, goal)
  const total = b.body.reduce((n, s) => n + countWords(s.text), 0)
  const target = Math.max(1, b.goals.book_words)
  return (
    <Block title="Today" aside={days > 0 ? <span className="num text-[13px] text-muted-foreground">{days}-day streak</span> : undefined}>
      <div className="flex flex-col gap-1.5">
        <p className="num text-[13px] text-muted-foreground"><span className="text-foreground">{fmt(today)}</span> of {fmt(goal)} words today</p>
        <Meter value={today} max={goal} label="Words written today" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="num text-[13px] text-muted-foreground"><span className="text-foreground">{fmt(total)}</span> of {fmt(target)} words in the story</p>
        <Meter value={total} max={target} label="Words in the story" />
      </div>
    </Block>
  )
}

// ---- spelling ------------------------------------------------------------------------------

const MAX_SPELL = 15

function SpellBlock({ spell, body }: { spell: SpellProps; body: boolean }) {
  const { book, setScreen } = useStore()
  if (!book!.spelling.enabled)
    return (
      <Block title="Spelling">
        <p className="text-[13px] text-muted-foreground">
          Spell checking is off for this book.{' '}
          <button type="button" className="text-foreground underline underline-offset-2" onClick={() => setScreen('details')}>Turn it on in Book details</button>
        </p>
      </Block>
    )
  if (!body) return <Block title="Spelling"><p className="text-[13px] text-muted-foreground">Nothing to check on this page.</p></Block>
  const { words, error } = spell
  return (
    <Block title="Spelling" aside={words && words.length > 0 ? <span className="num text-[13px] text-muted-foreground">{words.length} to check</span> : undefined}>
      {error ? (
        <Retry text="Couldn't check spelling." onRetry={spell.onRetry} />
      ) : words === null ? (
        <div className="flex flex-col gap-2" aria-busy><Bar className="h-4 w-32" /><Bar className="h-4 w-24" /></div>
      ) : words.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No spelling issues in this chapter.</p>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">{words.length === 1 ? '1 word' : `${words.length} words`} to check. Click an underlined word for suggestions.</p>
          <ul className="flex flex-col">
            {words.slice(0, MAX_SPELL).map((w) => (
              <li key={w} className="flex h-9 items-center justify-between gap-2 border-b border-rule last:border-b-0">
                <span className="truncate text-[14px] underline decoration-destructive decoration-wavy decoration-1 underline-offset-4">{w}</span>
                <span className="flex shrink-0 gap-0.5">
                  <Button variant="ghost" size="xs" onClick={() => spell.onAdd(w)} aria-label={`Add ${w} to this book's words`}>Add</Button>
                  <Button variant="ghost" size="xs" onClick={() => spell.onIgnore(w)} aria-label={`Ignore ${w} in this session`}>Ignore</Button>
                </span>
              </li>
            ))}
          </ul>
          {words.length > MAX_SPELL && <p className="text-[12px] text-muted-foreground">and {words.length - MAX_SPELL} more</p>}
        </>
      )}
    </Block>
  )
}

// ---- snapshots -----------------------------------------------------------------------------

const when = (s: Snapshot) => new Date(s.when * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function SnapshotsBlock() {
  const { book, replaceBook, flushEdits } = useStore()
  const b = book!
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null)
  const [error, setError] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [restore, setRestore] = useState<Snapshot | null>(null)
  const [all, setAll] = useState(false)

  const load = () => {
    setError(false)
    api.snapshotsList(b.id).then(setSnaps, () => setError(true))
  }
  useEffect(() => {
    let stale = false
    api.snapshotsList(b.id).then(
      (s) => { if (!stale) { setSnaps(s); setError(false) } },
      () => { if (!stale) setError(true) },
    )
    return () => { stale = true }
  }, [b.id])

  const save = async () => {
    setBusy(true)
    try {
      // the editor's last few keystrokes belong in the snapshot too
      setSnaps(await api.snapshotSave(flushEdits() ?? b, name.trim() || `Snapshot ${(snaps?.length ?? 0) + 1}`))
      setName('')
      toast.success('Snapshot saved')
    } catch (e) {
      toast.error(`Couldn't save the snapshot. ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async (s: Snapshot) => {
    try {
      await api.snapshotSave(flushEdits() ?? b, 'Before restoring')
      const restored = await api.snapshotLoad(b.id, s.file)
      restored.id = b.id
      restored.stats = b.stats
      replaceBook(restored)
      load()
      toast.success(`Restored “${s.name}”. Your previous version is saved as “Before restoring”.`)
    } catch (e) {
      toast.error(`Couldn't restore the snapshot. ${String(e)}`)
    }
  }

  const sorted = snaps ? [...snaps].sort((x, y) => y.when - x.when) : null
  const visible = sorted && !all ? sorted.slice(0, 8) : sorted

  return (
    <Block title="Snapshots">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Snapshot name" className="h-8 min-w-0 flex-1" />
        <Button type="submit" variant="outline" disabled={busy}>{busy ? 'Saving…' : 'Save snapshot'}</Button>
      </form>
      {error ? (
        <Retry text="Couldn't load snapshots." onRetry={load} />
      ) : !visible ? (
        <div className="flex flex-col gap-2" aria-busy><Bar className="h-4 w-full" /><Bar className="h-4 w-4/5" /></div>
      ) : visible.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No snapshots yet. Save one before a big rewrite.</p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((s) => (
            <li key={s.file} className="flex min-h-11 items-center justify-between gap-2 border-b border-rule py-1 last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{s.name}</span>
                <span className="num block text-[12px] text-muted-foreground">{when(s)} · {fmt(s.words)} words</span>
              </span>
              <Button variant="ghost" size="xs" onClick={() => setRestore(s)}>Restore…</Button>
            </li>
          ))}
        </ul>
      )}
      {sorted && sorted.length > 8 && (
        <button type="button" className="self-start text-[13px] text-muted-foreground hover:text-foreground" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}

      <AlertDialog open={!!restore} onOpenChange={(o) => !o && setRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore “{restore?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The whole book goes back to how it was on {restore ? when(restore) : ''}. Your current version is saved as a snapshot called “Before restoring” first, so nothing is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => restore && void doRestore(restore)}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Block>
  )
}
