import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Block, Span } from '../../lib/types.ts'
import { fromBlocks, isSceneBreak, toLines, type PMNode } from './markup.ts'

// ---- a port of core/src/markup.rs (parse_blocks + parse_inline, smart quotes off) ----------
// The real parser lives in Rust; round-trips need one, so this mirrors it line for line.

function hasClosing(chars: string[], from: number, marker: string): boolean {
  const alnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)
  for (let i = from; i + marker.length <= chars.length; i++) {
    if (chars.slice(i, i + marker.length).join('') !== marker) continue
    if (marker === '*' && chars[i + 1] === '*') { i++; continue } // `*` must not start `**`
    if (marker === '_' && i > 0 && alnum(chars[i - 1]) && alnum(chars[i + 1])) continue
    return i > from
  }
  return false
}

function parseInline(s: string): Span[] {
  const chars = [...s]
  const spans: Span[] = []
  let bold = false
  let italic = false
  let cur = ''
  const push = () => { if (cur) spans.push({ text: cur, bold, italic }); cur = '' }
  const alnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)
  for (let i = 0; i < chars.length; ) {
    const c = chars[i]
    if (c === '\\' && i + 1 < chars.length) { cur += chars[i + 1]; i += 2; continue }
    if (c === '*' && chars[i + 1] === '*') {
      if (bold || hasClosing(chars, i + 2, '**')) { push(); bold = !bold; i += 2; continue }
    } else if (c === '*' || c === '_') {
      const insideWord = c === '_' && i > 0 && alnum(chars[i - 1]) && alnum(chars[i + 1])
      if (!insideWord && (italic || hasClosing(chars, i + 1, c))) { push(); italic = !italic; i++; continue }
    }
    cur += c
    i++
  }
  push()
  return spans
}

function parseBlocks(text: string): Block[] {
  const out: Block[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let rest: string | undefined
    if (isSceneBreak(line)) out.push({ type: 'SceneBreak' })
    else if (line.startsWith('### ')) out.push({ type: 'Heading', level: 3, spans: parseInline(line.slice(4)) })
    else if (line.startsWith('## ')) out.push({ type: 'Heading', level: 2, spans: parseInline(line.slice(3)) })
    else if (line.startsWith('# ')) out.push({ type: 'Heading', level: 2, spans: parseInline(line.slice(2)) })
    else if ((rest = line.startsWith('>') ? line.slice(1).trimStart() : undefined) !== undefined) out.push({ type: 'Quote', spans: parseInline(rest) })
    else out.push({ type: 'Para', spans: parseInline(line) })
  }
  return out
}

// ---- builders --------------------------------------------------------------------------

const t = (text: string, ...marks: ('bold' | 'italic')[]): PMNode =>
  (marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text })
const p = (...c: PMNode[]): PMNode => ({ type: 'paragraph', content: c })
const doc = (...c: PMNode[]): PMNode => ({ type: 'doc', content: c })
const h = (level: number, ...c: PMNode[]): PMNode => ({ type: 'heading', attrs: { level }, content: c })

/** doc -> line format -> parse -> doc */
const roundTrip = (d: PMNode) => fromBlocks(parseBlocks(toLines(d)))
const same = (d: PMNode) => assert.deepEqual(roundTrip(d), d, JSON.stringify(toLines(d)))

test('the port parses what the Rust tests expect (sanity for the helper)', () => {
  assert.deepEqual(parseInline('a *b* **c** d_e_f'), [
    { text: 'a ', bold: false, italic: false }, { text: 'b', bold: false, italic: true }, { text: ' ', bold: false, italic: false },
    { text: 'c', bold: true, italic: false }, { text: ' d_e_f', bold: false, italic: false },
  ])
  assert.ok(parseInline('the variable _count and max_value').every((s) => !s.italic))
})

// ---- inline marks ----------------------------------------------------------------------

test('toLines writes bold, italic and bold-italic', () => {
  assert.equal(toLines(doc(p(t('a'), t('b', 'bold'), t(' '), t('c', 'italic'), t(' '), t('d', 'bold', 'italic')))), 'a**b** *c* ***d***')
})

test('marks round-trip: plain, bold, italic, both', () => {
  same(doc(p(t('plain'), t('bold', 'bold'), t(' and '), t('it', 'italic'), t('both', 'bold', 'italic'))))
  same(doc(p(t('both', 'bold', 'italic'))))
})

test('adjacent and nested marks round-trip, including where both toggles change at once', () => {
  same(doc(p(t('a', 'italic'), t('b', 'bold'), t('c', 'italic'), t('d'))))
  same(doc(p(t('a', 'bold'), t('b', 'bold', 'italic'), t('c', 'italic'))))
  same(doc(p(t('a', 'italic'), t('b', 'bold', 'italic'), t('c', 'bold'))))
  same(doc(p(t('a', 'bold', 'italic'), t('b'), t('c', 'bold', 'italic'))))
})

