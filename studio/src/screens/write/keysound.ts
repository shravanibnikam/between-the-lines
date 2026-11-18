// Typewriter key sounds, synthesised with Web Audio (the app is offline and ships no audio files).
// Each kind of key makes its own mechanical sound, and every physical key has a fixed voice
// taken from its code, so the same key always sounds like itself.

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

/** A physical key's own voice (0..1 each): its pitch, its brightness and when its carriage step lands. */
export function voice(code: string): { pitch: number; bright: number; step: number } {
  let h = 2166136261 // FNV-1a
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619)
  const byte = (n: number) => ((h >>> (8 * n)) & 0xff) / 255
  return { pitch: byte(0), bright: byte(1), step: byte(2) }
}

/** How hard the typebar lands: a capital shifts the whole type basket, small marks barely touch the paper. */
export function weight(key: string): number {
  if (key !== key.toLowerCase()) return 1.3
  return ".,'`:;-".includes(key) ? 0.65 : 1
}

let ctx: AudioContext | null = null
let out: GainNode
let noise: AudioBuffer
let idle: ReturnType<typeof setTimeout> | undefined

function audio(): AudioContext | null {
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null
    ctx = new AudioContext({ latencyHint: 'interactive' })
    out = ctx.createGain()
    out.gain.value = 0.7 // a capital peaks near 0.47, two struck at once near 0.77: no clipping
    out.connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  // let the sound device sleep while nobody types
  clearTimeout(idle)
  idle = setTimeout(() => void ctx?.suspend(), 5000)
  return ctx
}

/** Filtered noise: a click, a slap or a slide, depending on the band. */
function hiss(c: AudioContext, t: number, dur: number, freq: number, q: number, gain: number, to = freq) {
  const src = c.createBufferSource()
  src.buffer = noise
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(freq, t)
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + dur)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f).connect(g).connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur)
}

/** A decaying tone: the frame's thump (falling pitch) or a partial of the bell. */
function ring(c: AudioContext, t: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', fall = 1) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (fall !== 1) o.frequency.exponentialRampToValueAtTime(freq * fall, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur)
}

/** Play the sound of one keystroke: `code` is the physical key (KeyboardEvent.code), `key` what it typed. */
export function playStroke(stroke: Stroke, code: string, key: string) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.003
  const v = voice(code)
  const step = (at: number) => hiss(c, at, 0.01, 5200, 3, 0.16) // the escapement lets the carriage on a space
  switch (stroke) {
    case 'type': {
      const w = weight(key)
      hiss(c, t, 0.012, 2600 + 1400 * v.bright, 0.9, 0.9 * w) // the typebar slaps the platen
      hiss(c, t, 0.05, 1500 + 700 * v.pitch, 7, 0.22 * w) // and its steel rings for a moment
      ring(c, t, 125 + 55 * v.pitch, 0.07, 0.35 * w, 'triangle', 0.6) // the frame's thump
      step(t + 0.04 + 0.025 * v.step)
      break
    }
    case 'space':
      hiss(c, t, 0.03, 650 + 150 * v.pitch, 1.2, 0.35) // the wide bar bottoms out; no typebar
      ring(c, t, 90, 0.06, 0.3, 'triangle', 0.7)
      step(t + 0.035)
      break
    case 'back':
      ring(c, t, 115, 0.09, 0.4, 'triangle', 0.6) // the carriage knocked back one space
      hiss(c, t, 0.025, 1100, 1.5, 0.4)
      hiss(c, t + 0.03, 0.012, 4200, 3, 0.15)
      break
    case 'return': {
      // the margin bell, then the lever: the platen ratchets down a line and the carriage runs home
      for (const [mult, gain, dur] of [[1, 0.2, 1.2], [2.76, 0.07, 0.5], [5.4, 0.035, 0.25]]) ring(c, t, 1760 * mult, dur, gain)
      const lever = t + 0.14
      hiss(c, lever, 0.02, 2400, 2, 0.5)
      hiss(c, lever + 0.045, 0.02, 2100, 2, 0.4)
      const run = lever + 0.09
      const home = run + 0.3
      hiss(c, run, 0.3, 1400, 1.5, 0.14, 3200) // the carriage sliding
      for (let i = 0; i < 10; i++) hiss(c, run + 0.3 * Math.sqrt(i / 10), 0.008, 3800, 4, 0.1) // its pawl clicking past the teeth
      ring(c, home, 105, 0.12, 0.5, 'triangle', 0.6) // and hitting the stop
      hiss(c, home, 0.04, 900, 1, 0.45)
      break
    }
  }
}
