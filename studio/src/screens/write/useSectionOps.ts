import { area, KIND_LABEL, newSection } from '@/lib/book'
import type { Area, SectionKind } from '@/lib/types'
import { useStore } from '@/state/context'

/** Add, move and delete sections, keeping the selection on the same section (or a sensible one). */
export function useSectionOps() {
  const { book, updateBook, selection, select } = useStore()
  const move = (a: Area, from: number, to: number) => {
    if (!book || to < 0 || to >= area(book, a).length || from === to) return
    updateBook((d) => {
      const l = area(d, a)
      const [s] = l.splice(from, 1)
      l.splice(to, 0, s)
    })
    if (selection.area !== a) return
    let i = selection.index
    if (i === from) i = to
    else if (from < i && to >= i) i--
    else if (from > i && to <= i) i++
    if (i !== selection.index) select(a, i)
  }
  const add = (a: Area, kind: SectionKind) => {
    if (!book) return
    const s = newSection(kind, ['Chapter', 'Part', 'Prologue', 'Epilogue'].includes(kind) ? '' : KIND_LABEL[kind])
    if (kind === 'Copyright') s.text = 'All rights reserved.'
    const list = area(book, a)
    const at = selection.area === a && selection.index < list.length ? selection.index + 1 : list.length
    updateBook((d) => {
      area(d, a).splice(at, 0, s)
    })
    select(a, at)
  }
  const remove = (a: Area, i: number) => {
    if (!book) return
    updateBook((d) => {
      area(d, a).splice(i, 1)
    })
    const lens: Record<Area, number> = { Front: book.front.length, Body: book.body.length, Back: book.back.length }
    lens[a]--
    let { area: sa, index: si } = selection
    if (sa === a && si > i) si--
    else if (sa === a && si === i) si = Math.min(i, lens[a] - 1)
    if (si < 0 || si >= lens[sa]) {
      sa = (['Body', 'Front', 'Back'] as Area[]).find((x) => lens[x] > 0) ?? 'Body'
      si = 0
    }
    select(sa, si)
  }
  return { move, add, remove }
}
