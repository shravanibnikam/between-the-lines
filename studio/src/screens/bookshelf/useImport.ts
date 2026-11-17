import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, isTauri } from '@/lib/api'
import { useStore } from '@/state/context'

const EXT = ['docx', 'odt', 'md', 'markdown', 'txt']
const isManuscript = (p: string) => EXT.includes(p.split('.').pop()?.toLowerCase() ?? '')

/** Import a manuscript file into a new book (button and window drag-drop); desktop app only. */
export function useImport() {
  const { refreshLibrary, openBook } = useStore()
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const importPath = useCallback(async (path: string) => {
    setBusy(true)
    const t = toast.loading('Importing manuscript…')
    try {
      const r = await api.bookImport(path)
      await refreshLibrary()
      const notes = r.notes.slice(0, 5)
      if (r.notes.length > 5) notes.push(`and ${r.notes.length - 5} more`)
      toast.success(`Imported “${r.book.meta.title || 'Untitled book'}”`, {
        id: t,
        description: notes.length ? notes.join('\n') : undefined,
        classNames: { description: 'whitespace-pre-line' },
      })
      await openBook(r.book.id, 'write')
    } catch (e) {
      toast.error("Couldn't import that file", { id: t, description: String(e) })
    } finally {
      setBusy(false)
    }
  }, [refreshLibrary, openBook])

  const choose = useCallback(async () => {
    if (!isTauri) return
    const { open } = await import('@tauri-apps/plugin-dialog')
    const p = await open({ filters: [{ name: 'Manuscripts', extensions: EXT }] })
    if (typeof p === 'string') await importPath(p)
  }, [importPath])

  useEffect(() => {
    if (!isTauri) return
    let off: (() => void) | undefined
    let dead = false
    ;(async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      const un = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload
        if (p.type === 'enter') setDragging(p.paths.some(isManuscript))
        else if (p.type === 'leave') setDragging(false)
        else if (p.type === 'drop') {
          setDragging(false)
          const f = p.paths.find(isManuscript)
          if (f) void importPath(f)
          else toast.error('That file type can’t be imported', { description: 'Use a Word, OpenDocument, Markdown or text file.' })
        }
      })
      if (dead) un()
      else off = un
    })()
    return () => {
      dead = true
      off?.()
    }
  }, [importPath])

  return { choose, busy, dragging, canImport: isTauri }
}
