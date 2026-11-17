// Shared building blocks for every screen, so the patterns in DESIGN.md stay identical.
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** The title row: the screen's noun as the h1, a one-line subline, actions on the right. */
export function ScreenHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-[32px] leading-10 font-bold tracking-[-0.01em] text-foreground">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
    </header>
  )
}

/** A settings row: label column (title + description) beside a raised panel. */
export function SettingsSection({ title, description, children, aside }: { title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid grid-cols-[minmax(220px,300px)_minmax(0,1fr)] gap-8 border-t border-border py-8 first:border-t-0 first:pt-0">
      <div className="pt-1.5">
        <h2 className="text-[16px] leading-6 font-medium text-foreground">{title}</h2>
        {description && <p className="mt-1 text-[14px] text-muted-foreground">{description}</p>}
        {aside}
      </div>
      <div className="flex flex-col gap-4 rounded-xl bg-raised p-5">{children}</div>
    </section>
  )
}

/** A labelled field: label above the control, optional hint below. */
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={htmlFor} className="text-[14px] font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A switch row: title, description, the control on the right. */
export function SwitchRow({ title, description, control }: { title: string; description?: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <p className="text-[14px] font-medium text-foreground">{title}</p>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="pt-0.5">{control}</div>
    </div>
  )
}

const PILL = {
  ok: 'bg-[#dcfce7] text-[#14532d] dark:bg-[#172a1d] dark:text-[#3fc07a]',
  warn: 'bg-[#fffbeb] text-[#92400e] dark:bg-[#2a2210] dark:text-[#f0b357]',
  problem: 'bg-[#ffedea] text-[#831c1e] dark:bg-[#2c1a20] dark:text-[#e5566f]',
  neutral: 'bg-raised text-[#374151] dark:text-[#d4d4d4]',
  brand: 'bg-brand-soft text-brand-ink',
} as const

/** A status pill: pale tint with the dark ink of the same hue. */
export function Pill({ tone = 'neutral', children, className }: { tone?: keyof typeof PILL; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-[12px] font-medium whitespace-nowrap', PILL[tone], className)}>{children}</span>
}

/** An empty block keeps its frame: one sentence and the first action. */
export function EmptyState({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-lg border border-dashed border-input px-4 py-3 text-[14px] text-muted-foreground', className)}>
      <p>{children}</p>
      {action}
    </div>
  )
}

/** A grey bar at the real size of the value it stands in for (loading). */
export function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded bg-raised', className)} />
}
