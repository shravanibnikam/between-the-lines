import { Plus, Search } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, Field, ScreenHeader } from '@/components/kit'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { displayTitle, newId, numbers } from '@/lib/book'
import type { WorldEntry, WorldKind } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/context'
import { mentions, namesOf } from './world/mentions'

const KINDS: { kind: WorldKind; label: string; plural: string }[] = [
  { kind: 'Character', label: 'Character', plural: 'Characters' },
  { kind: 'Place', label: 'Place', plural: 'Places' },
  { kind: 'Item', label: 'Object', plural: 'Objects' },
  { kind: 'Group', label: 'Group', plural: 'Groups' },
  { kind: 'Lore', label: 'Lore', plural: 'Lore' },
]
const kindLabel = (k: WorldKind) => KINDS.find((x) => x.kind === k)!.label

// Four hues 60 degrees apart, none near the brand (raspberry) and none violet.
const HUES = [20, 80, 140, 200]
const hueOf = (id: string) => HUES[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]

function Avatar({ entry }: { entry: WorldEntry }) {
  const initial = ([...entry.name.trim()][0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden
      style={{ '--h': hueOf(entry.id) } as React.CSSProperties}
      className="grid size-8 shrink-0 place-items-center rounded-full bg-[oklch(0.94_0.04_var(--h))] text-[14px] font-medium text-[oklch(0.38_0.09_var(--h))] dark:bg-[oklch(0.28_0.05_var(--h))] dark:text-[oklch(0.85_0.08_var(--h))]"
    >
      {initial}
    </span>
  )
}

export function World() {
  const { book, updateBook, select, setScreen } = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | WorldKind>('all')
  const [selId, setSelId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const focusNew = useRef(false)

  const world = book?.world ?? []
  // Counting walks the whole story, so it trails typing a little.
  const slow = useDeferredValue(book)
  const counts = useMemo(() => {
    const texts = slow?.body.map((s) => s.text) ?? []
    return new Map((slow?.world ?? []).map((e) => {
      const names = namesOf(e)
      return [e.id, texts.map((t) => mentions(t, names))] as const
    }))
  }, [slow?.body, slow?.world])
  const total = (id: string) => (counts.get(id) ?? []).reduce((a, b) => a + b, 0)

  const q = query.trim().toLowerCase()
  const shown = world.filter(
    (e) => (filter === 'all' || e.kind === filter)
      && (!q || [e.name, e.aliases, e.summary, e.notes].some((t) => t.toLowerCase().includes(q))),
  )
  const current = world.find((e) => e.id === selId) ?? shown[0] ?? null
  const kindCount = (k: WorldKind) => world.filter((e) => e.kind === k).length

  useEffect(() => {
    if (focusNew.current && current) {
      focusNew.current = false
      nameRef.current?.focus()
      nameRef.current?.select()
    }
  }, [current])

  if (!book) return null
  const numbering = numbers(book)

  const add = (kind: WorldKind) => {
    const e: WorldEntry = { id: newId(), kind, name: `New ${kindLabel(kind).toLowerCase()}`, aliases: '', summary: '', notes: '' }
    updateBook((d) => { d.world.push(e) })
    setQuery('')
    setFilter('all')
    setSelId(e.id)
    focusNew.current = true
  }
  const edit = (fn: (e: WorldEntry) => void) => {
    if (!current) return
    const id = current.id
    updateBook((d) => { const e = d.world.find((x) => x.id === id); if (e) fn(e) })
  }
  const remove = () => {
    if (!current) return
    const i = shown.findIndex((e) => e.id === current.id)
    const next = shown[i + 1] ?? shown[i - 1]
    const id = current.id
    updateBook((d) => { d.world = d.world.filter((e) => e.id !== id) })
    setSelId(next?.id ?? null)
  }

  const newMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline"><Plus /> New note</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {KINDS.map((k) => <DropdownMenuItem key={k.kind} onSelect={() => add(k.kind)}>{k.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const aliases = current?.aliases.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  const where = current ? (counts.get(current.id) ?? []).map((n, i) => [i, n] as const).filter(([, n]) => n > 0) : []

  return (
    <div className="flex h-full flex-col px-8 pt-8 pb-6">
      <ScreenHeader title="World notes" sub={world.length ? `${world.length} ${world.length === 1 ? 'note' : 'notes'}` : 'Characters, places and the rules of your world.'} actions={world.length ? newMenu : undefined} />

      {world.length === 0 ? (
        <EmptyState className="mt-6 max-w-xl" action={<Button onClick={() => add('Character')}><Plus /> Add a character</Button>}>
          No world notes yet. Keep track of who and what is in your book, and see where each one appears.
        </EmptyState>
      ) : (
        <div className="mt-6 flex min-h-0 flex-1 gap-6">
          <div className="flex w-[280px] shrink-0 flex-col gap-3 xl:w-80">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input aria-label="Search world notes" className="pl-8" placeholder="Search names and notes" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(v) => v && setFilter(v as 'all' | WorldKind)}
              spacing={1}
              className="w-full flex-wrap"
              aria-label="Show"
            >
              {[{ v: 'all', l: 'All', n: world.length }, ...KINDS.map((k) => ({ v: k.kind, l: k.plural, n: kindCount(k.kind) }))].map((o) => (
                <ToggleGroupItem key={o.v} value={o.v} size="sm" className="h-7 min-w-0 px-2 text-[12px] data-[state=on]:bg-brand-soft data-[state=on]:text-brand-ink">
                  {o.l} <span className="num text-muted-foreground">{o.n}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ul className="min-h-0 flex-1 overflow-y-auto border-t border-rule" aria-label="Notes">
              {shown.map((e) => (
                <li key={e.id} className="border-b border-rule">
                  <button
                    type="button"
                    onClick={() => setSelId(e.id)}
                    aria-current={current?.id === e.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      current?.id === e.id ? 'bg-brand-soft' : 'hover:bg-raised',
                    )}
                  >
                    <Avatar entry={e} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[14px] leading-5 font-medium', current?.id === e.id ? 'text-brand-ink' : 'text-foreground')}>{e.name.trim() || 'Unnamed'}</span>
                      <span className="block text-[12px] text-muted-foreground">{kindLabel(e.kind)}</span>
                    </span>
                    <span className="num text-[13px] text-muted-foreground" title="Mentions in the story">{total(e.id)}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="px-2 py-4 text-[14px] text-muted-foreground">
                  Nothing matches{q ? ` “${query.trim()}”` : ''}.{' '}
                  <button type="button" className="underline underline-offset-2" onClick={() => { setQuery(''); setFilter('all') }}>Clear the search</button>
                </li>
              )}
            </ul>
          </div>

          <section className="min-w-0 flex-1 overflow-y-auto" aria-label="Selected note">
            {current ? (
              <div className="flex max-w-[720px] flex-col gap-5 pr-1 pb-6">
                <Input
                  ref={nameRef}
                  aria-label="Name"
                  className="h-12 text-[24px]! font-normal"
                  value={current.name}
                  placeholder="Name"
                  onChange={(e) => edit((x) => { x.name = e.target.value })}
                />
                <div className="grid gap-4 xl:grid-cols-[168px_1fr]">
                  <Field label="Kind" htmlFor="w-kind">
                    <Select value={current.kind} onValueChange={(v) => edit((x) => { x.kind = v as WorldKind })}>
                      <SelectTrigger id="w-kind" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Other names" htmlFor="w-aliases" hint="Separated by commas. Mentions count these too.">
                    <Input id="w-aliases" value={current.aliases} placeholder="Nicknames, titles, spellings" onChange={(e) => edit((x) => { x.aliases = e.target.value })} />
                    {aliases.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Other names">
                        {aliases.map((a, i) => <li key={`${a}${i}`} className="rounded bg-raised px-2 py-0.5 text-[12px] text-foreground">{a}</li>)}
                      </ul>
                    )}
                  </Field>
                </div>
                <Field label="Summary" htmlFor="w-summary">
                  <Textarea id="w-summary" className="min-h-16" value={current.summary} placeholder="One or two lines" onChange={(e) => edit((x) => { x.summary = e.target.value })} />
                </Field>
                <Field label="Notes" htmlFor="w-notes">
                  <Textarea id="w-notes" className="min-h-40" value={current.notes} placeholder="Appearance, history, relationships, secrets…" onChange={(e) => edit((x) => { x.notes = e.target.value })} />
                </Field>

                <div>
                  <h2 className="text-[16px] leading-6 font-medium">Mentioned in</h2>
                  {where.length === 0 ? (
                    <p className="mt-2 text-[14px] text-muted-foreground">Not mentioned in the story yet.</p>
                  ) : (
                    <ul className="mt-2 border-t border-rule">
                      {where.map(([i, n]) => (
                        <li key={i} className="border-b border-rule">
                          <button
                            type="button"
                            onClick={() => { select('Body', i); setScreen('write') }}
                            className="flex w-full items-center justify-between gap-4 px-1 py-2 text-left text-[14px] outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="truncate">{displayTitle(book, book.body[i], numbering[i])}</span>
                            <span className="num text-muted-foreground">{n} {n === 1 ? 'time' : 'times'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirm(true)}>
                    Delete…
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState className="max-w-md">No note is selected. Pick one on the left, or clear the search.</EmptyState>
            )}
          </section>
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{current?.name.trim() || 'this note'}”?</AlertDialogTitle>
            <AlertDialogDescription>The note is removed from this book. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>Delete note</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