test('marks inside a word round-trip', () => {
  same(doc(p(t('mid'), t('wo', 'italic'), t('rd'), t('x', 'bold'), t('y', 'italic'))))
})

test('literal * _ and \\ are escaped and survive', () => {
  assert.equal(toLines(doc(p(t('a*b_c\\d')))), 'a\\*b\\_c\\\\d')
  same(doc(p(t('stars * and ** and *** and _under_ snake_case \\ back\\slash *'))))
  same(doc(p(t('*', 'italic'), t('_', 'bold'), t('\\', 'bold', 'italic'))))
})

test('underscores inside words stay literal both ways', () => {
  assert.equal(toLines(doc(p(t('snake_case')))), 'snake\\_case')
  same(doc(p(t('snake_case and max_value'))))
  same(doc(p(t('a_b', 'italic'))))
  assert.deepEqual(parseInline('snake_case'), [{ text: 'snake_case', bold: false, italic: false }]) // unescaped, as typed by hand
})

test('italic holding a literal star switches to _ so the star is not read as a closer', () => {
  assert.equal(toLines(doc(p(t('a*b', 'italic')))), '_a\\*b_')
  same(doc(p(t('x'), t('a*b', 'italic'), t(' y')), p(t('a*', 'bold', 'italic'), t('b', 'bold'), t('c')), p(t('pre'), t('*', 'italic'), t('post'))))
})

test('KNOWN LIMIT: an italic run inside a word that holds a literal * cannot be written (documented in markup.ts)', () => {
  // `_` would sit inside a word and stay literal, so `*` is used and the parser mis-pairs the escaped star.
  const d = doc(p(t('a'), t('b*', 'italic'), t('c')))
  assert.equal(toLines(d), 'a*b\\**c')
  assert.notDeepEqual(roundTrip(d), d)
})

test('text newlines become spaces and edges are trimmed', () => {
  assert.equal(toLines(doc(p(t('one\ntwo')))), 'one two')
  assert.equal(toLines(doc(p(t('  padded  ')))), 'padded')
})

test('non-text inline nodes and empty text nodes are ignored', () => {
  assert.equal(toLines(doc(p(t('a'), { type: 'hardBreak' }, { type: 'text', text: '' }, t('b')))), 'ab')
})

// ---- guards ----------------------------------------------------------------------------

test('paragraphs that would read as heading, quote or scene break get a leading backslash', () => {
  assert.equal(toLines(doc(p(t('# x')))), '\\# x')
  assert.equal(toLines(doc(p(t('> x')))), '\\> x')
  assert.equal(toLines(doc(p(t('---')))), '\\---')
  assert.equal(toLines(doc(p(t('***')))), '\\*\\*\\*') // escaped stars already stop it reading as a break, so no extra guard
  for (const s of ['# not a heading', '## nor this', '### or this', '> not a quote', '#', '---', '- - -', '~', '§', '⁂', '***', '* * *', '◆', '***.', '****']) {
    same(doc(p(t(s))))
  }
})

test('text that merely looks close to a heading, quote or break is left alone', () => {
  assert.equal(toLines(doc(p(t('#hashtag stays')), p(t('a > b')), p(t('#### four')), p(t('--')))), '#hashtag stays\na > b\n#### four\n--')
  same(doc(p(t('#hashtag stays')), p(t('a > b')), p(t('--')), p(t('#### four'))))
})

test('a heading or quote whose text starts like markup is not guarded and still round-trips', () => {
  same(doc(h(3, t('# minor'))))
  same(doc({ type: 'blockquote', content: [p(t('> quoted')), p(t('---'))] }))
})

// ---- scene breaks ----------------------------------------------------------------------

test('isSceneBreak mirrors is_scene_break in core/src/markup.rs', () => {
  for (const s of ['***', '#', '~', '⁂', '---', '* * *', '***.', '◆', '§', '****', '*****', '* * * *', '  ***  ', '- - -', ' # ', '*\t*\t*', '* * *.'])
    assert.ok(isSceneBreak(s), JSON.stringify(s))
  for (const s of ['', ' ', '*', '**', '* *', '--', '- -', '##', '# Heading', '***a', '___', '***..', 'x ***', '. . .', '#hashtag', '~~'])
    assert.ok(!isSceneBreak(s), JSON.stringify(s))
})

test('horizontal rules write ***, and every break variant parses back to one', () => {
  assert.equal(toLines(doc(p(t('a')), { type: 'horizontalRule' }, p(t('b')))), 'a\n***\nb')
  same(doc(p(t('a')), { type: 'horizontalRule' }, p(t('b'))))
  for (const s of ['***', '#', '~', '⁂', '---', '* * *', '***.', '◆', '§', '*****', '  ~  '])
    assert.deepEqual(fromBlocks(parseBlocks(s)), doc({ type: 'horizontalRule' }), s)
})

