// The book fonts bundled with the Rust core. Each face is registered twice:
// - `bbf-<index>`: the exact face an SVG page from the core asks for;
// - `Book <Family>` with its weight/style: for book text in the editor and theme cards.
// Faces are added to document.fonts without loading; the browser fetches each on first use.
import type { FaceInfo } from './types'

const urls = import.meta.glob('../../../core/assets/fonts/*.ttf', { query: '?url', import: 'default', eager: true }) as Record<string, string>

function urlFor(file: string): string | undefined {
  const key = Object.keys(urls).find((k) => k.endsWith('/' + file))
  return key ? urls[key] : undefined
}

let registered = false

export function registerBookFonts(faces: FaceInfo[]) {
  if (registered) return
  registered = true
  for (const f of faces) {
    const url = urlFor(f.file)
    if (!url) continue
    document.fonts.add(new FontFace(`bbf-${f.index}`, `url("${url}")`))
    document.fonts.add(
      new FontFace(bookFamily(f.family), `url("${url}")`, { weight: f.bold ? '700' : '400', style: f.italic ? 'italic' : 'normal' }),
    )
  }
}

export const bookFamily = (family: string) => `Book ${family}`

/** CSS font-family for book text set in one of the bundled families. */
export const fontStack = (family: string) => `"${bookFamily(family)}", Georgia, serif`
