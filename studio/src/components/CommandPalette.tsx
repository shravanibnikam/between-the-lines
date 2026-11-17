// Ctrl/Cmd+K: go to a screen, jump to a section, open another book, or run an action.
// Mount once inside <StoreProvider>; it owns its own shortcut and open state (no props).
import { useEffect, useState } from 'react'
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { ACCENTS, AREA_LABEL, displayTitle, newSection, numbers } from '@/lib/book'
import type { Area } from '@/lib/types'
import { useStore, type Screen } from '@/state/context'

const SCREENS: [Screen, string][] = [
  ['write', 'Write'], ['details', 'Book details'], ['world', 'World notes'], ['design', 'Design'], ['preview', 'Preview'], ['export', 'Export'],
]

export function CommandPalette() {
  const s = useStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { book } = s
  const run = (fn: () => void) => () => { setOpen(false); fn() }
  const go = (screen: Screen) => run(() => s.setScreen(screen))

  const sections: { area: Area; index: number; title: string }[] = []
  if (book) {
    const nums = numbers(book)
    for (const area of ['Front', 'Body', 'Back'] as const) {
      const list = area === 'Front' ? book.front : area === 'Body' ? book.body : book.back
      list.forEach((sec, i) => sections.push({ area, index: i, title: displayTitle(book, sec, area === 'Body' ? nums[i] : null) }))
    }
  }

  const addChapter = () => {
    if (!book) return
    const index = book.body.length
    s.updateBook((d) => { d.body.push(newSection('Chapter')) })
    s.select('Body', index)
    s.setScreen('write')
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Go to a screen or section, open a book, or run an action.">
      <Command className="h-auto">
        <CommandInput placeholder="Type a command or search…" />
        <CommandList className="max-h-[360px]">
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            {book && SCREENS.map(([id, label]) => (
              <CommandItem key={id} value={`Go to ${label}`} onSelect={go(id)}>{label}</CommandItem>
            ))}
            <CommandItem value="Go to Bookshelf" onSelect={run(() => void s.closeBook())}>Bookshelf</CommandItem>
          </CommandGroup>
          {sections.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Sections">
                {sections.map((x) => (
                  <CommandItem key={`${x.area}${x.index}`} value={`${x.title} (${AREA_LABEL[x.area]} ${x.index + 1})`} onSelect={run(() => { s.select(x.area, x.index); s.setScreen('write') })}>
                    <span className="truncate">{x.title}</span>
                    <span className="ml-auto text-[12px] text-muted-foreground">{AREA_LABEL[x.area]}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {s.library.some((b) => b.id !== book?.id) && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Open a book">
                {s.library.filter((b) => b.id !== book?.id).map((b) => (
                  <CommandItem key={b.id} value={`Open book ${b.title || 'Untitled book'} ${b.id}`} onSelect={run(() => void s.openBook(b.id))}>
                    <span className="truncate">{b.title.trim() || 'Untitled book'}</span>
                    <span className="ml-auto truncate text-[12px] text-muted-foreground">{b.author}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {book && <CommandItem value="New chapter" onSelect={run(addChapter)}>New chapter</CommandItem>}
            {book && <CommandItem value="Export print PDF" onSelect={go('export')}>Export print PDF</CommandItem>}
            <CommandItem value="Toggle dark mode" onSelect={run(() => s.setSettings({ dark: !s.settings.dark }))}>Toggle dark mode</CommandItem>
            {ACCENTS.filter(([id]) => id !== s.settings.accent).map(([id, name]) => (
              <CommandItem key={id} value={`Accent colour ${name}`} onSelect={run(() => s.setSettings({ accent: id }))}>
                <span data-accent={id} className="size-3 rounded-full bg-brand" />Accent colour: {name}
              </CommandItem>
            ))}
            {book && <CommandItem value="Toggle focus" onSelect={run(() => { s.setScreen('write'); s.setFocus(!s.focus) })}>Toggle focus</CommandItem>}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
