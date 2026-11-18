// The centre of the Write screen: toolbar, the chapter on a page, and the TipTap editor that
// reads and writes the book's line format (see markup.ts).
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EditorState } from '@tiptap/pm/state'
import { Bold, Focus, ImagePlus, Italic, Minus, SunDim, TextCursorInput, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Bar } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, isTauri, pickImage } from '@/lib/api'
import { countWords, displayTitle, findSection, fmt, hasBody, KIND_LABEL, numberLabel, numbers } from '@/lib/book'
import { fontStack } from '@/lib/fonts'
import type { Area, Section } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/context'
import { playRelease, playStroke, preloadSounds, strokeFor } from './keysound'
import { fromBlocks, toLines } from './markup'
import { spellKey, WriteDecorations } from './plugins'

/** Where the rail (the typing line) sits, as a percentage of the editor's height. */
const RAIL = 70

const EDITOR_CSS = `
.bb-editor .ProseMirror { outline: none; white-space: pre-wrap; word-wrap: break-word; }
.bb-editor .ProseMirror > * { transition: opacity .15s; }
.bb-editor .ProseMirror p { margin: 0 0 .6em; }
.bb-editor .ProseMirror h2, .bb-editor .ProseMirror h3 { font-family: var(--bb-heading); font-weight: 600; line-height: 1.3; }
.bb-editor .ProseMirror h2 { font-size: 1.35em; margin: 1.2em 0 .5em; }
.bb-editor .ProseMirror h3 { font-size: 1.1em; margin: 1em 0 .4em; }
.bb-editor .ProseMirror blockquote { margin: 0 0 .6em; padding-left: 1.25em; border-left: 2px solid var(--border); }
.bb-editor .ProseMirror hr { border: 0; height: auto; margin: .4em 0 1em; text-align: center; }
.bb-editor .ProseMirror hr::after { content: '*  *  *'; white-space: pre; color: var(--muted-foreground); }
.bb-editor .ProseMirror hr.ProseMirror-selectednode { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 4px; }
.bb-editor .spell-error { text-decoration: underline wavy var(--destructive); text-decoration-thickness: 1px; text-underline-offset: 4px; text-decoration-skip-ink: none; cursor: pointer; }
.bb-editor.dim .ProseMirror-focused > :not(.is-current) { opacity: .32; }

/* Carriage (focus + typewriter): every block is one unwrapped line; the track slides so the caret
   sits on the rail, and the stage mask fades earlier lines upward and the line's ends sideways. */
.bb-carriage .bb-editor { position: absolute; top: 0; left: 0; width: max-content; transition: transform 90ms ease-out; will-change: transform; caret-color: var(--brand); }
.bb-carriage .bb-editor .ProseMirror > * { white-space: pre; }
.bb-carriage .bb-stage {
  -webkit-mask-image: linear-gradient(to bottom, transparent 6%, rgb(0 0 0 / .14) 32%, rgb(0 0 0 / .42) calc(${RAIL}% - var(--bb-line) - 14px), #000 calc(${RAIL}% - var(--bb-line) - 6px), #000 calc(${RAIL}% + 2px), transparent calc(${RAIL}% + 12px)),
    linear-gradient(to right, transparent 3%, #000 30%, #000 78%, transparent 97%);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(to bottom, transparent 6%, rgb(0 0 0 / .14) 32%, rgb(0 0 0 / .42) calc(${RAIL}% - var(--bb-line) - 14px), #000 calc(${RAIL}% - var(--bb-line) - 6px), #000 calc(${RAIL}% + 2px), transparent calc(${RAIL}% + 12px)),
    linear-gradient(to right, transparent 3%, #000 30%, #000 78%, transparent 97%);
  mask-composite: intersect;
}
.bb-desk { background: linear-gradient(118deg, #d2d3dc 0%, #bdbec8 46%, #9c9da8 100%); }
.dark .bb-desk { background: linear-gradient(118deg, #242428 0%, #1b1b1e 50%, #131315 100%); }
.bb-desk::before, .bb-desk::after { content: ''; position: absolute; left: 0; right: 0; }
/* the lamp: a beam that widens upward from the type head (a conic wedge, soft at its edges and
   fading with height, plus a hot spot at the source) and a short spill below the rail */
.bb-desk::before {
  /* a spotlight from the type head: narrow at the pill, widening upward, fading by distance so
     only the typing line and a couple of lines above it are lit */
  bottom: calc(100% - ${RAIL}%); height: calc(var(--bb-line) * 5 + 40px);
  background:
    radial-gradient(ellipse 120px 50px at 50% 100%, rgb(var(--lamp) / calc(var(--lamp-a) * 1.25)) 0%, transparent 72%),
    conic-gradient(from -50deg at 50% calc(100% + 70px), transparent 0deg, rgb(var(--lamp) / calc(var(--lamp-a) * .5)) 14deg, rgb(var(--lamp) / calc(var(--lamp-a) * 1.2)) 32deg, rgb(var(--lamp) / calc(var(--lamp-a) * 1.2)) 68deg, rgb(var(--lamp) / calc(var(--lamp-a) * .5)) 86deg, transparent 100deg);
  -webkit-mask-image: radial-gradient(ellipse 60% 100% at 50% 100%, #000 0%, rgb(0 0 0 / .85) 35%, rgb(0 0 0 / .4) 65%, transparent 95%);
  mask-image: radial-gradient(ellipse 60% 100% at 50% 100%, #000 0%, rgb(0 0 0 / .85) 35%, rgb(0 0 0 / .4) 65%, transparent 95%);
}
.bb-desk::after { top: ${RAIL}%; bottom: 0; background: radial-gradient(ellipse min(16vw, 220px) 46% at 50% 0%, rgb(var(--lamp) / calc(var(--lamp-a) * .55)) 0%, transparent 75%); }
.bb-rail { background: #26262b; box-shadow: 0 1px 0 rgb(255 255 255 / .45); }
.dark .bb-rail { background: #34343a; box-shadow: 0 1px 0 rgb(255 255 255 / .04); }
`

