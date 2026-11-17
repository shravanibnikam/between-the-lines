// The Write screen: outline | the chapter on a page | inspector. "What am I writing now?"
import { PanelRight } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { area, hasBody } from '@/lib/book'
import type { Area } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/context'
import { EditorColumn } from './write/Editor'
import { Inspector } from './write/Inspector'
import { Outline } from './write/Outline'
import { useSectionOps } from './write/useSectionOps'

const WIDE = '(min-width: 1360px)'
const useWide = () =>
  useSyncExternalStore(
    (cb) => {
      const m = matchMedia(WIDE)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(WIDE).matches,
  )

/** Words ignored with "Ignore in this session" (until the app closes). */
const sessionIgnored = new Set<string>()
const edgePunct = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

export function Write() {
  const { book, selection, select, focus, setFocus, updateBook } = useStore()
  const b = book!
  const section = area(b, selection.area)[selection.index]
  const ops = useSectionOps()
  const [titleFocus, setTitleFocus] = useState(0)
  const wide = useWide()
  const [inspectorOpen, setInspectorOpen] = useState(false)

  // Never leave the selection out of range (after a delete, a restore, another screen's edit).
  useEffect(() => {
    if (section) return
    const a = (['Body', 'Front', 'Back'] as Area[]).find((x) => area(b, x).length > 0)
    if (a) select(a, 0)
  }, [section, b, select])

  // Alt+↑/↓ moves the selected section; Esc leaves focus.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = (e) => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && section) {
        e.preventDefault()
        ops.move(selection.area, selection.index, selection.index + (e.key === 'ArrowUp' ? -1 : 1))
      } else if (e.key === 'Escape' && focus && !document.querySelector('[role=dialog],[role=alertdialog],[data-slot=popover-content]')) {
        setFocus(false)
      }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ---- spelling: one debounced check of this section's text ----
  const [ignored, setIgnored] = useState<string[]>(() => [...sessionIgnored])
  const enabled = b.spelling.enabled
  const text = section && hasBody(section.kind) ? section.text : null
  const worldNames = b.world.flatMap((e) => `${e.name} ${e.aliases}`.split(/[\s,]+/)).map((w) => w.replace(edgePunct, '')).filter(Boolean)
  const extraKey = [...b.spelling.personal, ...ignored, ...worldNames].join('\n')
  const [spell, setSpell] = useState<{ id: string; words: string[] } | null>(null)
  const [spellErr, setSpellErr] = useState(false)
  const [spellTry, setSpellTry] = useState(0)
  const sectionId = section?.id
  useEffect(() => {
    if (!enabled || text === null || !sectionId) return
    let live = true
    const t = setTimeout(() => {
      api.spellMisspelled(text, extraKey ? extraKey.split('\n') : []).then(
        (words) => {
          if (!live) return
          setSpell({ id: sectionId, words })
          setSpellErr(false)
        },
        () => live && setSpellErr(true),
      )
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [enabled, text, extraKey, sectionId, spellTry])
  const accepted = new Set([...b.spelling.personal, ...ignored].map((w) => w.toLowerCase()))
  const words = spell && spell.id === sectionId ? spell.words.filter((w) => !accepted.has(w.toLowerCase())) : null
  const addWord = (w: string) =>
    updateBook((d) => {
      if (!d.spelling.personal.includes(w)) d.spelling.personal.push(w)
    })
  const ignoreWord = (w: string) => {
    sessionIgnored.add(w)
    setIgnored([...sessionIgnored])
  }

  const inspector = section && !focus && (wide || inspectorOpen) && (
    <Inspector
      section={section}
      area={selection.area}
      index={selection.index}
      spell={{ words, error: spellErr, onRetry: () => setSpellTry((n) => n + 1), onAdd: addWord, onIgnore: ignoreWord }}
      className={cn('w-[300px] shrink-0 border-l border-border bg-background', !wide && 'absolute top-12 right-0 bottom-0 z-10')}
    />
  )

  return (
    <div className="relative flex h-full">
      {!focus && <Outline onRename={() => setTitleFocus((n) => n + 1)} className="w-[220px] shrink-0 border-r border-border min-[1120px]:w-[260px]" />}
      <div className="min-w-0 flex-1">
        {section ? (
          <EditorColumn
            section={section}
            area={selection.area}
            index={selection.index}
            misspelled={enabled && words ? words : []}
            onAddWord={addWord}
            onIgnoreWord={ignoreWord}
            titleFocus={titleFocus}
            toolbarEnd={!wide && !focus && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={inspectorOpen ? 'Hide chapter details' : 'Show chapter details'}
                    aria-pressed={inspectorOpen}
                    onClick={() => setInspectorOpen(!inspectorOpen)}
                    className={cn('ml-1', inspectorOpen && 'bg-brand-soft text-brand-ink')}
                  >
                    <PanelRight />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{inspectorOpen ? 'Hide' : 'Show'} chapter details, print pages and snapshots</TooltipContent>
              </Tooltip>
            )}
          />
        ) : (
          <div className="flex h-full items-start justify-center px-8 pt-24">
            <div className="flex max-w-sm flex-col items-start gap-4">
              <h1 className="text-[32px] leading-10 font-bold text-foreground">Write</h1>
              <p className="text-[14px] text-muted-foreground">This book has no chapters yet. Add the first one to start writing.</p>
              <Button onClick={() => ops.add('Body', 'Chapter')}>Add a chapter</Button>
            </div>
          </div>
        )}
      </div>
      {inspector}
    </div>
  )
}
