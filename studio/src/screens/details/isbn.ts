/** ISBN-10 / ISBN-13 checksum; hyphens and spaces are ignored; X only counts as the last ISBN-10 character. */
export function isbnValid(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, '').toUpperCase()
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0)
    return sum % 10 === 0
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((n, c, i) => n + (10 - i) * (c === 'X' ? 10 : Number(c)), 0)
    return sum % 11 === 0
  }
  return false
}