/** The lamp's colour (cool white → candle) and strength. Kept low on dark so light text stays readable in it. */
function lampVars(b: number, w: number, dark: boolean) {
  b = Math.min(1, Math.max(0, b))
  w = Math.min(1, Math.max(0, w))
  const mix = (cool: number, warm: number) => Math.round(cool + (warm - cool) * w)
  return {
    '--lamp': `${mix(248, 255)} ${mix(247, 236)} ${mix(242, 200)}`,
    '--lamp-a': String(dark ? 0.08 + 0.22 * b : 0.3 + 0.65 * b),
  }
}

type BlockKind = 'p' | 'h2' | 'h3' | 'quote'

interface ColumnProps {
  section: Section
  area: Area
  index: number
  /** Misspelled words to underline (already without ignored/added ones). */
  misspelled: string[]
  onAddWord: (w: string) => void
  onIgnoreWord: (w: string) => void
  /** Bumped to focus the title field (outline "Rename"). */
  titleFocus: number
  toolbarEnd?: ReactNode
}

export function EditorColumn({ section, area, index, misspelled, onAddWord, onIgnoreWord, titleFocus, toolbarEnd }: ColumnProps) {
  const { book, updateBook, registerFlush, settings, focus, setFocus } = useStore()
  const b = book!
  const scroller = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const body = hasBody(section.kind)
  const carriage = focus && settings.typewriter
  const carriageRef = useRef(carriage)
  useLayoutEffect(() => {
    carriageRef.current = carriage
  })
  const track = useRef<HTMLDivElement>(null)
  const [chrome, setChrome] = useState(true)

  // ---- the TipTap editor and its sync with Section.text --------------------------------
  const idRef = useRef<string | null>(null) // section the editor holds
  const bookIdRef = useRef<string | null>(null) // and the book it belongs to
  const baseRef = useRef<string>('') // that section's text as the editor last read or wrote it
  const pending = useRef<{ toJSON: () => unknown } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const loadingRef = useRef(true)
  const loadGen = useRef(0)
  const [spelling] = useState(() => ({ words: new Set<string>() })) // read by the decoration plugin, written below
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const doc = pending.current
    pending.current = null
    const id = idRef.current
    const bookId = bookIdRef.current
    if (!doc || !id) return
    const lines = toLines(doc.toJSON() as Parameters<typeof toLines>[0])
    const base = baseRef.current
    if (lines === base) return
    baseRef.current = lines
    // Only into the same book, and only if nothing else (a snapshot restore) replaced the text meanwhile.
    updateBook((d) => {
      if (d.id !== bookId) return
      const s = findSection(d, id)
      if (s && s.text === base) s.text = lines
    })
  }, [updateBook])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: false, orderedList: false, listItem: false, listKeymap: false, code: false, codeBlock: false,
        strike: false, underline: false, link: false, hardBreak: false,
      }),
      WriteDecorations.configure({ words: () => spelling.words }),
    ],
    editable: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { spellcheck: 'false', 'aria-label': 'Chapter text', class: 'min-h-[30vh]' },
      // in carriage mode the text moves to the caret, so nothing may scroll to it
      handleScrollToSelection: () => carriageRef.current,
    },
    onUpdate: ({ editor: e }) => {
      if (loadingRef.current) return
      pending.current = e.state.doc
      clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, 300)
    },
  })

  // Load the selected section (flushing edits to the previous one), or reload it when its text
  // changed from outside (snapshot restore). Our own writes leave text === baseRef.
  useLayoutEffect(() => {
    if (!editor || !body) return
    if (section.id === idRef.current && section.text === baseRef.current && retry === 0) return
    if (section.id !== idRef.current) flush()
    clearTimeout(timer.current)
    pending.current = null
    idRef.current = section.id
    bookIdRef.current = b.id
    baseRef.current = section.text
    loadingRef.current = true
    editor.setEditable(false, false)
    setLoadState('loading')
    const gen = ++loadGen.current
    api.markupBlocks(section.text).then(
      (blocks) => {
        if (gen !== loadGen.current || editor.isDestroyed) return
        const doc = editor.schema.nodeFromJSON(fromBlocks(blocks))
        // A fresh state: undo history never crosses sections.
        editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }))
        editor.setEditable(true, false)
        editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false)) // let toolbar listeners refresh
        loadingRef.current = false
        setLoadState('ready')
        setRetry(0)
      },
      () => {
        if (gen === loadGen.current) setLoadState('error')
      },
    )
  }, [editor, body, b.id, section.id, section.text, retry, flush])

  // Flush when the screen goes away, and whenever the store asks (save, close, switching books).
  // A section without a body has nothing to flush.
  useEffect(() => () => flush(), [flush])
  useEffect(() => registerFlush(flush), [registerFlush, flush])
  useEffect(() => {
    if (!body) flush()
  }, [body, flush])
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [section.id])

  // Spelling underlines.
  const wordsKey = misspelled.join('\n')
  useEffect(() => {
    spelling.words.clear()
    if (wordsKey) for (const w of wordsKey.split('\n')) spelling.words.add(w)
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(spellKey, true).setMeta('addToHistory', false))
  }, [editor, wordsKey, spelling])

  // Typewriter: keep the caret line a third of the way down the editor viewport.
  const typewriter = settings.typewriter
  useEffect(() => {
    if (!editor || !typewriter || carriage) return
    const keep = () => {
      const el = scroller.current
      if (!el || !editor.isFocused) return
      const c = editor.view.coordsAtPos(editor.state.selection.head)
      const box = el.getBoundingClientRect()
      el.scrollTop += c.top - (box.top + box.height / 3)
    }
    editor.on('selectionUpdate', keep)
    editor.on('focus', keep)
    return () => {
      editor.off('selectionUpdate', keep)
      editor.off('focus', keep)
    }
  }, [editor, typewriter, carriage])

  // Typewriter sounds: each key typed in the text makes its own sound, going down and coming up.
  const sound = typewriter && settings.typewriter_sound
  useEffect(() => {
    if (!editor || !sound) return
    preloadSounds()
    const dom = editor.view.dom
    const onDown = (e: KeyboardEvent) => {
      const s = strokeFor(e)
      if (s && editor.isEditable) playStroke(s, e.code, e.key)
    }
    const onUp = (e: KeyboardEvent) => playRelease(e.code)
    dom.addEventListener('keydown', onDown)
    dom.addEventListener('keyup', onUp)
    return () => {
      dom.removeEventListener('keydown', onDown)
      dom.removeEventListener('keyup', onUp)
    }
  }, [editor, sound])

  // Carriage: slide the text so the caret sits mid-screen on the rail; typing hides the toolbar.
  useEffect(() => {
    if (!editor || !carriage || loadState !== 'ready') return
    const el = scroller.current
    const tr = track.current
    if (!el || !tr) return
    const place = () => {
      if (editor.isDestroyed) return
      const c = editor.view.coordsAtPos(editor.state.selection.head)
      const r = tr.getBoundingClientRect() // same translation as c, so the difference is the caret's place in the text
      const x = el.clientWidth / 2 - (c.left - r.left)
      const y = (el.clientHeight * RAIL) / 100 - 8 - (c.bottom - r.top)
      tr.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
    }
    const typed = () => {
      place()
      setChrome(false)
    }
    place()
    // carry on where the caret was, or at the end of the chapter when it was never placed
    editor.commands.focus(editor.state.selection.head <= 1 ? 'end' : null)
    void document.fonts.ready.then(place)
    const ro = new ResizeObserver(place)
    ro.observe(el)
    editor.on('selectionUpdate', place)
    editor.on('focus', place)
    editor.on('update', typed)
    return () => {
      ro.disconnect()
      editor.off('selectionUpdate', place)
      editor.off('focus', place)
      editor.off('update', typed)
      tr.style.transform = ''
    }
  }, [editor, carriage, loadState, section.id, settings.editor_size, settings.typewriter_font])

  useEffect(() => {
    if (titleFocus) titleRef.current?.focus()
  }, [titleFocus])

  // ---- spelling popover -----------------------------------------------------------------
  const [spell, setSpell] = useState<{ word: string; from: number } | null>(null)
  const anchor = useRef<{ getBoundingClientRect: () => DOMRect } | null>(null)
  const openSpell = (target: EventTarget, prevent: () => void) => {
    const el = (target as HTMLElement).closest?.('.spell-error') as HTMLElement | null
    if (!el || !editor) return
    prevent()
    const rect = el.getBoundingClientRect()
    anchor.current = { getBoundingClientRect: () => rect }
    setSpell({ word: el.dataset.word ?? el.textContent ?? '', from: editor.view.posAtDOM(el, 0) })
  }
  const replaceWord = (to: string) => {
    if (!editor || !spell) return
    const end = spell.from + spell.word.length
    if (editor.state.doc.textBetween(spell.from, end) === spell.word) editor.view.dispatch(editor.state.tr.insertText(to, spell.from, end))
    setSpell(null)
    editor.commands.focus()
  }

  const n = numbers(b)
  let label = area === 'Body' ? numberLabel(b, section, n[index]) : KIND_LABEL[section.kind]
  if (section.kind === 'Chapter' && !label.startsWith(b.terms.chapter)) label = `${b.terms.chapter} ${label}` // "I" alone reads oddly
  const words = countWords(section.text)
  const headingFont = fontStack(b.style.heading_font)
  // Courier ships with macOS and Windows; the bundled Source Code Pro covers everything else.
  const bodyFont = carriage && settings.typewriter_font ? `Courier, "Courier New", ${fontStack('Source Code Pro')}` : fontStack(b.style.body_font)
  const setField = (k: 'title' | 'subtitle', v: string) =>
    updateBook((d) => {
      const s = findSection(d, section.id)
      if (s) s[k] = v
    })

  return (
    <div
      className={cn('relative flex h-full min-w-0 flex-col', carriage && 'bb-carriage')}
      style={carriage ? ({ ...lampVars(settings.lamp_brightness, settings.lamp_warmth, settings.dark), '--bb-line': `${settings.editor_size * 1.6}px` } as CSSProperties) : undefined}
      onMouseMove={carriage ? () => setChrome(true) : undefined}
    >
      <style>{EDITOR_CSS}</style>
      {carriage && <div className="bb-desk pointer-events-none absolute inset-0" />}
      <div className={cn(carriage && 'absolute inset-x-0 top-0 z-30 transition-opacity duration-300', carriage && !chrome && 'pointer-events-none opacity-0')}>
        <Toolbar
          editor={body && loadState === 'ready' ? editor : null}
          words={body ? words : null}
          page={carriage}
          end={toolbarEnd}
          onFocus={() => setFocus(!focus)}
          focus={focus}
        />
      </div>
      {carriage && <div className="bb-rail pointer-events-none absolute inset-x-0 z-10 h-[2px]" style={{ top: `${RAIL}%` }} />}
      <div
        ref={scroller}
        className={cn('@container min-h-0 flex-1', carriage ? 'bb-stage relative overflow-clip' : 'overflow-y-auto')}
        onMouseDown={(e) => {
          // a click on the empty desk keeps writing where the caret was
          if (carriage && e.target === e.currentTarget && editor) {
            e.preventDefault()
            editor.commands.focus()
          }
        }}
      >
        <div className={cn(carriage ? 'contents' : 'mx-auto w-full max-w-[680px] px-4 py-8', focus && 'py-12')}>
          <article
            onMouseDown={(e) => {
              // clicks on the blank paper below the text put the caret at the end
              if (e.target === e.currentTarget && editor && body) {
                e.preventDefault()
                editor.commands.focus('end')
              }
            }}
            className={cn(carriage ? 'contents' : 'block min-h-[calc(100vh-8rem)] rounded-lg border border-border bg-card px-9 pt-12 pb-16 @min-[640px]:px-14')}
            style={typewriter && body && !carriage ? { paddingBottom: '62vh' } : undefined}
          >
            {!carriage && (
              <header className="mb-8">
                <h1 className="sr-only">{displayTitle(b, section, n[index] ?? null)}</h1>
                {body && <p className="text-[13px] text-muted-foreground">{label}</p>}
                {body ? (
                  <>
                    <input
                      ref={titleRef}
                      value={section.title}
                      onChange={(e) => setField('title', e.target.value)}
                      placeholder={section.kind === 'Chapter' ? 'Chapter title (optional)' : section.kind === 'Part' ? 'Part title (optional)' : 'Title'}
                      aria-label="Title"
                      className="mt-1 w-full bg-transparent text-[32px] leading-10 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
                      style={{ fontFamily: headingFont }}
                    />
                    <input
                      value={section.subtitle}
                      onChange={(e) => setField('subtitle', e.target.value)}
                      placeholder="Subtitle (optional)"
                      aria-label="Subtitle"
                      className="mt-1 w-full bg-transparent text-[18px] leading-7 text-muted-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
                      style={{ fontFamily: headingFont }}
                    />
                  </>
                ) : (
                  <p className="mt-1 text-[32px] leading-10 text-foreground" style={{ fontFamily: headingFont }}>
                    {section.kind === 'Contents' ? b.terms.contents || 'Contents' : 'Title page'}
                  </p>
                )}
              </header>
            )}
            {body ? (
              <>
                {loadState === 'error' && (
                  <p className="text-[14px] text-muted-foreground">
                    Couldn't open this chapter's text.{' '}
                    <button type="button" className="text-foreground underline underline-offset-2" onClick={() => setRetry((r) => r + 1)}>Retry</button>
                  </p>
                )}
                {loadState === 'loading' && editor?.isEmpty && <div className="flex flex-col gap-3" aria-busy><Bar className="h-4 w-full" /><Bar className="h-4 w-11/12" /><Bar className="h-4 w-4/5" /></div>}
                <div
                  ref={track}
                  className={cn('bb-editor relative', settings.dim_others && 'dim', loadState === 'error' && 'hidden')}
                  style={{ fontFamily: bodyFont, fontSize: settings.editor_size, lineHeight: 1.6, ['--bb-heading' as string]: headingFont }}
                  onClick={(e) => openSpell(e.target, () => {})}
                  onContextMenu={(e) => openSpell(e.target, () => e.preventDefault())}
                >
                  <EditorContent editor={editor} />
                  <EmptyHint editor={editor} />
                </div>
              </>
            ) : section.kind === 'TitlePage' ? (
              <TitlePageInfo />
            ) : (
              <ContentsInfo />
            )}
          </article>
        </div>
      </div>

      {carriage && <TypeHead onDone={() => editor?.commands.focus()} onExit={() => setFocus(false)} />}

      <Popover open={!!spell} onOpenChange={(o) => !o && setSpell(null)}>
        <PopoverAnchor virtualRef={anchor} />
        <PopoverContent align="start" className="w-60 gap-1 p-1.5" onOpenAutoFocus={(e) => e.preventDefault()}>
          {spell && <SpellMenu word={spell.word} onReplace={replaceWord} onAdd={() => { onAddWord(spell.word); setSpell(null) }} onIgnore={() => { onIgnoreWord(spell.word); setSpell(null) }} />}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function EmptyHint({ editor }: { editor: Editor | null }) {
  const empty = useEditorState({ editor, selector: ({ editor: e }) => !!e?.isEditable && e.isEmpty })
  if (!empty) return null
  return <p className="pointer-events-none absolute top-0 left-0 text-muted-foreground/80" aria-hidden>Start writing…</p>
}

function SpellMenu({ word, onReplace, onAdd, onIgnore }: { word: string; onReplace: (w: string) => void; onAdd: () => void; onIgnore: () => void }) {
  const [sugs, setSugs] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    api.spellSuggest(word).then((s) => live && setSugs(s), () => live && setFailed(true))
    return () => {
      live = false
    }
  }, [word])
  const item = 'flex h-8 w-full items-center rounded-md px-2 text-left text-[14px] hover:bg-raised focus-visible:bg-raised'
  return (
    <div className="flex flex-col" role="menu" aria-label={`Spelling of ${word}`}>
      {sugs === null && !failed && <div className="flex flex-col gap-2 p-2"><Bar className="h-4 w-24" /><Bar className="h-4 w-20" /></div>}
      {failed && <p className="px-2 py-1.5 text-[13px] text-muted-foreground">Couldn't load suggestions.</p>}
      {sugs?.length === 0 && <p className="px-2 py-1.5 text-[13px] text-muted-foreground">No suggestions for “{word}”.</p>}
      {sugs?.map((s) => (
        <button key={s} type="button" role="menuitem" className={cn(item, 'font-medium')} onClick={() => onReplace(s)}>{s}</button>
      ))}
      <div className="my-1 h-px bg-border" />
      <button type="button" role="menuitem" className={item} onClick={onAdd}>Add to this book's words</button>
      <button type="button" role="menuitem" className={item} onClick={onIgnore}>Ignore in this session</button>
    </div>
  )
}

