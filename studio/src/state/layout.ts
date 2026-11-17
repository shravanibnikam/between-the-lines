import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { Book, DocInfo, LayoutMode } from '@/lib/types'
import { useStore } from './context'

const layoutCache = new Map<string, Promise<DocInfo>>()

export interface LayoutState {
  /** Only ever a layout of the mode and scale asked for (null until one arrives). */
  doc: DocInfo | null
  /** The doc's key (`doc.key`, '' without one): names exactly these pages; pass it to PageView. */
  version: string
  loading: boolean
  error: string | null
  /** Typeset again after an error. */
  retry: () => void
}

// A page fetch found its layout dropped from the core's small cache: the hooks showing that
// layout typeset it again and hand out a new version, so the pages refetch.
const staleListeners = new Set<(docKey: string) => void>()
export function reportStaleLayout(docKey: string) {
  for (const f of staleListeners) f(docKey)
}

export function useLayout(mode: LayoutMode, scale = 1, enabled = true): LayoutState {
  const { book, rev } = useStore()
  const [state, setState] = useState<Omit<LayoutState, 'retry'> & { at: string }>({ doc: null, version: '', loading: true, error: null, at: '' })
  const [nonce, setNonce] = useState(0)
  const keyRef = useRef('')
  const retry = useCallback(() => {
    layoutCache.delete(keyRef.current)
    setNonce((n) => n + 1)
  }, [])
  const docKeyRef = useRef('')
  useEffect(() => {
    const onStale = (k: string) => { if (k && k === docKeyRef.current) retry() }
    staleListeners.add(onStale)
    return () => { staleListeners.delete(onStale) }
  }, [retry])
  useEffect(() => {
    if (!book || !enabled) return
    const key = `${book.id}:${rev}:${mode}:${scale}`
    keyRef.current = key
    let cancelled = false
    const run = () => {
      let p = layoutCache.get(key)
      if (!p) {
        p = api.layout(book, mode, scale)
        layoutCache.set(key, p)
        while (layoutCache.size > 12) layoutCache.delete(layoutCache.keys().next().value!)
      }
      setState((s) => ({ ...s, loading: true }))
      p.then((doc) => {
        if (cancelled) return
        docKeyRef.current = doc.key
        setState({ doc, version: doc.key, loading: false, error: null, at: `${mode}:${scale}` })
      }).catch((e) => {
        layoutCache.delete(key)
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: String(e) }))
      })
    }
    const t = setTimeout(run, layoutCache.has(key) ? 0 : 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [book, rev, mode, scale, enabled, nonce])
  const { at, ...rest } = state
  // Pages typeset for another mode or scale aren't these pages.
  // `~nonce` changes after a re-typeset of the same content, so PageView fetches again.
  return at === `${mode}:${scale}` ? { ...rest, version: rest.version && `${rest.version}~${nonce}`, retry } : { ...rest, doc: null, version: '', retry }
}

/** Today's local date as YYYY-MM-DD (matches the core's writing stats). */
export const localToday = () => new Date().toLocaleDateString('en-CA')

export function wordsToday(b: Book): number {
  const last = b.stats.days[b.stats.days.length - 1]
  return last && last.date === localToday() ? Math.max(0, last.end_words - last.start_words) : 0
}
