import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mentions, namesOf } from './mentions.ts'

test('whole words only, case-sensitive; overlapping names count once', () => {
  assert.equal(mentions('Nell Avery met Nellie. Nell! nell', ['Nell Avery', 'Nell']), 2)
  assert.equal(mentions('Nell Avery smiled', ['Nell Avery', 'Nell']), 1)
  assert.equal(mentions('Ann and Annie', ['Ann']), 1)
})

test('punctuation and string ends are word boundaries; digits and accents are word characters', () => {
  assert.equal(mentions('Ann', ['Ann']), 1)
  assert.equal(mentions('"Ann," said Ann.', ['Ann']), 2)
  assert.equal(mentions('Ann2 Anné', ['Ann']), 0)
  assert.equal(mentions('', ['Ann']), 0)
  assert.equal(mentions('Ann', []), 0)
})

test('namesOf: name plus trimmed aliases, dropping ones under two characters', () => {
  assert.deepEqual(namesOf({ name: 'Eleanor', aliases: ' Nell , N,, Ellie ' }), ['Eleanor', 'Nell', 'Ellie'])
  assert.deepEqual(namesOf({ name: 'X', aliases: '' }), [])
  assert.deepEqual(namesOf({ name: '李雷', aliases: '' }), ['李雷'])
})
