// Typewriter key sounds, played from recordings of a real mechanical typewriter (sounds/README.md).
// Each kind of key plays its own part of the machine, and every physical key keeps its own strike
// and pitch, taken from its code, so the same key always sounds like itself.

export type Stroke = 'type' | 'space' | 'return' | 'back'

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>

/** The sound a keydown makes, or null for keys that don't type (arrows, Tab, shortcuts, IME input). */
export function strokeFor(e: KeyInfo): Stroke | null {
  if (e.isComposing || e.metaKey || (e.ctrlKey && !e.altKey)) return null // Ctrl+Alt is AltGr on Windows
  if (e.key === 'Enter') return 'return'
  if (e.key === 'Backspace' || e.key === 'Delete') return 'back'
  if (e.key === ' ') return 'space'
  return [...e.key].length === 1 ? 'type' : null
}

/** A physical key's own voice (0..1 each): its pitch, which strike it makes and which release. */
export function voice(code: string): { pitch: number; strike: number; release: number } {
  let h = 2166136261 // FNV-1a
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619)
  // murmur3's final mix: codes differ only in their last letter ("KeyA", "KeyB"), which FNV
  // alone barely spreads into the upper bytes
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  const byte = (n: number) => ((h >>> (8 * n)) & 0xff) / 255
  return { pitch: byte(0), strike: byte(1), release: byte(2) }
}

/** How hard the typebar lands: a capital shifts the whole type basket, small marks barely touch the paper. */
export function weight(key: string): number {
  if (key !== key.toLowerCase()) return 1.25
  return ".,'`:;-".includes(key) ? 0.65 : 1
}

/** Where each sound sits in sounds/typewriter.wav: [start, length] in seconds. */
const STRIKES: [number, number][] = [[0, 0.164], [0.194, 0.164], [0.388, 0.164], [0.582, 0.164], [0.776, 0.164],
  [0.97, 0.164], [1.164, 0.164], [1.358, 0.164], [1.552, 0.164], [1.7459, 0.164]]
const RELEASES: [number, number][] = [[1.9399, 0.124], [2.0939, 0.124], [2.2479, 0.124], [2.4019, 0.124],
  [2.5559, 0.124], [2.7099, 0.124]]
const BELL: [number, number] = [2.8639, 1]
const RETURN: [number, number] = [3.8939, 1.33]

const pick = <T,>(list: T[], x: number) => list[Math.min(list.length - 1, Math.floor(x * list.length))]

/** What one key plays: its strike and its release, at its own pitch (playback rate). */
export function keyParts(code: string) {
  const v = voice(code)
  return { strike: pick(STRIKES, v.strike), release: pick(RELEASES, v.release), rate: 0.94 + 0.12 * v.pitch }
}

const SPRITE = new URL('./sounds/typewriter.wav', import.meta.url).href
let ctx: AudioContext | null = null
let out: GainNode
let sounds: AudioBuffer | null = null
let loading: Promise<void> | null = null
let idle: ReturnType<typeof setTimeout> | undefined
/** Keys whose strike is waiting for its release. */
const down = new Set<string>()

/** Fetch and decode the recordings once, without opening the sound device. */
export function preloadSounds() {
  if (sounds || loading || typeof OfflineAudioContext === 'undefined') return
  loading = fetch(SPRITE)
    .then((r) => r.arrayBuffer())
    .then((b) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(b))
    .then((b) => void (sounds = b))
    .catch(() => void (loading = null)) // try again on the next keystroke
}

function audio(): AudioContext | null {
  preloadSounds()
  if (!sounds || typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    out = ctx.createGain()
    out.gain.value = 0.7
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  // let the sound device sleep while nobody types
  clearTimeout(idle)
  idle = setTimeout(() => void ctx?.suspend(), 5000)
  return ctx
}

function play(c: AudioContext, [start, length]: [number, number], at: number, rate: number, gain: number) {
  const s = c.createBufferSource()
  s.buffer = sounds
  s.playbackRate.value = rate
  const g = c.createGain()
  g.gain.value = gain
  s.connect(g).connect(out)
  s.start(at, start, length)
}

/** Play the key going down: `code` is the physical key (KeyboardEvent.code), `key` what it typed. */
export function playStroke(stroke: Stroke, code: string, key: string) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.002
  const k = keyParts(code)
  switch (stroke) {
    case 'type': // the typebar strikes the platen; the carriage steps on when the key comes up
      play(c, k.strike, t, k.rate, weight(key))
      down.add(code)
      break
    case 'space': // the wide bar has no typebar: just the escapement letting the carriage on
      play(c, k.release, t, 0.9, 1.5)
      break
    case 'back': // the carriage knocked back one space
      play(c, k.release, t, 0.8, 1.3)
      break
    case 'return': // the margin bell, then the lever runs the carriage home
      play(c, BELL, t, 1, 0.8)
      play(c, RETURN, t + 0.1, 1, 1)
      break
  }
}

/** Play the key coming back up, for a key whose strike played. */
export function playRelease(code: string) {
  if (!down.delete(code)) return
  const c = audio()
  if (!c) return
  const k = keyParts(code)
  play(c, k.release, c.currentTime + 0.002, k.rate, 0.8)
}
