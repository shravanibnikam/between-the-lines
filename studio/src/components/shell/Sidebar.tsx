// The open-plane sidebar: mark, bookshelf, the open book's screens, and today's progress.
import { BookOpen, ChevronsUpDown, Download, FileText, Library, Moon, PenLine, SwatchBook, Users } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { CoverView } from '@/components/PageView'
import { AppMark } from '@/components/shell/AppMark'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { NewBookDialog } from '@/screens/bookshelf/NewBookDialog'
import { ACCENTS, fmt } from '@/lib/book'
import { cn } from '@/lib/utils'
import { useStore, type Screen } from '@/state/context'
import { wordsToday } from '@/state/layout'

const NAV: { id: Screen; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'write', label: 'Write', icon: PenLine },
  { id: 'details', label: 'Book details', icon: FileText },
  { id: 'world', label: 'World notes', icon: Users },
  { id: 'design', label: 'Design', icon: SwatchBook },
  { id: 'preview', label: 'Preview', icon: BookOpen },
  { id: 'export', label: 'Export', icon: Download },
]

function NavRow({ active, onClick, icon: Icon, label, disabled }: {
  active: boolean; onClick: () => void; icon: ComponentType<{ className?: string; strokeWidth?: number }>; label: string; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] transition-colors',
        active ? 'bg-brand-soft text-brand-ink' : 'text-muted-foreground hover:bg-raised hover:text-foreground',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active && 'text-brand')} strokeWidth={1.5} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function AccentPicker() {
  const { settings, setSettings } = useStore()
  const current = ACCENTS.find(([id]) => id === settings.accent) ?? ACCENTS[0]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Accent colour: ${current[1]}`} title="Accent colour" className="grid size-7 place-items-center rounded-md hover:bg-raised">
          <span className="size-3.5 rounded-full bg-brand" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-52 gap-0 p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[12px] text-muted-foreground">Accent colour</p>
        <div role="radiogroup" aria-label="Accent colour" className="flex flex-col">
          {ACCENTS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === current[0]}
              data-accent={id}
              onClick={() => setSettings({ accent: id })}
              className="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[14px] hover:bg-raised aria-checked:bg-brand-soft aria-checked:text-brand-ink"
            >
              <span className="size-3.5 shrink-0 rounded-full bg-brand" />
              {name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function Sidebar() {
  const s = useStore()
  const b = s.book
  const today = b ? wordsToday(b) : 0
  const goal = b ? Math.max(1, b.goals.daily_words) : 1
  const [creating, setCreating] = useState(false)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar px-3 pt-4 pb-3">
      <div className="flex items-center gap-2 px-2.5 pb-5 text-foreground">
        <AppMark />
        <span className="text-[15px] font-semibold">Between the Lines</span>
      </div>

      <NavRow active={!b} onClick={() => void s.closeBook()} icon={Library} label="Bookshelf" />

      {b && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-5 mb-2 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-raised"
                aria-label="Switch book"
              >
                <CoverView id={b.id} modified={b.modified} className="h-10 w-7 shrink-0 rounded-[2px] border border-border" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-foreground" title={b.meta.title || undefined}>{b.meta.title || 'Untitled book'}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{b.meta.author || 'No author yet'}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">Open another book</DropdownMenuLabel>
              {s.library.filter((x) => x.id !== b.id).slice(0, 8).map((x) => (
                <DropdownMenuItem key={x.id} onSelect={() => void s.openBook(x.id)}>
                  <span className="truncate">{x.title || 'Untitled book'}</span>
                </DropdownMenuItem>
              ))}
              {s.library.length <= 1 && <DropdownMenuItem disabled>This is your only book</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void s.closeBook()}>All books</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreating(true)}>New book…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <NewBookDialog open={creating} onOpenChange={setCreating} />
          <nav className="flex flex-col gap-0.5" aria-label="Book">
            {NAV.map((n) => (
              <NavRow key={n.id} active={s.screen === n.id} onClick={() => s.setScreen(n.id)} icon={n.icon} label={n.label} />
            ))}
          </nav>
        </>
      )}

      <div className="mt-auto flex flex-col gap-3 px-2.5">
        {b && (
          <div>
            <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
              <span>Today</span>
              <span className="num">{fmt(today)} of {fmt(goal)} words</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-brand-track" role="progressbar" aria-valuenow={today} aria-valuemax={goal} aria-label="Words written today">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <label className="flex flex-1 items-center gap-2">
            <Moon className="size-4" strokeWidth={1.5} />
            <span className="flex-1">Dark</span>
            <Switch checked={s.settings.dark} onCheckedChange={(v) => s.setSettings({ dark: v })} aria-label="Dark interface" />
          </label>
          <AccentPicker />
        </div>
        {b && <SaveStamp />}
      </div>
    </aside>
  )
}

function SaveStamp() {
  const { saveState, saveNow, saveError } = useStore()
  if (saveState === 'error')
    return (
      <p className="text-[12px] text-destructive" title={saveError ?? undefined}>
        Couldn't save.{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => void saveNow()}>Retry</button>
      </p>
    )
  const text = saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : 'All changes saved'
  return <p className="text-[12px] text-muted-foreground" aria-live="polite">{text}</p>
}
