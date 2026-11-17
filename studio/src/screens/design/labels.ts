// Option labels, copied from core/src/model.rs so the panel reads like the printed settings.
import type { FamilyInfo, FirstParagraph, HeaderContent, HeadingLayout, NumberFormat, PageNumberPos } from '@/lib/types'

export const HEADING_LAYOUTS: [HeadingLayout, string][] = [
  ['NumberAboveTitle', 'Number above title'], ['TitleOnly', 'Title only'],
  ['NumberOnly', 'Number only'], ['Inline', 'Number and title on one line'],
]
export const NUMBER_FORMATS: [NumberFormat, string][] = [
  ['LabelArabic', 'Chapter 1'], ['LabelWord', 'Chapter One'], ['LabelRoman', 'Chapter I'],
  ['Arabic', '1'], ['Word', 'One'], ['Roman', 'I'],
]
export const FIRST_PARAGRAPHS: [FirstParagraph, string][] = [
  ['Plain', 'Plain'], ['SmallCapsWords', 'Small caps: first words'], ['SmallCapsLine', 'Small caps: first line'],
]
export const PAGE_NUMBER_POS: [PageNumberPos, string][] = [
  ['BottomCenter', 'Bottom, centred'], ['BottomOutside', 'Bottom, outside corner'], ['TopOutside', 'Top, outside corner'],
]
export const HEADER_CONTENT: [HeaderContent, string][] = [
  ['Nothing', 'Nothing'], ['Author', 'Author name'], ['BookTitle', 'Book title'], ['ChapterTitle', 'Chapter title'],
]
export const FONT_KINDS: FamilyInfo['kind'][] = ['Serif', 'Sans serif', 'Display', 'Script', 'Monospace']

/** A curated set of inks for headings and ornaments: no rainbow. */
export const INKS: [string, string][] = [
  ['#1a1a1a', 'Black'], ['#3f3f46', 'Charcoal'], ['#1f3a5f', 'Ink blue'],
  ['#7a2230', 'Oxblood'], ['#2f4f3a', 'Forest'], ['#5a4632', 'Sepia'],
]

/** 6 or 5.5, never 6.00. */
export const inches = (n: number) => String(Math.round(n * 100) / 100)