// ---- toolbar ------------------------------------------------------------------------------

function Toolbar({ editor, words, page, end, focus, onFocus }: {
  editor: Editor | null; words: number | null; page: boolean; end?: ReactNode; focus: boolean; onFocus: () => void
}) {
  const { settings, setSettings } = useStore()
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { bold: false, italic: false, block: 'p' as BlockKind }
      const block: BlockKind = e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : e.isActive('blockquote') ? 'quote' : 'p'
      return { bold: e.isActive('bold'), italic: e.isActive('italic'), block }
    },
  }) ?? { bold: false, italic: false, block: 'p' as BlockKind }

  const setBlock = (k: string) => {
    if (!editor) return
    let c = editor.chain().focus()
    if (editor.isActive('blockquote') && k !== 'quote') c = c.lift('blockquote')
    if (k === 'p') c.setParagraph().run()
    else if (k === 'h2' || k === 'h3') c.setHeading({ level: k === 'h2' ? 2 : 3 }).run()
    else c.setParagraph().setBlockquote().run()
  }

  return (
    <div className={cn('@container flex h-12 shrink-0 items-center gap-1 px-4', !page && 'border-b border-border')} role="toolbar" aria-label="Formatting">
      {editor && (
        <>
          <Select value={st.block} onValueChange={setBlock}>
            <SelectTrigger size="sm" className="w-[132px]" aria-label="Block type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="p">Text</SelectItem>
              <SelectItem value="h2">Subheading</SelectItem>
              <SelectItem value="h3">Minor heading</SelectItem>
              <SelectItem value="quote">Quote</SelectItem>
            </SelectContent>
          </Select>
          <IconToggle label="Bold" keys="Ctrl+B" pressed={st.bold} onChange={() => editor.chain().focus().toggleBold().run()}><Bold /></IconToggle>
          <IconToggle label="Italic" keys="Ctrl+I" pressed={st.italic} onChange={() => editor.chain().focus().toggleItalic().run()}><Italic /></IconToggle>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().setHorizontalRule().run()} aria-label="Insert scene break">
            <Minus /><span className="hidden @min-[760px]:inline">Scene break</span>
          </Button>
          <InsertImage editor={editor} />
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <TextToggle label="Typewriter" hint="Keep the line you're typing a third of the way down" pressed={settings.typewriter} onChange={(v) => setSettings({ typewriter: v })}><TextCursorInput /></TextToggle>
        {settings.typewriter && <TextToggle label="Sound" hint="Typewriter sounds as you type" pressed={settings.typewriter_sound} onChange={(v) => setSettings({ typewriter_sound: v })}><Volume2 /></TextToggle>}
        <TextToggle label="Dim" hint="Dim every paragraph but the one you're in" pressed={settings.dim_others} onChange={(v) => setSettings({ dim_others: v })}><SunDim /></TextToggle>
        <TextToggle label="Focus" hint={focus ? 'Leave focus (Esc)' : 'Hide everything but the page'} pressed={focus} onChange={onFocus}><Focus /></TextToggle>
        {words !== null && <span className="num ml-2 hidden text-[13px] whitespace-nowrap text-muted-foreground @min-[440px]:inline">{fmt(words)} words</span>}
        {end}
      </div>
    </div>
  )
}

