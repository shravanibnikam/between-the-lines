// A typeset page from the Rust core, drawn as the SVG it sends (same layout as the PDF).
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { reportStaleLayout } from '@/state/layout'

const svgCache = new Map<string, string>()
const remember = (key: string, svg: string) => {
  svgCache.set(key, svg)
  while (svgCache.size > 160) svgCache.delete(svgCache.keys().next().value!)
}

interface PageViewProps {
  index: number
  /** `useLayout(...).version` (the layout's key): the page is drawn from exactly that layout. */
  version: string
  /** Page size in points, for the aspect ratio while the SVG loads. */
  w: number
  h: number
  /** Only fetch once the page scrolls into view (filmstrips, long lists). */
  lazy?: boolean
  className?: string
  label?: string
}

export function PageView({ index, version, w, h, lazy, className, label }: PageViewProps) {
  const key = `${version}#${index}`
  // The last fetched page stays up until this one arrives; a cached page shows at once.
  const [last, setSvg] = useState<string | null>(null)
  const svg = svgCache.get(key) ?? last
  const [visible, setVisible] = useState(!lazy)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lazy || visible || !ref.current) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '400px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [lazy, visible])

  useEffect(() => {
    if (!visible || !version) return
    if (svgCache.has(key)) return
    let cancelled = false
    const docKey = version.split('~')[0]
    api.pageSvg(docKey, index).then(
      (s) => {
        remember(key, s)
        if (!cancelled) setSvg(s)
      },
      // The core keeps only recent layouts; ask the owner to typeset this one again.
      (e) => { if (!cancelled && String(e).includes('no longer available')) reportStaleLayout(docKey) },
    )
    return () => {
      cancelled = true
    }
  }, [key, index, version, visible])

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label ?? `Page ${index + 1}`}
      className={cn('page-svg relative overflow-hidden bg-[#fbf6e8]', className)}
      style={{ aspectRatio: `${w} / ${h}` }}
      // The core escapes all book text when it writes the SVG.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}

/** A book's title page, used as its cover on the shelf and in the book switcher. */
export function CoverView({ id, modified, className }: { id: string; modified: number; className?: string }) {
  const key = `cover:${id}:${modified}`
  const [last, setSvg] = useState<string | null>(null)
  const svg = svgCache.get(key) ?? last
  useEffect(() => {
    if (svgCache.has(key)) return
    let cancelled = false
    api.coverSvg(id).then(
      (s) => {
        remember(key, s)
        if (!cancelled) setSvg(s)
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [id, key])
  return (
    <div
      aria-hidden
      className={cn('page-svg overflow-hidden bg-[#fbf6e8]', className)}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}
