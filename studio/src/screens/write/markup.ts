// The book's line format (core/src/markup.rs) <-> TipTap JSON. Pure: no DOM, no React, so the
// self-check can run under `node --experimental-strip-types`.
//
// Saving relies on how parse_inline reads markers: `\x` is always literal x, `**` toggles bold,
// a single `*` toggles italic, and a run of three stars is read as `**` then `*`. Both toggles
// commute, so `***` at a boundary that changes both marks is unambiguous. Every literal `*`, `_`
// and `\` is escaped, so every unescaped star is ours and always has a closer later in the line.
import type { Block, Span } from '../../lib/types'

export interface PMMark { type: string }
export interface PMNode { type: string; text?: string; marks?: PMMark[]; attrs?: Record<string, unknown>; content?: PMNode[] }

/** Mirrors markup.rs `is_scene_break`. */
export function isSceneBreak(line: string): boolean {
  const t = line.replace(/\s/g, '')
  return ['***', '#', '~', '⁂', '---', '* * *', '***.', '◆', '§'].includes(t) || (t.length >= 3 && /^\*+$/.test(t))
}

const escapeText = (s: string) => s.replace(/\n/g, ' ').replace(/[\\*_]/g, (c) => '\\' + c)

function inline(nodes: PMNode[] | undefined): string {
  const runs = (nodes ?? []).filter((n) => n.type === 'text' && n.text).map((n) => ({
    text: n.text!, b: !!n.marks?.some((m) => m.type === 'bold'), i: !!n.marks?.some((m) => m.type === 'italic'),
  }))
  // parse_inline looks for an italic closer by pairing stars without regard to escapes, so an
  // italic run holding a literal `*` uses `_` instead, unless `_` would sit inside a word (where
  // the parser keeps it literal). Known limit: an italic run that is both inside a word and ends in a
  // literal `*` can't be written; port parse_inline here and try both markers if that ever matters.
  const marker: string[] = []
  const alnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)
  for (let k = 0; k < runs.length; ) {
    let e = k
    while (e < runs.length && runs[e].i === runs[k].i) e++
    const midWord = (a: number, b: number) => runs[a] && runs[b] && runs[a].b === runs[b].b && alnum(runs[a].text.at(-1)) && alnum(runs[b].text[0])
    const underscoreOk = !midWord(k - 1, k) && !midWord(e - 1, e)
    const m = underscoreOk && runs.slice(k, e).some((r) => r.text.includes('*')) ? '_' : '*'
    for (let j = k; j < e; j++) marker[j] = m
    k = e
  }
  let out = ''
  let bold = false
  let italic = false
  let m = '*'
  runs.forEach((r, k) => {
    if (r.b !== bold) out += '**'
    if (r.i !== italic) out += r.i ? marker[k] : m
    if (r.i) m = marker[k]
    bold = r.b
    italic = r.i
    out += escapeText(r.text)
  })
  if (bold) out += '**'
  if (italic) out += m
  return out.trim()
}