/** Copy a picked image into the book and put its `![](name)` line at the cursor, as its own paragraph. */
function InsertImage({ editor }: { editor: Editor }) {
  const { book } = useStore()
  const [busy, setBusy] = useState(false)
  const insert = async () => {
    setBusy(true)
    try {
      const img = await pickImage(book!.id)
      if (img) editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: `![](${img.name})` }] }).run()
    } catch (e) {
      toast.error("Couldn't add that image", { description: String(e) })
    } finally {
      setBusy(false)
    }
  }
  const btn = (
    <Button variant="ghost" size="sm" onClick={() => void insert()} disabled={!isTauri || busy} aria-label="Insert image">
      <ImagePlus /><span className="hidden @min-[760px]:inline">Image</span>
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{isTauri ? btn : <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{btn}</span>}</TooltipTrigger>
      <TooltipContent>{isTauri ? 'A PNG or JPEG, as wide as the text. Type a caption between the brackets.' : 'Available in the desktop app'}</TooltipContent>
    </Tooltip>
  )
}

function IconToggle({ label, keys, pressed, onChange, children }: { label: string; keys: string; pressed: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle size="sm" pressed={pressed} onPressedChange={onChange} aria-label={label} className="aria-pressed:bg-brand-soft aria-pressed:text-brand-ink">{children}</Toggle>
      </TooltipTrigger>
      <TooltipContent>{label} <span className="text-muted-foreground">{keys}</span></TooltipContent>
    </Tooltip>
  )
}

