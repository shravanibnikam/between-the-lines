import { BookPlus, FileUp, Library, MoreHorizontal, PenLine, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CoverView } from '@/components/PageView'
import { ScreenHeader, EmptyState } from '@/components/kit'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { fmt, timeAgo } from '@/lib/book'
import type { Summary } from '@/lib/types'
import { useStore } from '@/state/context'
import { NewBookDialog } from './bookshelf/NewBookDialog'
import { useImport } from './bookshelf/useImport'

function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 px-5 py-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="num mt-0.5 text-[24px] leading-8">
        {value}
        {unit && <span className="ml-1.5 text-[14px] text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}

function BookCard({ b, onOpen, onDelete }: { b: Summary; onOpen: () => void; onDelete: () => void }) {
  // Covers stand on a shelf line: each fits a 2:3 box, bottom-aligned, at its own trim shape.
  const r = b.trim_w_in / b.trim_h_in
  const title = b.title.trim() || 'Untitled book'
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li className="group/card relative min-w-0">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${title}`}
            className="block w-full rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <div className="flex aspect-[2/3] items-end">
              <div className="shrink-0 border border-border" style={{ width: `${Math.min(1, r * 1.5) * 100}%`, aspectRatio: `${b.trim_w_in} / ${b.trim_h_in}` }}><CoverView id={b.id} modified={b.modified} /></div>
            </div>
            <p className="mt-3 line-clamp-2 text-[14px] leading-5 font-medium text-foreground">{title}</p>
            <p className="mt-0.5 truncate text-[14px] text-muted-foreground">{b.author.trim() || 'No author yet'}</p>
            <p className="num mt-1 text-[12px] text-muted-foreground">{fmt(b.words)} {b.words === 1 ? 'word' : 'words'} · {fmt(b.chapters)} ch.</p>
            <p className="text-[12px] text-muted-foreground">Edited {timeAgo(b.modified)}</p>
          </button>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`More for ${title}`}
                    className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>Delete…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onDelete}>Delete…</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The most recently edited book, first and largest: the shelf's most common job is to keep writing it. */
function ContinueWriting({ b, onOpen }: { b: Summary; onOpen: () => void }) {
  const title = b.title.trim() || 'Untitled book'
  const goal = Math.max(1, b.daily_goal)
  return (
    <section aria-labelledby="continue-title" className="mt-6 flex items-stretch gap-8 rounded-xl bg-raised p-6">
      <button type="button" onClick={onOpen} aria-label={`Open ${title}`} className="w-[150px] shrink-0 self-end rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <div className="border border-border" style={{ aspectRatio: `${b.trim_w_in} / ${b.trim_h_in}` }}><CoverView id={b.id} modified={b.modified} /></div>
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id="continue-title" className="truncate text-[24px] leading-8 font-semibold">{title}</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">{b.author.trim() || 'No author yet'} · edited {timeAgo(b.modified)}</p>
        <dl className="num mt-6 grid max-w-[560px] grid-cols-3 gap-6">
          <div><dt className="text-[12px] text-muted-foreground">Words</dt><dd className="text-[24px] leading-8">{fmt(b.words)}</dd></div>
          <div><dt className="text-[12px] text-muted-foreground">Chapters</dt><dd className="text-[24px] leading-8">{fmt(b.chapters)}</dd></div>
          <div><dt className="text-[12px] text-muted-foreground">Day streak</dt><dd className="text-[24px] leading-8">{fmt(b.streak)}</dd></div>
        </dl>
        <div className="mt-6 max-w-[560px]">
          <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground"><span>Today</span><span className="num">{fmt(b.today_words)} of {fmt(goal)} words</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-brand-track" role="progressbar" aria-label="Words written today" aria-valuenow={b.today_words} aria-valuemax={goal}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (b.today_words / goal) * 100)}%` }} />
          </div>
        </div>
        <div className="mt-auto pt-6"><Button onClick={onOpen}><PenLine /> Continue writing</Button></div>
      </div>
    </section>
  )
}

