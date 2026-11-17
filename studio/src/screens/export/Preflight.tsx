import { useCallback, useEffect, useState } from 'react'
import { Bar, Pill } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Check } from '@/lib/types'
import { useStore } from '@/state/context'

const ORDER = { problem: 0, warn: 1, ok: 2 } as const
const PILL = { ok: ['ok', 'Ready'], warn: ['warn', 'Check'], problem: ['problem', 'Fix'] } as const

export function Preflight() {
  const { book, rev } = useStore()
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const id = book?.id

  const retry = useCallback(() => { setError(null); setTries((t) => t + 1) }, [])

  useEffect(() => {
    if (!book) return
    let dead = false
    const t = setTimeout(() => {
      api.preflight(book).then(
        (c) => { if (!dead) { setChecks([...c].sort((a, b) => ORDER[a.level] - ORDER[b.level])); setError(null) } },
        (e) => { if (!dead) setError(String(e)) },
      )
    }, 500)
    return () => { dead = true; clearTimeout(t) }
    // Re-run on every edit (rev) and when the book changes, not on every object identity.
  }, [id, rev, tries]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !checks)
    return (
      <p className="py-3 text-[14px] text-muted-foreground">
        Couldn't check the book. <Button variant="link" className="h-auto p-0 align-baseline" onClick={retry}>Retry</Button>
      </p>
    )
  if (!checks)
    return (
      <div className="border-t border-rule" aria-busy aria-label="Checking the book">
        {['w-80', 'w-96', 'w-64', 'w-72'].map((w, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-rule py-2.5"><Bar className="h-5 w-14" /><Bar className={`h-4 max-w-full ${w}`} /></div>
        ))}
      </div>
    )
  return (
    <ul className="border-t border-rule" aria-label="Checks before publishing">
      {checks.map((c, i) => {
        const [tone, label] = PILL[c.level]
        return (
          <li key={i} className="flex items-start gap-3 border-b border-rule py-2.5">
            <Pill tone={tone} className="mt-px w-14 shrink-0 justify-center">{label}</Pill>
            <span className="text-[14px] leading-5">{c.text}</span>
          </li>
        )
      })}
      {error && <li className="py-2.5 text-[13px] text-muted-foreground">Couldn't refresh these. <Button variant="link" className="h-auto p-0 align-baseline" onClick={retry}>Retry</Button></li>}
    </ul>
  )
}
