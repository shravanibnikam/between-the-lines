// Preview: "Does the finished book read right?" Print and large print as spreads with a
// filmstrip, or one page at a time in a phone-shaped frame.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScreenHeader } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageView } from '@/components/PageView'
import type { DocInfo, LayoutMode } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/context'
import { useLayout } from '@/state/layout'
import { inches } from './design/labels'
import { Filmstrip } from './preview/Filmstrip'
import { spreadCount, spreadLabel, spreadOf, useBox } from './preview/pages'
import { PagerButtons, Spread } from './preview/Spread'

const MODES: [LayoutMode, string][] = [['print', 'Print'], ['large', 'Large print'], ['phone', 'Ebook']]
const KEYS_BLOCKED = 'input,textarea,select,[role=slider],[role=combobox],[role=listbox],[role=option],[role=radio],[contenteditable=true]'

export function Preview() {
  const { book } = useStore()
  const [mode, setMode] = useState<LayoutMode>('print')
  const [textScale, setTextScale] = useState(1)
  const scale = mode === 'phone' ? textScale : 1
  const L = useLayout(mode, scale)
  const [spread, setSpread] = useState(0)
  const [screen, setScreen] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const phone = mode === 'phone'
  const doc = L.doc // useLayout only hands over pages typeset for this mode and scale
  const pages = doc?.pages.length ?? 0
  const last = phone ? Math.max(0, pages - 1) : spreadCount(pages) - 1
  const pos = Math.min(phone ? screen : spread, last)
  const go = (n: number) => (phone ? setScreen : setSpread)(Math.min(last, Math.max(0, n)))

  // Contents entries with the page they sit on.
  const goto = useMemo(() => {
    if (!doc || phone) return []
    const firstOf = new Map<string, number>()
    doc.pages.forEach((p, i) => p.folio && !firstOf.has(p.folio) && firstOf.set(p.folio, i))
    return doc.toc.flatMap((t, i) => (firstOf.has(t.folio) ? [{ key: String(i), title: t.title, level: t.level, page: firstOf.get(t.folio)! }] : []))
  }, [doc, phone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement | null)?.closest?.(KEYS_BLOCKED)) return
      const next = e.key === 'ArrowRight' || e.key === 'PageDown' ? pos + 1 : e.key === 'ArrowLeft' || e.key === 'PageUp' ? pos - 1
        : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
      if (next === null) return
      e.preventDefault()
      go(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!book) return null
  const p = book.print
  const fallback = { w: p.trim_w_in * 72, h: p.trim_h_in * 72 }
  const sub = phone
    ? <span className="num">{pages} screens at text size {Math.round(textScale * 100)}%</span>
    : <span className="num">{book.style.name} · {inches(p.trim_w_in)} × {inches(p.trim_h_in)} in · {pages} pages{mode === 'large' ? ', large print' : ''}</span>
  const retry = L.retry

  return (
    <div className="flex h-full min-w-0 flex-col px-8 pt-8 pb-6">
      <ScreenHeader
        title="Preview" sub={sub}
        actions={
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={mode} aria-label="Preview as"
            onValueChange={(v) => { if (v) { setMode(v as LayoutMode); setTimeout(() => stage.current?.focus(), 0) } }}>
            {MODES.map(([k, t]) => <ToggleGroupItem key={k} value={k} className="px-3 data-[state=on]:bg-brand-soft data-[state=on]:text-brand-ink">{t}</ToggleGroupItem>)}
          </ToggleGroup>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PagerButtons
          what={phone ? 'screen' : 'spread'} canPrev={pos > 0} canNext={pos < last} onPrev={() => go(pos - 1)} onNext={() => go(pos + 1)}
          label={!doc ? '…' : phone ? `Page ${pos + 1} of ${pages}` : spreadLabel(pages, pos)}
        />
        {!phone && (
          <Select value="" onValueChange={(k) => { const g = goto.find((x) => x.key === k); if (g) setSpread(spreadOf(g.page)) }} disabled={!goto.length}>
            <SelectTrigger aria-label="Go to" size="sm" className="w-48"><SelectValue placeholder="Go to…" /></SelectTrigger>
            <SelectContent>{goto.map((g) => <SelectItem key={g.key} value={g.key}><span style={{ paddingLeft: g.level * 12 }}>{g.title}</span></SelectItem>)}</SelectContent>
          </Select>
        )}
        {phone && (
          <label className="flex items-center gap-3 text-[14px] font-medium">
            Text size
            <Slider aria-label="Text size" min={0.8} max={1.4} step={0.1} value={[textScale]} onValueChange={([v]) => setTextScale(Math.round(v * 10) / 10)} className="w-40" />
            <span className="num w-10 text-[14px] font-normal text-muted-foreground">{Math.round(textScale * 100)}%</span>
          </label>
        )}
      </div>

      <div
        ref={stage} tabIndex={-1} aria-label={phone ? 'Ebook page' : 'Spread'}
        className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-lg bg-[var(--desk)] outline-none"
      >
        {L.error ? (
          <div className="grid h-full place-items-center text-[14px]">
            <p className="text-muted-foreground">The pages couldn't be laid out. <Button variant="ghost" size="xs" onClick={retry}>Retry</Button></p>
          </div>
        ) : doc && pages === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-[14px] text-muted-foreground">Nothing to preview yet. Write a chapter and its pages appear here.</div>
        ) : phone ? (
          <PhoneFrame doc={doc} version={L.version} index={pos} fallback={fallback} />
        ) : (
          <Spread doc={doc} version={L.version} spread={pos} paper={p.paper} fallback={fallback} pad={20} />
        )}
        {L.loading && !L.error && <p role="status" className="absolute top-3 left-3 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-muted-foreground">Updating…</p>}
      </div>

      {!phone && doc && pages > 0 && (
        <Filmstrip doc={doc} version={L.version} paper={p.paper} current={pos} onPick={setSpread} />
      )}
    </div>
  )
}

/** A phone-shaped frame (neutral, no marks) around one ebook page. */
function PhoneFrame({ doc, version, index, fallback }: { doc: DocInfo | null; version: string; index: number; fallback: { w: number; h: number } }) {
  const [ref, box] = useBox()
  const w = doc?.w ?? fallback.w
  const h = doc?.h ?? fallback.h
  const pad = 12
  const frameH = Math.min(720, box.h - 32, ((box.w - 32 - 2 * pad) * h) / w + 2 * pad)
  const screenH = Math.max(0, frameH - 2 * pad)
  const screenW = (screenH * w) / h
  return (
    <div ref={ref} className="grid size-full place-items-center">
      {box.h > 0 && screenH > 40 && (
        <div className="rounded-[34px] bg-neutral-900 dark:bg-neutral-800" style={{ padding: pad }}>
          <div className={cn('overflow-hidden rounded-[24px] bg-white')} style={{ width: screenW }}>
            {doc ? <PageView index={index} version={version} w={doc.w} h={doc.h} className="bg-white" label={`Page ${index + 1}`} /> : <div className="bg-raised" style={{ aspectRatio: `${w} / ${h}` }} />}
          </div>
        </div>
      )}
    </div>
  )
}
