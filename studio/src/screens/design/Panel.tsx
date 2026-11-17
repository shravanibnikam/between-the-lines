// The settings panel: themes, then six accordion sections. Every control edits the book at
// once; the store debounces the layout and the save.
import { toast } from 'sonner'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Field, SwitchRow } from '@/components/kit'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import type { Book, Catalog, PrintSettings, StyleProfile } from '@/lib/types'
import { useStore } from '@/state/context'
import { GlyphGrid, InkField, NumField, OrnamentGrid, Pick, FontPick, Seg, SliderField } from './controls'
import { FIRST_PARAGRAPHS, HEADER_CONTENT, HEADING_LAYOUTS, NUMBER_FORMATS, PAGE_NUMBER_POS, inches } from './labels'
import { Themes } from './Themes'

const INDENT_EM = 1.2 // core/src/themes.rs INDENTED_PARAGRAPH_EM
const GAP_EM = 0.9 // SPACED_PARAGRAPH_EM

/** Same style as the built-in, ignoring its display name? */
function sameStyle(a: StyleProfile, b: StyleProfile) {
  return (Object.keys(b) as (keyof StyleProfile)[]).every((k) => k === 'name' || a[k] === b[k])
}

/** A tweaked built-in reads "<Theme> (edited)"; back to identical, the plain name returns. */
function fixName(d: Book, catalog: Catalog) {
  const theme = catalog.themes.find((t) => t.key === d.style.builtin)
  if (theme) d.style.name = sameStyle(d.style, theme.style) ? theme.name : `${theme.name} (edited)`
}

