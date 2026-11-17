import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ScreenHeader } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { api, isTauri } from '@/lib/api'
import { timeAgo } from '@/lib/book'
import type { ExportFile, ExportKind } from '@/lib/types'
import { useStore } from '@/state/context'
import { useLayout } from '@/state/layout'
import { Files } from './export/Files'
import { showInFolder, size } from './export/native'
import { Preflight } from './export/Preflight'

type Key = 'print' | 'large_print' | 'epub_kindle' | 'epub_apple' | 'epub_generic'

const dim = (n: number) => String(+n.toFixed(2))

function H2({ children, id }: { children: string; id: string }) {
  return <h2 id={id} className="mb-2 text-[18px] leading-7 font-semibold">{children}</h2>
}

export function Export() {
  const { book, updateBook } = useStore()
  const L = useLayout('print')
  const [bleed, setBleed] = useState(false)
  const [busy, setBusy] = useState<Set<Key>>(new Set())
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [listed, setFiles] = useState<{ id: string; list: ExportFile[] } | null>(null)
  const [filesError, setFilesError] = useState<string | null>(null)
  const id = book?.id
  const files = listed && listed.id === id ? listed.list : null // another book's list isn't this one's

  const loadFiles = useCallback(() => {
    if (!id) return Promise.resolve()
    return api.exportsList(id).then(
      (f) => {
        setFilesError(null)
        setFiles({ id, list: [...f].sort((a, b) => b.modified - a.modified) })
      },
      (e) => setFilesError(String(e)),
    )
  }, [id])
  useEffect(() => { void loadFiles() }, [loadFiles])

  if (!book) return null
  const pages = L.doc?.pages.length
  const lastAt = files?.length ? Math.max(...files.map((f) => f.modified)) : null
  const p = book.print

  const run = async (key: Key) => {
    const kind: ExportKind = key === 'print' && bleed ? 'print_bleed' : key
    setBusy((s) => new Set(s).add(key))
    setErrors((e) => ({ ...e, [key]: undefined }))
    try {
      const r = await api.exportBook(book, kind)
      toast.success(`Exported ${r.name}`, {
        description: `${size(r.bytes)}${r.pages ? ` · ${r.pages} pages` : ''}`,
        action: isTauri ? { label: 'Show in folder', onClick: () => void showInFolder(r.path) } : undefined,
      })
      void loadFiles()
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: String(e) }))
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(key); return n })
    }
  }

  const targets: { key: Key; name: string; about: string; extra?: React.ReactNode }[] = [
    {
      key: 'print',
      name: 'Print PDF',
      about: `For a printer or print-on-demand service: ${dim(p.trim_w_in)} × ${dim(p.trim_h_in)} in, ${pages ?? '…'} pages, fonts embedded.`,
      extra: (
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Switch size="sm" checked={bleed} onCheckedChange={setBleed} aria-label="Include bleed" />
          Include bleed
        </label>
      ),
    },
    { key: 'large_print', name: 'Large-print PDF', about: 'The same book in larger type with ragged-right lines, for easier reading.' },
    { key: 'epub_kindle', name: 'EPUB for Kindle', about: 'A reflowable ebook with a linked contents list, tuned for Kindle.' },
    { key: 'epub_apple', name: 'EPUB for Apple Books', about: 'A reflowable ebook tuned for Apple Books.' },
    { key: 'epub_generic', name: 'EPUB for other stores', about: 'A standard EPUB for Kobo, Google Play and the rest.' },
  ]

  return (
    <div className="h-full overflow-auto px-8 pt-8 pb-12">
      <div className="max-w-[1100px]">
        <ScreenHeader
          title="Export"
          sub={
            <span className="num">
              {dim(p.trim_w_in)} × {dim(p.trim_h_in)} in · {pages ?? '—'} pages · {lastAt ? `last exported ${timeAgo(lastAt)}` : files ? 'not exported yet' : 'last exported —'}
            </span>
          }
        />

        <section className="mt-8" aria-labelledby="h-pre">
          <H2 id="h-pre">Before you publish</H2>
          <Preflight />
        </section>

        <section className="mt-10" aria-labelledby="h-targets">
          <H2 id="h-targets">Formats</H2>
          <ul className="border-t border-rule">
            {targets.map((t) => {
              const on = busy.has(t.key)
              return (
                <li key={t.key} className="border-b border-rule py-3">
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-5 font-medium">{t.name}</p>
                      <p className="text-[13px] leading-5 text-muted-foreground">{t.about}</p>
                    </div>
                    {t.extra}
                    <Button variant={t.key === 'print' ? 'default' : 'outline'} className="w-28" disabled={on} onClick={() => void run(t.key)} aria-label={`Export ${t.name}`}>
                      {on ? <><Loader2 className="animate-spin" /> Exporting…</> : 'Export'}
                    </Button>
                  </div>
                  {errors[t.key] && <p role="alert" className="mt-2 text-[13px] text-destructive">Couldn't export: {errors[t.key]}</p>}
                </li>
              )
            })}
            <li className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule py-3 text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">Ebook options</span>
              <label className="flex items-center gap-2">
                <Switch size="sm" checked={book.ebook.embed_fonts} onCheckedChange={(v) => updateBook((d) => { d.ebook.embed_fonts = v })} aria-label="Include the book's fonts" />
                Include the book's fonts
              </label>
              <label className="flex items-center gap-2">
                <Switch size="sm" checked={book.ebook.contents_page} onCheckedChange={(v) => updateBook((d) => { d.ebook.contents_page = v })} aria-label="Contents page in the book" />
                Contents page in the book
              </label>
            </li>
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="h-files">
          <H2 id="h-files">Files</H2>
          <Files files={files} error={filesError} onRetry={() => void loadFiles()} />
        </section>
      </div>
    </div>
  )
}
