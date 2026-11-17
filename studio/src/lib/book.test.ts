// Pure-logic tests; run with `npm test` (Node strips the types, no extra tooling).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Book, Section } from './types.ts'
import {
  area, bookWords, countWords, displayTitle, findSection, newSection, numberLabel, numbers, numberWords, roman, timeAgo,
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
