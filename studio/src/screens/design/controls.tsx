// Small form controls for the Design panel. Each one is a labelled Field (kit) so every
// control has a visible name; numbers are tabular.
import { useState, type ReactNode } from 'react'
import { Field } from '@/components/kit'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fontStack } from '@/lib/fonts'
import type { FamilyInfo, OrnamentInfo } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FONT_KINDS, INKS } from './labels'

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length
const round = (v: number, step: number) => Number(v.toFixed(decimals(step)))

/** A number box that lets you type freely and commits (clamped) on Enter or blur. */
export function NumField({ id, label, value, min, max, step, onChange, className }: {
  id?: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; className?: string
}) {
  const shown = String(round(value, step)) // the core stores f32s: 1.5499999 reads 1.55
  const [draft, setDraft] = useState(shown)
  const [prevShown, setPrevShown] = useState(shown)
  if (prevShown !== shown) { // the value changed from outside: show it
    setPrevShown(shown)
    setDraft(shown)
  }
  const commit = () => {
    const n = parseFloat(draft)
    if (!Number.isFinite(n)) return setDraft(shown)
    const v = round(Math.min(max, Math.max(min, n)), step)
    setDraft(String(v))
    if (v !== round(value, step)) onChange(v)
  }
  return (
    <Input
      id={id} aria-label={label} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className={cn('num h-8 w-20 px-2', className)}
    />
  )
}

/** A slider with its number box beside it. */
export function SliderField({ id, label, value, min, max, step, onChange, hint }: {
  id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: ReactNode
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex items-center gap-3">
        <Slider aria-label={label} min={min} max={max} step={step} value={[Math.min(max, Math.max(min, value))]} onValueChange={([v]) => onChange(round(v, step))} className="flex-1" />
        <NumField id={id} label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
      </div>
    </Field>
  )
}

/** Choose one of a few short options. */
export function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void
}) {
  return (
    <Field label={label}>
      <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={value} aria-label={label} onValueChange={(v) => v && onChange(v as T)}>
        {options.map(([k, text]) => (
          <ToggleGroupItem key={k} value={k} className="px-3 data-[state=on]:bg-brand-soft data-[state=on]:text-brand-ink">{text}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}

/** A Select over [value, label] pairs. */
export function Pick<T extends string>({ id, label, value, options, onChange, disabled }: {
  id: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([k, text]) => <SelectItem key={k} value={k}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** The bundled book fonts, grouped by kind, each name set in its own face. */
export function FontPick({ id, label, value, families, onChange }: {
  id: string; label: string; value: string; families: FamilyInfo[]; onChange: (v: string) => void
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" style={{ fontFamily: fontStack(value) }}><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONT_KINDS.map((kind) => {
            const list = families.filter((f) => f.kind === kind)
            return list.length ? (
              <SelectGroup key={kind}>
                <SelectLabel>{kind}</SelectLabel>
                {list.map((f) => <SelectItem key={f.family} value={f.family} style={{ fontFamily: fontStack(f.family) }}>{f.family}</SelectItem>)}
              </SelectGroup>
            ) : null
          })}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Six curated inks plus a hex box. */
export function InkField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    setDraft(value)
  }
  const valid = (s: string) => /^#[0-9a-f]{6}$/i.test(s)
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <div role="group" aria-label={`${label} swatches`} className="flex gap-1.5">
          {INKS.map(([hex, name]) => (
            <button
              key={hex} type="button" aria-label={name} aria-pressed={value.toLowerCase() === hex} title={name} onClick={() => onChange(hex)}
              className={cn('size-6 rounded-md border border-input', value.toLowerCase() === hex && 'ring-2 ring-brand ring-offset-2 ring-offset-background')}
              style={{ background: hex }}
            />
          ))}
        </div>
        <Input
          id={id} value={draft} maxLength={7} spellCheck={false} aria-label={`${label} hex code`}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            setDraft(v)
            if (valid(v)) onChange(v.toLowerCase())
          }}
          onBlur={() => setDraft(value)}
          className="num h-8 w-[5.5rem] px-2"
        />
      </div>
    </Field>
  )
}

const tint = (svg: string) => svg.replace(/^<\?xml[^>]*>\s*/, '').replaceAll('#1a1a1a', 'currentColor')

/** An ornament drawing in the current text colour (the core draws it; dark mode needs currentColor). */
export function OrnamentSvg({ svg, className }: { svg: string; className?: string }) {
  return <span aria-hidden className={cn('inline-flex [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-full', className)} dangerouslySetInnerHTML={{ __html: tint(svg) }} />
}

const choice = (on: boolean) => cn('rounded-md border text-[12px] transition-colors focus-visible:outline-2', on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-input bg-card text-foreground hover:bg-muted')

/** A grid of ornament previews to pick from. */
export function OrnamentGrid({ label, value, ornaments, onChange }: { label: string; value: string; ornaments: OrnamentInfo[]; onChange: (key: string) => void }) {
  return (
    <Field label={label}>
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
        {ornaments.map((o) => (
          <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={cn(choice(value === o.key), 'flex h-14 flex-col items-center justify-center gap-1 px-1')}>
            {o.key === 'none' ? <span className="h-5" /> : <OrnamentSvg svg={o.svg} className="h-5" />}
            <span className="max-w-full truncate">{o.name}</span>
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Scene-break characters to pick from. */
export function GlyphGrid({ label, value, glyphs, onChange, family }: { label: string; value: string; glyphs: string[]; onChange: (g: string) => void; family: string }) {
  return (
    <Field label={label}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {glyphs.map((g) => (
          <button key={g} type="button" aria-label={g} aria-pressed={value === g} onClick={() => onChange(g)} className={cn(choice(value === g), 'h-9 min-w-12 px-2 text-[16px]')} style={{ fontFamily: fontStack(family) }}>{g}</button>
        ))}
      </div>
    </Field>
  )
}
