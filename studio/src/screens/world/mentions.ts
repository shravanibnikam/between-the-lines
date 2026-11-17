import type { WorldEntry } from '@/lib/types'

/** The names an entry answers to: its name and each comma-separated alias (at least 2 characters). */
export function namesOf(e: Pick<WorldEntry, 'name' | 'aliases'>): string[] {
  return [e.name, ...e.aliases.split(',')].map((s) => s.trim()).filter((s) => [...s].length >= 2)
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/**
 * Whole-word, case-sensitive occurrences of any name in a text. Occurrences that overlap are one
 * mention (the longest wins), so "Nell Avery" and the alias "Nell" at the same spot count once.
 */
export function mentions(text: string, names: string[]): number {
  const found: [number, number][] = []
  for (const name of names) {
    for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
      const end = at + name.length
      if (!isWordChar(text[at - 1]) && !isWordChar(text[end])) found.push([at, end])
    }
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  let n = 0
  let upTo = -1
  for (const [s, e] of found) {
    if (s >= upTo) { n++; upTo = e }
  }
  return n
}

