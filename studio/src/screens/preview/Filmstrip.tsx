// Every page as a small lazy thumbnail, grouped in spreads; the current spread is outlined.
import { useEffect, useRef } from 'react'
import { PageView } from '@/components/PageView'
import type { DocInfo, Paper } from '@/lib/types'
import { cn } from '@/lib/utils'
import { spreadCount, spreadLabel, spreadPages } from './pages'

export function Filmstrip({ doc, version, paper, current, onPick }: {
  doc: DocInfo; version: string; paper: Paper; current: number; onPick: (spread: number) => void
}) {
  const cur = useRef<HTMLButtonElement>(null)
  useEffect(() => { cur.current?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [current])
  const n = doc.pages.length
  const w = 44
  return (
    <nav aria-label="All pages" className="mt-3 flex shrink-0 gap-3 overflow-x-auto pb-1">
      {Array.from({ length: spreadCount(n) }, (_, s) => {
        const on = s === current
        return (
          <button
            key={s} ref={on ? cur : undefined} type="button" onClick={() => onPick(s)} aria-label={spreadLabel(n, s)} aria-current={on ? 'true' : undefined}
            className={cn('flex shrink-0 rounded-md border-2 p-1', on ? 'border-brand' : 'border-transparent hover:border-input')}
          >
            {spreadPages(n, s).map((i, side) =>
              i === null ? (side === 0 && s === 0 ? <span key={side} style={{ width: w }} aria-hidden /> : null) : (
                <span key={side} style={{ width: w }} className={cn('block border border-input', side === 1 && '-ml-px')}>
                  <PageView lazy index={i} version={version} w={doc.w} h={doc.h} className={paper === 'White' ? 'bg-white' : undefined} />
                </span>
              ),
            )}
          </button>
        )
      })}
    </nav>
  )
}