/** A paragraph line that would read as a heading, quote or scene break gets a leading `\`. */
const guardPara = (line: string) => (/^#{1,3} /.test(line) || line.startsWith('>') || isSceneBreak(line) ? '\\' + line : line)

function blockLines(n: PMNode, out: string[]) {
  switch (n.type) {
    case 'paragraph': {
      const s = inline(n.content)
      if (s) out.push(guardPara(s))
      break
    }
    case 'heading': {
      const s = inline(n.content)
      if (s) out.push((n.attrs?.level === 3 ? '### ' : '## ') + s)
      break
    }
    case 'blockquote':
      for (const c of n.content ?? []) {
        if (c.type === 'paragraph') {
          const s = inline(c.content)
          if (s) out.push('> ' + s)
        } else blockLines(c, out)
      }
      break
    case 'horizontalRule':
      out.push('***')
      break
    default:
      for (const c of n.content ?? []) blockLines(c, out)
  }
}

/** TipTap document -> the section's text (one block per line). */
export function toLines(doc: PMNode): string {
  const out: string[] = []
  blockLines(doc, out)
  return out.join('\n')
}

const textNodes = (spans: Span[]): PMNode[] =>
  spans.filter((s) => s.text).map((s) => {
    const marks: PMMark[] = []
    if (s.bold) marks.push({ type: 'bold' })
    if (s.italic) marks.push({ type: 'italic' })
    return marks.length ? { type: 'text', text: s.text, marks } : { type: 'text', text: s.text }
  })

const para = (spans: Span[]): PMNode => {
  const content = textNodes(spans)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

/** Parsed blocks (api.markupBlocks) -> TipTap document. Consecutive quote lines share one blockquote. */
export function fromBlocks(blocks: Block[]): PMNode {
  const content: PMNode[] = []
  for (const b of blocks) {
    if (b.type === 'Para') content.push(para(b.spans))
    else if (b.type === 'Heading') {
      const c = textNodes(b.spans)
      content.push({ type: 'heading', attrs: { level: b.level === 3 ? 3 : 2 }, ...(c.length ? { content: c } : {}) })
    } else if (b.type === 'SceneBreak') content.push({ type: 'horizontalRule' })
    else {
      const last = content[content.length - 1]
      if (last?.type === 'blockquote') last.content!.push(para(b.spans))
      else content.push({ type: 'blockquote', content: [para(b.spans)] })
    }
  }
  if (!content.length) content.push({ type: 'paragraph' })
  return { type: 'doc', content }
}

// ---- dev-only self-check ----------------------------------------------------------------

type Parse = (text: string) => Promise<Block[]>
const t = (text: string, ...marks: ('bold' | 'italic')[]): PMNode => (marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text })
const p = (...c: PMNode[]): PMNode => ({ type: 'paragraph', content: c })

/** Documents whose text must survive toLines -> parse -> fromBlocks exactly. */
const CASES: PMNode[] = [
  { type: 'doc', content: [p(t('plain'), t('bold', 'bold'), t(' and '), t('it', 'italic'), t('both', 'bold', 'italic'))] },
  { type: 'doc', content: [p(t('a', 'italic'), t('b', 'bold'), t('c', 'italic'), t('d'))] },
  { type: 'doc', content: [p(t('a', 'bold'), t('b', 'bold', 'italic'), t('c', 'italic'))] },
  { type: 'doc', content: [p(t('mid'), t('wo', 'italic'), t('rd'), t('x', 'bold'), t('y', 'italic'))] },
  { type: 'doc', content: [p(t('stars * and ** and *** and _under_ snake_case \\ back\\slash *'))] },
  { type: 'doc', content: [p(t('*', 'italic'), t('_', 'bold'), t('\\', 'bold', 'italic'))] },
  { type: 'doc', content: [p(t('# not a heading')), p(t('## nor this')), p(t('> not a quote')), p(t('#')), p(t('---')), p(t('- - -')), p(t('~')), p(t('§')), p(t('⁂')), p(t('***'))] },
  { type: 'doc', content: [p(t('#hashtag stays')), p(t('a > b'))] },
  { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [t('Sub '), t('head', 'italic')] }, { type: 'heading', attrs: { level: 3 }, content: [t('# minor')] }] },
  { type: 'doc', content: [{ type: 'blockquote', content: [p(t('> quoted')), p(t('two', 'bold'))] }, { type: 'horizontalRule' }, p(t('after'))] },
  { type: 'doc', content: [p(t('x'), t('a*b', 'italic'), t(' y')), p(t('a*', 'bold', 'italic'), t('b', 'bold'), t('c')), p(t('pre'), t('*', 'italic'), t('post'))] },
  { type: 'doc', content: [p(t('"Quotes," she said -- it\'s... fine.'))] },
]

/** Normalised texts that must come back unchanged from parse -> fromBlocks -> toLines. */
const TEXTS = [
  'One.\nTwo *italic* and **bold** and ***both***.\n***\n## Sub\n### Minor\n> A quote\n> Second line',
  'Literal \\* star and \\_ under and \\\\ slash.\n\\# not heading\n\\> not quote\n\\---',
]

export async function selfCheck(parse: Parse): Promise<string[]> {
  const fails: string[] = []
  for (const doc of CASES) {
    const lines = toLines(doc)
    const back = fromBlocks(await parse(lines))
    if (JSON.stringify(back) !== JSON.stringify(doc)) fails.push(`doc: ${JSON.stringify(lines)}\n  got  ${JSON.stringify(back)}\n  want ${JSON.stringify(doc)}`)
  }
  for (const text of TEXTS) {
    const once = toLines(fromBlocks(await parse(text)))
    if (once !== text) fails.push(`text: ${JSON.stringify(text)}\n  got ${JSON.stringify(once)}`)
  }
  return fails
}
