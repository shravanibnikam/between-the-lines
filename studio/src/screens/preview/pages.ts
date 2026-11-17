import { useEffect, useRef, useState, type RefObject } from 'react'

export const spreadCount = (pages: number) => Math.floor(pages / 2) + 1
export const spreadOf = (page: number) => Math.ceil(page / 2)

export function spreadPages(pages: number, spread: number): [number | null, number | null] {
  if (spread === 0) return [null, pages > 0 ? 0 : null]
  const l = spread * 2 - 1
  return [l < pages ? l : null, l + 1 < pages ? l + 1 : null]
}

/** "Pages 12–13", "Page 1" (physical page numbers, counted from the first page). */
export function spreadLabel(pages: number, spread: number): string {
  const shown = spreadPages(pages, spread).filter((p): p is number => p !== null).map((p) => p + 1)
  if (!shown.length) return 'No pages'
  return shown.length === 1 ? `Page ${shown[0]}` : `Pages ${shown[0]}–${shown[1]}`
}

/** Size of an element, kept up to date. */
export function useBox(): [RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  return [ref, box]
}
