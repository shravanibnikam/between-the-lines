import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spreadCount, spreadLabel, spreadOf, spreadPages } from './pages.ts'

test('the first page sits alone on the right; later spreads pair verso and recto', () => {
  assert.deepEqual(spreadPages(10, 0), [null, 0])
  assert.deepEqual(spreadPages(10, 1), [1, 2])
  assert.deepEqual(spreadPages(10, 5), [9, null]) // odd tail: a lone left page
  assert.deepEqual(spreadPages(0, 0), [null, null])
})

test('spreadCount and spreadOf agree', () => {
  assert.equal(spreadCount(10), 6)
  assert.equal(spreadOf(0), 0)
  assert.equal(spreadOf(1), 1)
  assert.equal(spreadOf(2), 1)
  assert.equal(spreadOf(9), spreadCount(10) - 1)
})

test('spreadLabel counts physical pages from one', () => {
  assert.equal(spreadLabel(10, 0), 'Page 1')
  assert.equal(spreadLabel(10, 2), 'Pages 4–5')
  assert.equal(spreadLabel(0, 0), 'No pages')
})