// ---- empty and structural nodes --------------------------------------------------------

test('empty and whitespace-only paragraphs and headings write nothing', () => {
  assert.equal(toLines(doc({ type: 'paragraph' }, p(t('   ')), h(2), h(3, t(' ')), p(t('kept')))), 'kept')
  assert.equal(toLines(doc({ type: 'paragraph' })), '')
  assert.equal(toLines(doc({ type: 'blockquote', content: [{ type: 'paragraph' }] })), '')
})

test('an empty parse gives a document with one empty paragraph; empty spans give no content', () => {
  assert.deepEqual(fromBlocks([]), doc({ type: 'paragraph' }))
  assert.deepEqual(fromBlocks([{ type: 'Para', spans: [] }]), doc({ type: 'paragraph' }))
  assert.deepEqual(fromBlocks([{ type: 'Para', spans: [{ text: '', bold: true, italic: false }] }]), doc({ type: 'paragraph' }))
  assert.deepEqual(fromBlocks([{ type: 'Heading', level: 2, spans: [] }]), doc({ type: 'heading', attrs: { level: 2 } }))
})

test('heading levels: 3 stays ### and anything else is ##', () => {
  assert.equal(toLines(doc(h(2, t('A')), h(3, t('B')), h(1, t('C')), { type: 'heading', content: [t('D')] })), '## A\n### B\n## C\n## D')
  assert.deepEqual(fromBlocks([{ type: 'Heading', level: 1, spans: [] }]).content![0].attrs, { level: 2 })
  assert.deepEqual(fromBlocks([{ type: 'Heading', level: 3, spans: [] }]).content![0].attrs, { level: 3 })
  same(doc(h(2, t('Sub '), t('head', 'italic')), h(3, t('Minor'))))
  assert.deepEqual(parseBlocks('# Old style'), [{ type: 'Heading', level: 2, spans: [{ text: 'Old style', bold: false, italic: false }] }])
})

test('consecutive quote lines share one blockquote; a paragraph between splits it', () => {
  const q = (s: string): Block => ({ type: 'Quote', spans: [{ text: s, bold: false, italic: false }] })
  const para: Block = { type: 'Para', spans: [{ text: 'x', bold: false, italic: false }] }
  assert.equal(fromBlocks([q('a'), q('b'), para, q('c')]).content!.map((n) => n.type + ':' + (n.content?.length ?? 0)).join(' '), 'blockquote:2 paragraph:1 blockquote:1')
  same(doc({ type: 'blockquote', content: [p(t('one')), p(t('two', 'bold'))] }, { type: 'horizontalRule' }, p(t('after'))))
})

test('unknown wrapper nodes are flattened to their blocks', () => {
  const list = { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one'))] }, { type: 'listItem', content: [p(t('two'))] }] }
  assert.equal(toLines(doc(list)), 'one\ntwo')
  assert.equal(toLines(doc({ type: 'blockquote', content: [{ type: 'blockquote', content: [p(t('deep'))] }] })), '> deep')
})

// ---- whole texts -----------------------------------------------------------------------

test('normalised texts survive parse -> fromBlocks -> toLines unchanged', () => {
  for (const text of [
    'One.\nTwo *italic* and **bold** and ***both***.\n***\n## Sub\n### Minor\n> A quote\n> Second line',
    'Literal \\* star and \\_ under and \\\\ slash.\n\\# not heading\n\\> not quote\n\\---',
  ]) assert.equal(toLines(fromBlocks(parseBlocks(text))), text)
})

test('a full chapter with every feature round-trips', () => {
  same(doc(
    h(2, t('Chapter')), p(t('She said '), t('no', 'italic'), t(', **really**? '), t('Yes', 'bold')),
    { type: 'horizontalRule' }, { type: 'blockquote', content: [p(t('Quote ', 'italic'), t('here'))] }, p(t('# fin')),
  ))
})

// ---- syntaxes reserved for upcoming features pass through untouched ---------------------

test('table, footnote and image lines are written exactly as typed and read back as plain paragraphs', () => {
  for (const line of ['| a | b |', '|---|---|', '[^1]', '[^1]: note', '![cap](map.png)']) {
    assert.equal(toLines(doc(p(t(line)))), line, line)
    assert.deepEqual(parseBlocks(line), [{ type: 'Para', spans: [{ text: line, bold: false, italic: false }] }], line)
    assert.equal(toLines(fromBlocks(parseBlocks(line))), line, line)
    same(doc(p(t(line))))
  }
  assert.equal(toLines(doc(p(t('| a | b |')), p(t('|---|---|')), p(t('| 1 | 2 |')))), '| a | b |\n|---|---|\n| 1 | 2 |')
})