const Group = ({ children }: { children: React.ReactNode }) => <div className="flex flex-col gap-4 px-1 pb-2">{children}</div>
const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <AccordionItem value={id}>
    <AccordionTrigger className="items-center py-3 text-[15px] font-semibold hover:no-underline">{title}</AccordionTrigger>
    <AccordionContent><Group>{children}</Group></AccordionContent>
  </AccordionItem>
)
const Sw = ({ title, checked, onChange, disabled }: { title: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <SwitchRow title={title} control={<Switch aria-label={title} checked={checked} onCheckedChange={onChange} disabled={disabled} />} />
)

export function Panel({ catalog, onOpener }: { catalog: Catalog; onOpener: () => void }) {
  const { book, updateBook } = useStore()
  if (!book) return null
  const s = book.style
  const p = book.print
  const edit = (fn: (d: Book) => void) => updateBook((d) => { fn(d); fixName(d, catalog) })
  /** Change style fields; `opener` also jumps the spread to a chapter opening. */
  const style = (patch: Partial<StyleProfile>, opener = false) => {
    edit((d) => Object.assign(d.style, patch))
    if (opener) onOpener()
  }
  const print = (patch: Partial<PrintSettings>) => edit((d) => Object.assign(d.print, patch))
  const spaced = s.first_indent_em <= 0 && s.paragraph_spacing_em > 0
  const scenes = catalog.ornaments.filter((o) => o.key !== 'none')
  const margin = (id: string, label: string, k: 'margin_top_in' | 'margin_bottom_in' | 'margin_inside_in' | 'margin_outside_in') => (
    <label className="flex flex-col items-center gap-1 text-[12px] text-muted-foreground">
      {label}
      <NumField id={id} label={`${label} margin (in)`} value={p[k]} min={0.2} max={2} step={0.0625} onChange={(v) => print({ [k]: v })} className="w-20 text-center text-foreground" />
    </label>
  )

  const known = catalog.trims.some((t) => t.key === p.trim_key)
  const trims: [string, string][] = catalog.trims.map((t) => [t.key, t.name])
  if (!known) trims.push(['custom', `Custom · ${inches(p.trim_w_in)} × ${inches(p.trim_h_in)} in`])

  // The core works out the new design; only the fields it sets (core/src/themes.rs apply_theme,
  // api.rs set_trim) go into the book as it is by then, so edits made meanwhile stay.
  const takeTrim = (d: Book, r: Book) => {
    const { trim_key, trim_w_in, trim_h_in, margin_top_in, margin_bottom_in, margin_inside_in, margin_outside_in } = r.print
    Object.assign(d.print, { trim_key, trim_w_in, trim_h_in, margin_top_in, margin_bottom_in, margin_inside_in, margin_outside_in })
  }
  const pickTheme = (key: string) =>
    api.applyTheme(book, key).then(
      (r) => updateBook((d) => { d.style = r.style; takeTrim(d, r) }),
      () => toast.error("Couldn't apply that theme. Try again."),
    )
  const pickTrim = (key: string) =>
    api.applyTrim(book, key).then(
      (r) => updateBook((d) => takeTrim(d, r)),
      () => toast.error("Couldn't change the page size. Try again."),
    )

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="themes-h" className="flex flex-col gap-3">
        <h2 id="themes-h" className="text-[18px] leading-6 font-semibold">Themes</h2>
        <Themes catalog={catalog} current={s.builtin} onPick={pickTheme} />
      </section>

      <Accordion type="multiple" defaultValue={['body']} className="border-t border-border">
        <Section id="body" title="Body text">
          <FontPick id="body-font" label="Font" value={s.body_font} families={catalog.families} onChange={(v) => style({ body_font: v })} />
          <SliderField id="body-size" label="Size (pt)" value={s.base_size_pt} min={8} max={20} step={0.5} onChange={(v) => style({ base_size_pt: v })} />
          <SliderField id="line-height" label="Line spacing" value={s.line_height} min={1} max={2.5} step={0.05} onChange={(v) => style({ line_height: v })} />
          <Seg label="Paragraphs" value={spaced ? 'spaced' : 'indented'} options={[['indented', 'Indented'], ['spaced', 'Spaced']]}
            onChange={(v) => style(v === 'spaced' ? { first_indent_em: 0, paragraph_spacing_em: GAP_EM } : { first_indent_em: INDENT_EM, paragraph_spacing_em: 0 })} />
          {spaced
            ? <SliderField id="para-gap" label="Gap between paragraphs (em)" value={s.paragraph_spacing_em} min={0.1} max={1.5} step={0.05} onChange={(v) => style({ paragraph_spacing_em: v })} />
            : <SliderField id="para-indent" label="First-line indent (em)" value={s.first_indent_em} min={0} max={4} step={0.25} onChange={(v) => style({ first_indent_em: v })} />}
          <Seg label="Alignment" value={s.align} options={[['Justify', 'Justified'], ['Left', 'Left']]} onChange={(v) => style({ align: v })} />
          <Sw title="Hyphenation" checked={s.hyphenate} onChange={(v) => style({ hyphenate: v })} />
          <Sw title="No indent after headings and breaks" checked={s.no_indent_after_heading} onChange={(v) => style({ no_indent_after_heading: v })} />
        </Section>

        <Section id="headings" title="Chapter headings">
          <FontPick id="head-font" label="Heading font" value={s.heading_font} families={catalog.families} onChange={(v) => style({ heading_font: v }, true)} />
          <FontPick id="num-font" label="Number font" value={s.number_font} families={catalog.families} onChange={(v) => style({ number_font: v }, true)} />
          <Pick id="head-layout" label="Layout" value={s.heading_layout} options={HEADING_LAYOUTS} onChange={(v) => style({ heading_layout: v }, true)} />
          <Pick id="num-format" label="Number format" value={s.number_format} options={NUMBER_FORMATS} onChange={(v) => style({ number_format: v }, true)} />
          <Seg label="Alignment" value={s.heading_align} options={[['Left', 'Left'], ['Center', 'Centre'], ['Right', 'Right']]} onChange={(v) => style({ heading_align: v }, true)} />
          <SliderField id="title-scale" label="Title size (× body)" value={s.title_scale} min={1} max={4} step={0.05} onChange={(v) => style({ title_scale: v }, true)} />
          <SliderField id="number-scale" label="Number size (× body)" value={s.number_scale} min={0.6} max={5} step={0.05} onChange={(v) => style({ number_scale: v }, true)} />
          <Sw title="Title in capitals" checked={s.title_uppercase} onChange={(v) => style({ title_uppercase: v }, true)} />
          <Sw title="Title in italics" checked={s.title_italic} onChange={(v) => style({ title_italic: v }, true)} />
          <Sw title="Number label in capitals" checked={s.number_uppercase} onChange={(v) => style({ number_uppercase: v }, true)} />
          <InkField id="title-color" label="Title colour" value={s.title_color} onChange={(v) => style({ title_color: v }, true)} />
          <InkField id="number-color" label="Number colour" value={s.number_color} onChange={(v) => style({ number_color: v }, true)} />
        </Section>

        <Section id="ornaments" title="Ornaments and scene breaks">
          <OrnamentGrid label="Chapter ornament" value={s.chapter_ornament} ornaments={catalog.ornaments} onChange={(v) => style({ chapter_ornament: v }, true)} />
          <InkField id="orn-color" label="Ornament colour" value={s.ornament_color} onChange={(v) => style({ ornament_color: v })} />
          <SliderField id="orn-scale" label="Ornament size (×)" value={s.ornament_scale} min={0.4} max={2.5} step={0.05} onChange={(v) => style({ ornament_scale: v })} />
          <Seg label="Scene break" value={s.scene_break} options={[['Ornament', 'Ornament'], ['Glyph', 'Characters'], ['Space', 'Space']]} onChange={(v) => style({ scene_break: v })} />
          {s.scene_break === 'Ornament' && <OrnamentGrid label="Scene break ornament" value={s.scene_ornament} ornaments={scenes} onChange={(v) => style({ scene_ornament: v })} />}
          {s.scene_break === 'Glyph' && <GlyphGrid label="Scene break characters" value={s.scene_glyph} glyphs={catalog.glyphs} family={s.body_font} onChange={(v) => style({ scene_glyph: v })} />}
        </Section>

        <Section id="openings" title="Chapter openings">
          <SliderField id="sink" label="Start down the page (lines)" value={s.sink_lines} min={0} max={14} step={0.5} onChange={(v) => style({ sink_lines: v }, true)} />
          <SliderField id="opener-gap" label="Gap below heading (em)" value={s.opener_gap_em} min={0} max={8} step={0.25} onChange={(v) => style({ opener_gap_em: v }, true)} />
          <Sw title="Drop cap" checked={s.drop_cap} onChange={(v) => style({ drop_cap: v }, true)} />
          {s.drop_cap && (
            <>
              <SliderField id="dc-lines" label="Drop cap height (lines)" value={s.drop_cap_lines} min={2} max={5} step={1} onChange={(v) => style({ drop_cap_lines: v }, true)} />
              <InkField id="dc-color" label="Drop cap colour" value={s.drop_cap_color} onChange={(v) => style({ drop_cap_color: v }, true)} />
            </>
          )}
          <Pick id="first-para" label="First paragraph" value={s.first_paragraph} options={FIRST_PARAGRAPHS} onChange={(v) => style({ first_paragraph: v }, true)} />
          {s.first_paragraph === 'SmallCapsWords' && <SliderField id="sc-words" label="Words in small caps" value={s.small_caps_words} min={1} max={10} step={1} onChange={(v) => style({ small_caps_words: v }, true)} />}
          <Sw title="Show point of view" checked={s.show_pov} onChange={(v) => style({ show_pov: v }, true)} />
        </Section>

        <Section id="page" title="Page">
          <Pick id="trim" label="Trim size" value={known ? p.trim_key : 'custom'} options={trims} onChange={(k) => k !== 'custom' && pickTrim(k)} />
          <Field label="Margins (in)" hint="Inside is the edge by the spine.">
            <div className="grid grid-cols-3 items-center justify-items-center gap-y-3">
              <span />{margin('m-top', 'Top', 'margin_top_in')}<span />
              {margin('m-in', 'Inside', 'margin_inside_in')}
              <span aria-hidden className="relative h-20 w-14 rounded-sm border border-input bg-card"><span className="absolute inset-2.5 rounded-[2px] border border-dashed border-muted-foreground/50" /></span>
              {margin('m-out', 'Outside', 'margin_outside_in')}
              <span />{margin('m-bottom', 'Bottom', 'margin_bottom_in')}<span />
            </div>
          </Field>
          <Seg label="Paper" value={p.paper} options={[['Cream', 'Cream'], ['White', 'White']]} onChange={(v) => print({ paper: v })} />
          <Seg label="Binding" value={p.binding} options={[['Paperback', 'Paperback'], ['Hardback', 'Hardback']]} onChange={(v) => print({ binding: v })} />
          <Sw title="Chapters start on right-hand pages" checked={p.recto_chapter_start} onChange={(v) => print({ recto_chapter_start: v })} />
        </Section>

        <Section id="heads" title="Running heads and page numbers">
          <Sw title="Page numbers" checked={p.page_numbers} onChange={(v) => print({ page_numbers: v })} />
          <Pick id="pn-pos" label="Page number position" value={p.page_number_pos} options={PAGE_NUMBER_POS} disabled={!p.page_numbers} onChange={(v) => print({ page_number_pos: v })} />
          <Sw title="Running heads" checked={p.running_headers} onChange={(v) => print({ running_headers: v })} />
          <Pick id="head-left" label="Left pages show" value={p.header_left} options={HEADER_CONTENT} disabled={!p.running_headers} onChange={(v) => print({ header_left: v })} />
          <Pick id="head-right" label="Right pages show" value={p.header_right} options={HEADER_CONTENT} disabled={!p.running_headers} onChange={(v) => print({ header_right: v })} />
          <Sw title="Rule under the running head" checked={s.header_rule} onChange={(v) => style({ header_rule: v })} disabled={!p.running_headers} />
          <Sw title="Running heads in small capitals" checked={s.header_small_caps} onChange={(v) => style({ header_small_caps: v })} disabled={!p.running_headers} />
        </Section>
      </Accordion>
    </div>
  )
}