export function Bookshelf() {
  const { library, refreshLibrary, openBook } = useStore()
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<Summary | null>(null)
  const imp = useImport()

  const addSample = async () => {
    try {
      const b = await api.sampleAdd()
      await refreshLibrary()
      await openBook(b.id, 'write')
    } catch (e) {
      toast.error("Couldn't add the sample book", { description: String(e) })
    }
  }
  const remove = async () => {
    const b = toDelete
    if (!b) return
    try {
      await api.bookDelete(b.id)
      await refreshLibrary()
      toast.success(`Deleted “${b.title.trim() || 'Untitled book'}”`)
    } catch (e) {
      toast.error("Couldn't delete the book", { description: String(e) })
    }
  }

  const importBtn = (
    <Button variant="outline" onClick={() => void imp.choose()} disabled={!imp.canImport || imp.busy}>
      <FileUp /> Import manuscript…
    </Button>
  )
  const importButton = imp.canImport ? importBtn : (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{importBtn}</span></TooltipTrigger>
      <TooltipContent>Available in the desktop app</TooltipContent>
    </Tooltip>
  )

  const totals = {
    words: library.reduce((n, b) => n + b.words, 0),
    today: library.reduce((n, b) => n + b.today_words, 0),
    streak: library.reduce((n, b) => Math.max(n, b.streak), 0),
  }

  return (
    <div className="relative h-full overflow-auto px-8 pt-8 pb-10">
      <ScreenHeader
        title="Bookshelf"
        sub={library.length ? undefined : 'Every book you write lives here.'}
        actions={library.length ? (
          <>
            {importButton}
            <Button variant="outline" onClick={() => setCreating(true)}><Plus /> New book</Button>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void addSample()}>Add the sample book</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : undefined}
      />

      {library.length === 0 ? (
        <EmptyState
          className="mt-6 max-w-xl"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setCreating(true)}><Plus /> New book</Button>
              {importButton}
              <Button variant="outline" onClick={() => void addSample()}><Library /> Add the sample book</Button>
            </div>
          }
        >
          Your bookshelf is empty. Start a new book, bring in a manuscript, or open the sample book to look around.
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
            <Figure label="Books" value={fmt(library.length)} />
            <Figure label="Words" value={fmt(totals.words)} />
            <Figure label="Written today" value={fmt(totals.today)} />
            <Figure label="Best streak" value={fmt(totals.streak)} unit={totals.streak === 1 ? 'day' : 'days'} />
          </div>
          <ContinueWriting b={library[0]} onOpen={() => void openBook(library[0].id)} />
          {library.length > 1 && <h2 className="mt-10 text-[18px] leading-7 font-semibold">All books</h2>}
          <ul className={library.length > 1 ? 'mt-4 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-5 gap-y-8' : 'mt-8 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-5 gap-y-8'} aria-label="Your books">
            {library.length > 1 && library.map((b) => <BookCard key={b.id} b={b} onOpen={() => void openBook(b.id)} onDelete={() => setToDelete(b)} />)}
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 text-center text-[14px] text-muted-foreground transition-colors hover:border-brand hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <BookPlus className="size-5" strokeWidth={1.5} />
                <span className="font-medium text-foreground">Start a new book</span>
                <span className="text-[12px]">{imp.canImport ? 'or drop a manuscript on this window' : 'or import a manuscript in the desktop app'}</span>
              </button>
            </li>
          </ul>
        </>
      )}

      <NewBookDialog open={creating} onOpenChange={setCreating} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.title.trim() || 'Untitled book'}”?</AlertDialogTitle>
            <AlertDialogDescription>Its exports and snapshots are deleted too. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>Delete book</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {imp.dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/90">
          <div className="rounded-xl border-2 border-dashed border-brand px-10 py-8 text-center">
            <p className="text-[18px] font-semibold">Drop to import</p>
            <p className="mt-1 text-[14px] text-muted-foreground">Word, OpenDocument, Markdown or text files</p>
          </div>
        </div>
      )}
    </div>
  )
}
