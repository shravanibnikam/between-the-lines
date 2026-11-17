import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/kit'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { fontStack } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import type { ThemeInfo, TrimInfo } from '@/lib/types'
import { useStore } from '@/state/context'

const trimOf = (t: ThemeInfo, trims: TrimInfo[]) =>
  trims.find((x) => Math.abs(x.w_in - t.trim[0]) < 0.01 && Math.abs(x.h_in - t.trim[1]) < 0.01)?.key

const size = (n: number) => String(+n.toFixed(2))

export function NewBookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { catalog, openBook, refreshLibrary } = useStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [theme, setTheme] = useState('')
  const [trim, setTrim] = useState('')
  const [busy, setBusy] = useState(false)

  // Each time the dialog opens (with the catalog loaded) the form starts afresh.
  const fresh = open && !!catalog
  const [wasFresh, setWasFresh] = useState(false)
  if (fresh !== wasFresh) {
    setWasFresh(fresh)
    if (fresh && catalog) {
      setTitle('')
      setAuthor('')
      const t = catalog.themes[0]
      if (t) {
        setTheme(t.key)
        setTrim(trimOf(t, catalog.trims) ?? catalog.trims[0]?.key ?? '')
      }
    }
  }

  const pick = (t: ThemeInfo) => {
    setTheme(t.key)
    const k = trimOf(t, catalog?.trims ?? [])
    if (k) setTrim(k)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const b = await api.bookCreate(title.trim() || 'Untitled book', author.trim(), theme, trim)
      await refreshLibrary()
      onOpenChange(false)
      await openBook(b.id, 'write')
    } catch (err) {
      toast.error("Couldn't create the book", { description: String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold">New book</DialogTitle>
          <DialogDescription>You can change the design, the page size and every detail later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="nb-title">
              <Input id="nb-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled book" />
            </Field>
            <Field label="Author" htmlFor="nb-author">
              <Input id="nb-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your pen name" />
            </Field>
          </div>
          <Field label="Design">
            <div role="radiogroup" aria-label="Design" className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {catalog?.themes.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.key}
                  onClick={() => pick(t)}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    theme === t.key ? 'border-brand bg-brand-soft' : 'border-border hover:bg-raised',
                  )}
                >
                  <span className="truncate text-[16px] leading-6 text-foreground" style={{ fontFamily: fontStack(t.style.heading_font) }}>{t.name}</span>
                  <span className="num text-[12px] text-muted-foreground">{t.style.base_size_pt} pt · {size(t.trim[0])} × {size(t.trim[1])}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Page size">
            <Select value={trim} onValueChange={setTrim}>
              <SelectTrigger className="w-full" aria-label="Page size"><SelectValue placeholder="Choose a page size" /></SelectTrigger>
              <SelectContent>
                {catalog?.trims.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !theme}>{busy ? 'Creating…' : 'Create book'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
