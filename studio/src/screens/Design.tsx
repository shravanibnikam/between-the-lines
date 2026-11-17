// Design: "How will my pages look?" Settings on the left, the live spread on the right.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScreenHeader } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { area, displayTitle, numbers } from '@/lib/book'
import { useStore } from '@/state/context'
import { useLayout } from '@/state/layout'
import { Panel } from './design/Panel'
import { inches } from './design/labels'
import { spreadCount, spreadLabel, spreadOf, spreadPages } from './preview/pages'
import { PagerButtons, Spread } from './preview/Spread'

export function Design() {
  const { book, catalog, selection } = useStore()
  const L = useLayout('print')
  const [spread, setSpread] = useState(0)
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit')
  const doc = L.doc
  const pages = doc?.pages.length ?? 0
  const last = spreadCount(pages) - 1
  const sp = Math.min(spread, last)

  // Open on the chapter being written (else the first chapter), once the pages exist.
  const placed = useRef(false)
  useEffect(() => {
    if (!doc || placed.current) return
    placed.current = true
    const at = (a: string, i: number) => doc.starts.find(([[sa, si]]) => sa === a && si === i)?.[1]
    const page = at(selection.area, selection.index) ?? at('Body', 0) ?? 0
    setSpread(spreadOf(page))
  }, [doc, selection])

  const openers = () => {
    const i = doc?.pages.findIndex((p) => p.opener && !p.front && !p.blank) ?? -1
    if (i >= 0) setSpread(spreadOf(i))
  }

  // Sections that have a start page, and the one the spread is in.
  const jumps = useMemo(() => {
    if (!doc || !book) return []
    const nums = numbers(book)
    return doc.starts.flatMap(([[a, i], page]) => {
      const s = area(book, a)[i]
      return s ? [{ key: `${a}:${i}`, page, label: displayTitle(book, s, a === 'Body' ? nums[i] : null) }] : []
    })
  }, [doc, book])
  const [l, r] = doc ? spreadPages(pages, sp) : [null, null]
  const here = Math.max(l ?? 0, r ?? 0)
  const current = [...jumps].reverse().find((j) => j.page <= here)?.key ?? ''

  if (!book || !catalog) return null
  const p = book.print
  const retry = L.retry

  return (
    <div className="flex h-full min-w-0">
      <aside aria-label="Design settings" className="w-[360px] shrink-0 overflow-y-auto border-r border-border px-5 pt-8 pb-10 min-[1200px]:w-[400px] min-[1200px]:px-6">
        <Panel catalog={catalog} onOpener={openers} />
      </aside>

      <section aria-label="Live spread" className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 px-6 pt-8 pb-4">
          <ScreenHeader title="Design" sub={<span className="num">{book.style.name} · {inches(p.trim_w_in)} × {inches(p.trim_h_in)} in · {pages} pages</span>} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <PagerButtons label={spreadLabel(pages, sp)} canPrev={sp > 0} canNext={sp < last} onPrev={() => setSpread(sp - 1)} onNext={() => setSpread(sp + 1)} />
            <Select value={current} onValueChange={(k) => { const j = jumps.find((x) => x.key === k); if (j) setSpread(spreadOf(j.page)) }} disabled={!jumps.length}>
              <SelectTrigger aria-label="Jump to chapter" className="w-48" size="sm"><SelectValue placeholder="Jump to chapter" /></SelectTrigger>
              <SelectContent>{jumps.map((j) => <SelectItem key={j.key} value={j.key}>{j.label}</SelectItem>)}</SelectContent>
            </Select>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={zoom} aria-label="Zoom" onValueChange={(v) => v && setZoom(v as 'fit' | 'full')}>
              <ToggleGroupItem value="fit" className="px-3 data-[state=on]:bg-brand-soft data-[state=on]:text-brand-ink">Fit</ToggleGroupItem>
              <ToggleGroupItem value="full" className="num px-3 data-[state=on]:bg-brand-soft data-[state=on]:text-brand-ink">100%</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="relative mx-6 mb-6 min-h-0 flex-1 overflow-hidden rounded-lg bg-[var(--desk)]">
          <Spread doc={doc} version={L.version} spread={sp} zoom={zoom} paper={p.paper} fallback={{ w: p.trim_w_in * 72, h: p.trim_h_in * 72 }} pad={16} />
          {(L.loading || L.error) && (
            <div role="status" className="absolute top-3 left-3 flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-muted-foreground">
              {L.error ? (
                <>
                  <span className="text-foreground">The pages couldn't be laid out.</span>
                  <Button variant="ghost" size="xs" onClick={retry}>Retry</Button>
                </>
              ) : (
                'Updating…'
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
