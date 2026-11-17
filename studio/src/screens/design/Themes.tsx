// The theme gallery: every built-in design as a card set in its own heading font.
import { fontStack } from '@/lib/fonts'
import type { Catalog, ThemeInfo } from '@/lib/types'
import { cn } from '@/lib/utils'
import { OrnamentSvg } from './controls'
import { inches } from './labels'

function Card({ theme, catalog, selected, onPick }: { theme: ThemeInfo; catalog: Catalog; selected: boolean; onPick: () => void }) {
  const s = theme.style
  const key = s.chapter_ornament !== 'none' ? s.chapter_ornament : s.scene_break === 'Ornament' ? s.scene_ornament : 'none'
  const orn = key !== 'none' ? catalog.ornaments.find((o) => o.key === key) : undefined
  return (
    <button
      type="button" aria-pressed={selected} onClick={onPick}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors',
        selected ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted',
      )}
    >
      <span className="max-w-full truncate text-[17px] leading-6 text-foreground" style={{ fontFamily: fontStack(s.heading_font), fontStyle: s.title_italic ? 'italic' : 'normal' }}>{s.name}</span>
      <span className="flex h-4 items-center text-muted-foreground" aria-hidden>
        {orn ? <OrnamentSvg svg={orn.svg} className="h-3.5" /> : s.scene_break === 'Glyph' ? <span className="text-[13px] leading-4" style={{ fontFamily: fontStack(s.body_font) }}>{s.scene_glyph}</span> : null}
      </span>
      <span className="num text-[12px] leading-4 text-muted-foreground">{s.body_font} · {s.base_size_pt} pt · {inches(theme.trim[0])} × {inches(theme.trim[1])}</span>
    </button>
  )
}

export function Themes({ catalog, current, onPick }: { catalog: Catalog; current: string; onPick: (key: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {catalog.themes.map((t) => <Card key={t.key} theme={t} catalog={catalog} selected={t.key === current} onPick={() => onPick(t.key)} />)}
    </div>
  )
}