function TextToggle({ label, hint, pressed, onChange, children }: { label: string; hint: string; pressed: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle size="sm" pressed={pressed} onPressedChange={onChange} aria-label={label} className="text-muted-foreground aria-pressed:bg-brand-soft aria-pressed:text-brand-ink">
          {children}<span className="hidden text-[13px] @min-[700px]:inline">{label}</span>
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/** The pill on the rail under the caret: the lamp's source and the carriage-mode menu. */
function TypeHead({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  const { settings, setSettings } = useStore()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Lamp and focus settings"
          className="absolute z-20 flex h-[22px] w-[54px] -translate-y-1/2 items-center justify-center gap-[5px] rounded-full border border-black/10 bg-[#ededf1] hover:bg-white dark:border-white/10 dark:bg-[#2a2a2f] dark:hover:bg-[#333339]"
          style={{ top: `calc(${RAIL}% + 1px)`, left: 'calc(50% - 10px)', boxShadow: '0 1px 2px rgb(0 0 0 / .28), 0 0 22px 2px rgb(var(--lamp) / calc(var(--lamp-a) * 1.1))' }}
        >
          <span className="size-[5px] rounded-full bg-black/20 dark:bg-white/25" />
          <span className="size-[5px] rounded-full bg-black/20 dark:bg-white/25" />
          <span className="size-[5px] rounded-full bg-brand" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-64"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onDone()
        }}
      >
        <label className="flex flex-col gap-2 text-[13px]">
          Lamp brightness
          <Slider min={0} max={1} step={0.01} value={[settings.lamp_brightness]} onValueChange={([v]) => setSettings({ lamp_brightness: v })} aria-label="Lamp brightness" />
        </label>
        <label className="flex flex-col gap-2 text-[13px]">
          Lamp warmth
          <Slider min={0} max={1} step={0.01} value={[settings.lamp_warmth]} onValueChange={([v]) => setSettings({ lamp_warmth: v })} aria-label="Lamp warmth" />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Typewriter type
          <Switch checked={settings.typewriter_font} onCheckedChange={(v) => setSettings({ typewriter_font: v })} />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Key sounds
          <Switch checked={settings.typewriter_sound} onCheckedChange={(v) => setSettings({ typewriter_sound: v })} />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Dim other paragraphs
          <Switch checked={settings.dim_others} onCheckedChange={(v) => setSettings({ dim_others: v })} />
        </label>
        <Button variant="outline" size="sm" onClick={onExit}>Leave focus <span className="text-muted-foreground">Esc</span></Button>
      </PopoverContent>
    </Popover>
  )
}

