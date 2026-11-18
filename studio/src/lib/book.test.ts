// Pure-logic tests; run with `npm test` (Node strips the types, no extra tooling).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Book, Section } from './types.ts'
import {
  area, bookWords, countWords, displayTitle, findSection, fmt, hasBody, newSection, numberLabel, numbers, numberWords, roman, timeAgo,
} from './book.ts'

const sec = (id: string, kind: Section['kind'], title = '', text = ''): Section => ({ ...newSection(kind, title), id, text })

const book = {
  front: [sec('f1', 'Dedication', '', 'For you')],
  body: [sec('p', 'Prologue'), sec('c1', 'Chapter', '', 'one two'), sec('part', 'Part'), sec('c2', 'Chapter', 'Named')],
  back: [sec('b1', 'Afterword', '', 'three')],
  restart_numbers_each_part: true,
  style: { number_format: 'LabelWord' },
  terms: { chapter: 'Chapter', part: 'Part', prologue: 'Prologue', epilogue: 'Epilogue' },
} as unknown as Book

test('countWords ignores punctuation-only tokens and splits on dashes', () => {
  assert.equal(countWords('Hello, world — and… 42 ---'), 4)
  assert.equal(countWords('well—known'), 2)
  assert.equal(countWords('   '), 0)
})

test('bookWords sums every area', () => {
  assert.equal(bookWords(book), 2 + 1 + 2)
})

test('roman and numberWords', () => {
  assert.equal(roman(1994), 'MCMXCIV')
  assert.equal(numberWords(21), 'Twenty-One')
  assert.equal(numberWords(105), 'One Hundred and Five')
})

test('numbers: chapters count up, restart after a part when asked, prologue has none', () => {
  assert.deepEqual(numbers(book), [null, 1, 1, 1])
  assert.deepEqual(numbers({ ...book, restart_numbers_each_part: false } as Book), [null, 1, 1, 2])
})

test('numberLabel follows the number format', () => {
  assert.equal(numberLabel(book, book.body[1], 1), 'Chapter One')
  assert.equal(numberLabel(book, book.body[2], 1), 'Part One')
  assert.equal(numberLabel({ ...book, style: { number_format: 'Roman' } } as Book, book.body[1], 4), 'IV')
})

test('displayTitle prefers the title, then the label', () => {
  assert.equal(displayTitle(book, book.body[3], 2), 'Named')
  assert.equal(displayTitle(book, book.body[1], 1), 'Chapter One')
  assert.equal(displayTitle(book, book.front[0], null), 'Dedication')
})

test('findSection and area look across front, body and back', () => {
  assert.equal(findSection(book, 'b1')?.kind, 'Afterword')
  assert.equal(findSection(book, 'nope'), undefined)
  assert.equal(area(book, 'Front').length, 1)
})

test('timeAgo buckets', () => {
  const now = 1_000_000
  assert.equal(timeAgo(now - 5, now), 'just now')
  assert.equal(timeAgo(now - 300, now), '5 min ago')
  assert.equal(timeAgo(now - 7200, now), '2 h ago')
  assert.equal(timeAgo(now - 90_000, now), 'yesterday')
  assert.equal(timeAgo(now - 86400 * 5, now), '5 days ago')
})

test('timeAgo: bucket edges, clock skew, and old dates fall through to a calendar date', () => {
  const now = 1_000_000_000
  assert.equal(timeAgo(now + 100, now), 'just now')
  assert.equal(timeAgo(now - 60, now), '1 min ago')
  assert.equal(timeAgo(now - 3600, now), '1 h ago')
  assert.equal(timeAgo(now - 86400, now), 'yesterday')
  assert.equal(timeAgo(now - 86400 * 2, now), '2 days ago')
  assert.match(timeAgo(now - 86400 * 40, now), /\d{4}/)
})

test('roman and numberWords edges', () => {
  assert.equal(roman(0), '0')
  assert.equal(roman(-3), '-3')
  assert.equal(roman(4), 'IV')
  assert.equal(roman(3999), 'MMMCMXCIX')
  assert.equal(numberWords(0), 'Zero')
  assert.equal(numberWords(19), 'Nineteen')
  assert.equal(numberWords(20), 'Twenty')
  assert.equal(numberWords(100), 'One Hundred')
  assert.equal(numberWords(999), 'Nine Hundred and Ninety-Nine')
  assert.equal(numberWords(1000), '1000')
})

test('numberLabel: every format for chapters, parts follow the format family, other kinds ignore it', () => {
  const withFormat = (number_format: string) => ({ ...book, style: { number_format } }) as unknown as Book
  const ch = book.body[1]
  const part = book.body[2]
  const cases: [string, string, string][] = [
    ['LabelArabic', 'Chapter 3', 'Part 3'], ['LabelWord', 'Chapter Three', 'Part Three'], ['LabelRoman', 'Chapter III', 'Part III'],
    ['Arabic', '3', 'Part 3'], ['Word', 'Three', 'Part Three'], ['Roman', 'III', 'Part III'],
  ]
  for (const [f, chapter, partLabel] of cases) {
    assert.equal(numberLabel(withFormat(f), ch, 3), chapter, f)
    assert.equal(numberLabel(withFormat(f), part, 3), partLabel, f)
  }
  assert.equal(numberLabel(book, book.body[0], null), 'Prologue')
  assert.equal(numberLabel(book, book.back[0], null), 'Afterword')
  assert.equal(numberLabel(book, ch, null), 'Chapter One') // a missing number falls back to 1
})

test('displayTitle trims a title, and a blank one falls back to the label', () => {
  assert.equal(displayTitle(book, { ...book.body[1], title: '  Padded  ' }, 1), 'Padded')
  assert.equal(displayTitle(book, { ...book.body[1], title: '   ' }, 2), 'Chapter Two')
  assert.equal(displayTitle(book, book.body[0], null), 'Prologue')
})

test('numbers: parts are numbered; epilogues have none', () => {
  const b = { ...book, body: [sec('a', 'Part'), sec('b', 'Chapter'), sec('c', 'Part'), sec('d', 'Chapter'), sec('e', 'Epilogue')] } as Book
  assert.deepEqual(numbers(b), [1, 1, 2, 1, null])
})

test('countWords edges, hasBody, fmt, newSection', () => {
  assert.equal(countWords(''), 0)
  assert.equal(countWords("don't stop—go"), 3)
  assert.equal(countWords('café ñandú'), 2)
  assert.ok(!hasBody('TitlePage') && !hasBody('Contents') && hasBody('Chapter'))
  assert.equal(fmt(1234567), '1,234,567')
  assert.equal(newSection('Dedication').in_contents, false)
  assert.equal(newSection('Chapter').in_contents, true)
  assert.notEqual(newSection('Chapter').id, '')
})
