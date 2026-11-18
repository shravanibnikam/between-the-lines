import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isbnValid } from './isbn.ts'

test('ISBN-13 checksum, with hyphens', () => {
  assert.ok(isbnValid('978-0-306-40615-7'))
  assert.ok(!isbnValid('978-0-306-40615-8'))
})

test('ISBN-10 checksum, and X only as the last character', () => {
  assert.ok(isbnValid('0-306-40615-2'))
  assert.ok(isbnValid('0-8044-2957-X'))
  assert.ok(isbnValid('0-8044-2957-x'))
  assert.ok(!isbnValid('X-306-40615-2'))
})

test('rejects empty and wrong-length input; spaces are ignored', () => {
  assert.ok(!isbnValid(''))
  assert.ok(!isbnValid('978030640615'))
  assert.ok(!isbnValid('978030640615X'))
  assert.ok(isbnValid('978 0 306 40615 7'))
})
