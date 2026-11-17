// The open-book viewer shared by Design and Preview: two typeset pages side by side (verso
// left, recto right; the first page sits alone on the right), scaled to the room it has.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageView } from '@/components/PageView'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DocInfo, Paper } from '@/lib/types'
import { spreadPages, useBox } from './pages'

interface SpreadProps {
  doc: DocInfo | null
  version: string
  spread: number
  zoom?: 'fit' | 'full'
  paper: Paper
  /** Page size in points to draw grey placeholders at while there is no layout yet. */
  fallback: { w: number; h: number }
  pad?: number
}

export function Spread({ doc, version, spread, zoom = 'fit', paper, fallback, pad = 24 }: SpreadProps) {
  const [ref, box] = useBox()
  const w = doc?.w ?? fallback.w
  const h = doc?.h ?? fallback.h
  const n = doc?.pages.length ?? 0
  const [l, r] = doc ? spreadPages(n, spread) : [-1, -1]
  const fit = Math.max(0, Math.floor(Math.min((box.w - 2 * pad) / 2, ((box.h - 2 * pad) * w) / h)))
  const pageW = zoom === 'fit' ? fit : Math.round((w * 96) / 72)
  const bg = paper === 'White' ? 'bg-white' : undefined

  const slot = (i: number | null, side: 'l' | 'r') => {
    if (i === null) return <div style={{ width: pageW }} className="shrink-0" aria-hidden />
    return (
      <div style={{ width: pageW }} className={cn('shrink-0 border border-input', side === 'r' && '-ml-px')}>
        {doc && i >= 0 ? (
          <PageView index={i} version={version} w={doc.w} h={doc.h} className={bg} />
        ) : (
          <div className="bg-raised" style={{ aspectRatio: `${w} / ${h}` }} />
        )}
      </div>
    )
  }
  const both = l !== null && r !== null

  return (
    <div ref={ref} className="size-full overflow-auto">
      <div className="flex min-h-full w-max min-w-full items-center justify-center" style={{ padding: pad }}>
        {box.w > 0 && pageW > 0 && (
          <div className="relative flex w-max shrink-0">
            {slot(l, 'l')}
            {slot(r, 'r')}
            {both && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-black/10" aria-hidden />}
          </div>
        )}
      </div>
    </div>
  )
}

/** ‹ label › with tooltips and labels, for anything paged. */
export function PagerButtons({ label, onPrev, onNext, canPrev, canNext, what = 'spread' }: {
  label: string; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean; what?: string
}) {
  const btn = (aria: string, onClick: () => void, disabled: boolean, icon: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label={aria} onClick={onClick} disabled={disabled}>{icon}</Button>
      </TooltipTrigger>
      <TooltipContent>{aria}</TooltipContent>
    </Tooltip>
  )
  return (
    <div className="flex items-center gap-1.5">
      {btn(`Previous ${what}`, onPrev, !canPrev, <ChevronLeft />)}
      <span className="num min-w-24 text-center text-[14px] text-foreground" aria-live="polite">{label}</span>
      {btn(`Next ${what}`, onNext, !canNext, <ChevronRight />)}
    </div>
  )
}
