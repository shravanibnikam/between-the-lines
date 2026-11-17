// ProseMirror decorations for the editor: misspelled words (wavy underline) and the block
// holding the caret (kept bright when "Dim" is on).
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const spellKey = new PluginKey<DecorationSet>('spell')

/** Word ranges as core/src/spell.rs `words` finds them (inner ' ’ - joined to a following letter). */
export function wordSpans(text: string): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const inner = (c === "'" || c === '’' || c === '-') && start >= 0 && /\p{L}/u.test(text[i + 1] ?? '')
    if (/[\p{L}0-9]/u.test(c) || inner) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  if (start >= 0) out.push([start, text.length])
  return out
}

function spellDecorations(doc: PMNode, words: Set<string>): DecorationSet {
  if (!words.size) return DecorationSet.empty
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Textblocks here hold only text, so offsets in textContent are document offsets.
    const text = node.textContent
    for (const [s, e] of wordSpans(text)) {
      const w = text.slice(s, e)
      if (words.has(w)) decos.push(Decoration.inline(pos + 1 + s, pos + 1 + e, { class: 'spell-error', 'data-word': w }))
    }
    return false
  })
  return DecorationSet.create(doc, decos)
}

/** `words()` is read whenever the doc changes or a transaction carries the spellKey meta. */
export const WriteDecorations = Extension.create<{ words: () => Set<string> }>({
  name: 'writeDecorations',
  addOptions: () => ({ words: () => new Set<string>() }),
  addProseMirrorPlugins() {
    const words = this.options.words
    return [
      new Plugin<DecorationSet>({
        key: spellKey,
        state: {
          init: (_, s) => spellDecorations(s.doc, words()),
          apply: (tr, old, _, s) => (tr.docChanged || tr.getMeta(spellKey) ? spellDecorations(s.doc, words()) : old),
        },
        props: { decorations: (s) => spellKey.getState(s) },
      }),
      new Plugin({
        props: {
          decorations(s) {
            const $h = s.selection.$head
            if ($h.depth < 1) return null
            return DecorationSet.create(s.doc, [Decoration.node($h.before(1), $h.after(1), { class: 'is-current' })])
          },
        },
      }),
    ]
  },
})
