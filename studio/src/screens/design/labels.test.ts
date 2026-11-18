import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inches } from './labels.ts'

test('inches: 6 or 5.5, never 6.00; rounds to two places', () => {
  assert.equal(inches(6), '6')
  assert.equal(inches(5.5), '5.5')
  assert.equal(inches(5.125), '5.13')
  assert.equal(inches(0.004), '0')
})
