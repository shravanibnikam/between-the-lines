// App state: settings, the shelf, the open book and its autosave, and shared layouts.
// The open book lives here; screens change it with `updateBook(draft => …)` and the store
// saves it 800 ms after the last change (and before switching books or closing the window).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api, isTauri } from '@/lib/api'
import { registerBookFonts } from '@/lib/fonts'
import type { Area, Book, Catalog, Settings, Summary } from '@/lib/types'
import { Ctx, type SaveState, type Screen, type Selection, type Store } from './context'

const DEFAULT_SETTINGS: Settings = {
  dark: false, sample_created: true, editor_size: 18, last_book: null, typewriter: false, dim_others: false,
  lamp_brightness: 0.8, lamp_warmth: 0.6, typewriter_font: true, accent: 'raspberry',
}

const SAVE_FAILED = "Couldn't save your changes. They're still open here — try again or copy them."

function firstSelection(b: Book): Selection {
  if (b.body.length) return { area: 'Body', index: 0 }
  if (b.front.length) return { area: 'Front', index: 0 }
  return { area: 'Back', index: 0 }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [library, setLibrary] = useState<Summary[]>([])
  const [book, setBook] = useState<Book | null>(null)
  const [rev, setRev] = useState(0)
  const [screen, setScreen] = useState<Screen>('write')
  const [selection, setSelection] = useState<Selection>({ area: 'Body', index: 0 })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [focus, setFocus] = useState(false)

  // bookRef is the source of truth (updated synchronously); `book` mirrors it for rendering.
  const bookRef = useRef<Book | null>(null)
  const revRef = useRef(0)
  const dirtyRef = useRef(false)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const flushers = useRef(new Set<() => void>())
  useEffect(() => {
    revRef.current = rev
  }, [rev])
  const putBook = (b: Book | null) => {
    bookRef.current = b
    setBook(b)
  }

  // Settings are written 400 ms after the last change, one write at a time.
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS)
  const settingsDirty = useRef(false)
  const settingsTimer = useRef<number | undefined>(undefined)
  const settingsWrite = useRef<Promise<void> | null>(null)

  const refreshLibrary = useCallback(async () => {
    setLibrary(await api.libraryList())
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [s, c] = await Promise.all([api.settingsGet(), api.catalog()])
        registerBookFonts(c.faces)
        settingsRef.current = s
        setSettingsState(s)
        setCatalog(c)
        const lib = await api.libraryList()
        setLibrary(lib)
        setReady(true)
        // Browser-only dev hook for screenshots: #book=<id|first>&screen=<screen>&focus=1
        if (!isTauri && location.hash.includes('book=')) {
          const q = new URLSearchParams(location.hash.slice(1))
          const id = q.get('book') === 'first' ? lib[0]?.id : q.get('book')
          if (id) {
            const b = await api.bookLoad(id)
            putBook(b)
            setSelection(firstSelection(b))
            setScreen((q.get('screen') as Screen) || 'write')
            setFocus(q.get('focus') === '1')
            setRev((r) => r + 1)
          }
        }
      } catch (e) {
        setLoadError(String(e))
      }
    })()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark)
  }, [settings.dark])
  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent
  }, [settings.accent])

  const writeSettings = useCallback(async () => {
    clearTimeout(settingsTimer.current)
    while (settingsWrite.current) await settingsWrite.current
    if (!settingsDirty.current) return
    settingsDirty.current = false
    const p = api
      .settingsSet(settingsRef.current)
      .catch(() => {})
      .finally(() => {
        settingsWrite.current = null
      })
    settingsWrite.current = p
    await p
  }, [])

  const setSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    settingsDirty.current = true
    setSettingsState(next)
    clearTimeout(settingsTimer.current)
    settingsTimer.current = window.setTimeout(() => void writeSettings(), 400)
  }, [writeSettings])

  const registerFlush = useCallback((fn: () => void) => {
    flushers.current.add(fn)
    return () => {
      flushers.current.delete(fn)
    }
  }, [])

  const flushEdits = useCallback(() => {
    flushers.current.forEach((f) => f())
    return bookRef.current
  }, [])

  const saveNow = useCallback(async (): Promise<boolean> => {
    flushEdits()
    while (inFlight.current) await inFlight.current
    const b = bookRef.current
    if (!b || !dirtyRef.current) return true
    const revAtSave = revRef.current
    dirtyRef.current = false
    setSaveState('saving')
    const p = api
      .bookSave(b)
      .then((saved) => {
        const cur = bookRef.current
        if (cur && cur.id === saved.id) putBook({ ...cur, stats: saved.stats, modified: saved.modified })
        setSaveError(null)
        setSaveState(revRef.current === revAtSave && !dirtyRef.current ? 'saved' : 'dirty')
        return true
      })
      .catch((e) => {
        dirtyRef.current = true
        setSaveError(String(e))
        setSaveState('error')
        return false
      })
      .finally(() => {
        inFlight.current = null
      })
    inFlight.current = p
    return p
  }, [flushEdits])

  // Autosave 800 ms after the last change.
  useEffect(() => {
    if (!dirtyRef.current) return
    const t = setTimeout(() => void saveNow(), 800)
    return () => clearTimeout(t)
  }, [rev, saveNow])

  const markChanged = () => {
    dirtyRef.current = true
    setSaveState('dirty')
    setRev((r) => r + 1)
  }

  // Computed from bookRef so a flush right before a save is already in what gets saved.
  const updateBook = useCallback((fn: (draft: Book) => void) => {
    const cur = bookRef.current
    if (!cur) return
    const draft = structuredClone(cur)
    fn(draft)
    putBook(draft)
    markChanged()
  }, [])

  const replaceBook = useCallback((b: Book) => {
    putBook(b)
    markChanged()
  }, [])

  const openBook = useCallback(
    async (id: string, to: Screen = 'write') => {
      if (!(await saveNow())) {
        toast.error(SAVE_FAILED)
        return
      }
      let b: Book
      try {
        b = await api.bookLoad(id)
      } catch (e) {
        toast.error("Couldn't open that book", { description: String(e) })
        return
      }
      dirtyRef.current = false
      putBook(b)
      setSelection(firstSelection(b))
      setScreen(to)
      setSaveState('saved')
      setRev((r) => r + 1)
      setSettings({ last_book: b.id })
    },
    [saveNow, setSettings],
  )

  const closeBook = useCallback(async () => {
    if (!(await saveNow())) {
      toast.error(SAVE_FAILED)
      return false
    }
    putBook(null)
    setFocus(false)
    await refreshLibrary()
    return true
  }, [saveNow, refreshLibrary])

  // Ctrl/Cmd+S flushes and saves at once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow])

  // Save the book and settings before the window closes; a failed save keeps it open.
  useEffect(() => {
    if (!isTauri) {
      const onUnload = () => {
        flushEdits()
        if (dirtyRef.current && bookRef.current) void api.bookSave(bookRef.current)
        if (settingsDirty.current) void api.settingsSet(settingsRef.current)
      }
      window.addEventListener('beforeunload', onUnload)
      return () => window.removeEventListener('beforeunload', onUnload)
    }
    let unlisten: (() => void) | undefined
    ;(async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      unlisten = await win.onCloseRequested(async (e) => {
        flushEdits()
        if (!dirtyRef.current && !settingsDirty.current && !settingsWrite.current) return
        e.preventDefault()
        await writeSettings()
        if (await saveNow()) await win.destroy()
        else toast.error(SAVE_FAILED, { action: { label: 'Close anyway', onClick: () => void win.destroy() } })
      })
    })()
    return () => unlisten?.()
  }, [saveNow, flushEdits, writeSettings])

  const select = useCallback((a: Area, index: number) => setSelection({ area: a, index }), [])

  const value = useMemo<Store>(
    () => ({
      ready, loadError, settings, setSettings, catalog, library, refreshLibrary, book, rev, screen, setScreen,
      selection, select, updateBook, replaceBook, openBook, closeBook, saveState, saveError, saveNow, registerFlush, flushEdits,
      focus, setFocus,
    }),
    [ready, loadError, settings, setSettings, catalog, library, refreshLibrary, book, rev, screen, selection, select,
      updateBook, replaceBook, openBook, closeBook, saveState, saveError, saveNow, registerFlush, flushEdits, focus],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
