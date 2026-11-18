import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wordSpans } from './plugins.ts'

const words = (s: string) => wordSpans(s).map(([a, b]) => s.slice(a, b))

test('wordSpans splits on spaces and punctuation, with offsets', () => {
  assert.deepEqual(wordSpans('Hi, you'), [[0, 2], [4, 7]])
  assert.deepEqual(words('  one   two '), ['one', 'two'])
  assert.deepEqual(wordSpans(''), [])
  assert.deepEqual(words('...'), [])
})

test('wordSpans keeps inner apostrophes and hyphens only when a letter follows', () => {
  assert.deepEqual(words("don't well-known it’s"), ["don't", 'well-known', 'it’s'])
  assert.deepEqual(words("dogs' -start end-"), ['dogs', 'start', 'end'])
  assert.deepEqual(words("rock'n'roll"), ["rock'n'roll"])
  assert.deepEqual(words('a--b'), ['a', 'b'])
})

test('wordSpans treats digits and non-Latin letters as word characters', () => {
  assert.deepEqual(words('café 42 naïve 李雷'), ['café', '42', 'naïve', '李雷'])
})