// ---- generated pages ------------------------------------------------------------------------

function TitlePageInfo() {
  const { book, setScreen } = useStore()
  const m = book!.meta
  const rows: [string, string][] = [['Title', m.title], ['Subtitle', m.subtitle], ['Author', m.author], ['Publisher', m.publisher]]
  return (
    <div className="flex flex-col gap-5 text-[14px]">
      <p className="text-muted-foreground">The title page is made from your book's details; there is no text to write here.</p>
      <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn(!v && 'text-muted-foreground')}>{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <div><Button variant="outline" onClick={() => setScreen('details')}>Edit in Book details</Button></div>
    </div>
  )
}

function ContentsInfo() {
  const { book, updateBook } = useStore()
  const b = book!
  const n = numbers(b)
  const rows = (['Front', 'Body', 'Back'] as Area[]).flatMap((a) =>
    (a === 'Front' ? b.front : a === 'Body' ? b.body : b.back)
      .map((s, i) => ({ a, i, s }))
      .filter(({ s }) => s.kind !== 'TitlePage' && s.kind !== 'Contents'),
  )
  const toggle = (a: Area, i: number, v: boolean) =>
    updateBook((d) => {
      ;(a === 'Front' ? d.front : a === 'Body' ? d.body : d.back)[i].in_contents = v
    })
  return (
    <div className="flex flex-col gap-5 text-[14px]">
      <p className="text-muted-foreground">The contents list is made from your sections, with page numbers in print and links in ebooks. Choose which sections it lists.</p>
      <label className="flex flex-col gap-2">
        <span className="font-medium">Heading</span>
        <Input value={b.terms.contents} onChange={(e) => updateBook((d) => { d.terms.contents = e.target.value })} className="h-9 max-w-xs" />
      </label>
      <ul className="flex flex-col">
        {rows.map(({ a, i, s }) => (
          <li key={s.id} className="flex h-10 items-center justify-between gap-4 border-b border-rule last:border-b-0">
            <span className="truncate">{displayTitle(b, s, a === 'Body' ? n[i] : null)}</span>
            <Switch checked={s.in_contents} onCheckedChange={(v) => toggle(a, i, v)} aria-label={`Show ${displayTitle(b, s, a === 'Body' ? n[i] : null)} in contents`} />
          </li>
        ))}
      </ul>
    </div>
  )
}
