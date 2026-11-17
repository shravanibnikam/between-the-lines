// The outline: front matter, story and back matter, with add, move, rename and delete.
import { Plus } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { area, AREA_LABEL, BACK_KINDS, BODY_KINDS, countWords, displayTitle, fmt, FRONT_KINDS, KIND_LABEL, numbers } from '@/lib/book'
import type { Area, SectionKind } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/context'
import { useSectionOps } from './useSectionOps'

const AREAS: Area[] = ['Front', 'Body', 'Back']
const KINDS: Record<Area, SectionKind[]> = { Front: FRONT_KINDS, Body: BODY_KINDS, Back: BACK_KINDS }

export function Outline({ onRename, className }: { onRename: () => void; className?: string }) {
  const { book, selection, select } = useStore()
  const ops = useSectionOps()
  const [del, setDel] = useState<{ a: Area; i: number } | null>(null)
  const [drag, setDrag] = useState<{ a: Area; i: number } | null>(null)
  const [over, setOver] = useState<{ a: Area; i: number } | null>(null)
  const b = book!
  const n = numbers(b)
  const delSection = del ? area(b, del.a)[del.i] : undefined

  return (
    <nav aria-label="Outline" className={cn('flex flex-col gap-6 overflow-y-auto px-3 py-5', className)}>
      {AREAS.map((a) => {
        const list = area(b, a)
        return (
          <section key={a} aria-label={AREA_LABEL[a]}>
            <div className="mb-1 flex h-8 items-center justify-between pl-2">
              <h2 className="text-[13px] text-muted-foreground">{AREA_LABEL[a]}</h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" className="text-muted-foreground" aria-label={`Add to ${AREA_LABEL[a].toLowerCase()}`}>
                    <Plus />Add
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {KINDS[a].map((k) => (
                    <DropdownMenuItem key={k} onSelect={() => ops.add(a, k)}>{KIND_LABEL[k]}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {list.length === 0 && <p className="px-2 py-1.5 text-[12px] text-muted-foreground">Nothing here yet</p>}
            <ul>
              {list.map((s, i) => {
                const sel = selection.area === a && selection.index === i
                const num = a === 'Body' && s.kind === 'Chapter' ? n[i] : null
                const title = displayTitle(b, s, a === 'Body' ? n[i] : null)
                const isOver = over?.a === a && over.i === i && drag && drag.i !== i
                return (
                  <li key={s.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          draggable
                          aria-current={sel ? 'true' : undefined}
                          onClick={() => select(a, i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Delete') setDel({ a, i })
                            if (e.key === 'F2') { select(a, i); onRename() }
                          }}
                          onDragStart={(e) => {
                            setDrag({ a, i })
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', title)
                          }}
                          onDragOver={(e) => {
                            if (drag?.a !== a) return
                            e.preventDefault()
                            if (over?.a !== a || over.i !== i) setOver({ a, i })
                          }}
                          onDragLeave={() => setOver(null)}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (drag?.a === a) ops.move(a, drag.i, i)
                            setDrag(null)
                            setOver(null)
                          }}
                          onDragEnd={() => {
                            setDrag(null)
                            setOver(null)
                          }}
                          className={cn(
                            'grid h-9 w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-2 text-left text-[14px] transition-colors',
                            sel ? 'bg-brand-soft text-brand-ink' : 'text-foreground hover:bg-raised',
                            isOver && "relative before:absolute before:inset-x-1 before:h-0.5 before:rounded-full before:bg-brand",
                            isOver && (drag!.i < i ? 'before:bottom-0' : 'before:top-0'),
                          )}
                        >
                          <span className={cn('num text-[13px]', sel ? 'text-brand-ink' : 'text-muted-foreground')}>{num ?? ''}</span>
                          <span className="truncate">{title}</span>
                          <span className={cn('num text-[12px]', sel ? 'text-brand-ink' : 'text-muted-foreground')}>{s.text ? fmt(countWords(s.text)) : ''}</span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        <ContextMenuItem disabled={i === 0} onSelect={() => ops.move(a, i, i - 1)}>Move up<ContextMenuShortcut>Alt+↑</ContextMenuShortcut></ContextMenuItem>
                        <ContextMenuItem disabled={i === list.length - 1} onSelect={() => ops.move(a, i, i + 1)}>Move down<ContextMenuShortcut>Alt+↓</ContextMenuShortcut></ContextMenuItem>
                        <ContextMenuItem onSelect={() => { select(a, i); onRename() }}>Rename<ContextMenuShortcut>F2</ContextMenuShortcut></ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem variant="destructive" onSelect={() => setDel({ a, i })}>Delete…<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <AlertDialog open={!!delSection} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{delSection ? displayTitle(b, delSection, del!.a === 'Body' ? n[del!.i] : null) : ''}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {delSection?.text ? `${fmt(countWords(delSection.text))} words are` : 'text is'} removed from the book. You can get it back only from a snapshot saved before now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => del && ops.remove(del.a, del.i)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  )
}
