import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strokeFor, voice, weight } from './keysound.ts'

const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean } = {}) =>
  strokeFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...mods })

test('each kind of key makes its own sound, and keys that type nothing are silent', () => {
  assert.equal(key('a'), 'type')
  assert.equal(key('Q'), 'type')
  assert.equal(key('é'), 'type')
  assert.equal(key('.'), 'type')
  assert.equal(key(' '), 'space')
  assert.equal(key('Enter'), 'return')
  assert.equal(key('Backspace'), 'back')
  assert.equal(key('Delete'), 'back')
  for (const k of ['Shift', 'ArrowLeft', 'Tab', 'Escape', 'Dead', 'F5', 'Unidentified']) assert.equal(key(k), null, k)
  assert.equal(key('s', { ctrlKey: true }), null) // Ctrl+S saves, it doesn't type
  assert.equal(key('b', { metaKey: true }), null)
  assert.equal(key('@', { ctrlKey: true, altKey: true }), 'type') // AltGr on Windows
  assert.equal(key('a', { isComposing: true }), null)
})

test('a key always has the same voice, and different keys sound different', () => {
  assert.deepEqual(voice('KeyA'), voice('KeyA'))
  const voices = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'].map((c) => JSON.stringify(voice(c)))
  assert.equal(new Set(voices).size, voices.length)
  for (const v of Object.values(voice('KeyQ'))) assert.ok(v >= 0 && v <= 1)
})

test('capitals strike harder and small marks lighter', () => {
  assert.ok(weight('A') > weight('a'))
  assert.ok(weight('.') < weight('a'))
  assert.equal(weight('7'), 1)
})
