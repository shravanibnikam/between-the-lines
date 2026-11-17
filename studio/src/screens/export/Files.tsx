import { type ReactNode } from 'react'
import { toast } from 'sonner'
import { Bar } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { timeAgo } from '@/lib/book'
import type { ExportFile } from '@/lib/types'
import { canUseFiles, openFile, saveCopy, showInFolder, size } from './native'

const COLS = 'grid grid-cols-[minmax(0,1fr)_72px_104px_auto] items-center gap-x-4'

function Desktop({ children }: { children: ReactNode }) {
  if (canUseFiles) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{children}</span></TooltipTrigger>
      <TooltipContent>Available in the desktop app</TooltipContent>
    </Tooltip>
  )
}

const attempt = (p: Promise<unknown>, what: string) => p.catch((e) => { toast.error(`Couldn't ${what}`, { description: String(e) }) })

export function Files({ files, error, onRetry }: { files: ExportFile[] | null; error: string | null; onRetry: () => void }) {
  if (error && !files)
    return <p className="py-3 text-[14px] text-muted-foreground">Couldn't list your files. <Button variant="link" className="h-auto p-0 align-baseline" onClick={onRetry}>Retry</Button></p>
  return (
    <div role="table" aria-label="Exported files">
      <div role="row" className={`${COLS} border-b border-border pb-2 text-[12px] text-muted-foreground`}>
        <span role="columnheader">Name</span>
        <span role="columnheader" className="text-right">Size</span>
        <span role="columnheader">Exported</span>
        <span role="columnheader" className="w-[248px]"><span className="sr-only">Actions</span></span>
      </div>
      {!files &&
        [0, 1].map((i) => (
          <div key={i} className={`${COLS} border-b border-rule py-2`}>
            <Bar className="h-4 w-64 max-w-full" /><Bar className="ml-auto h-4 w-12" /><Bar className="h-4 w-20" /><span />
          </div>
        ))}
      {files?.length === 0 && <p className="border-b border-rule py-3 text-[14px] text-muted-foreground">Nothing exported yet.</p>}
      {files?.map((f) => (
        <div key={f.path} role="row" className={`${COLS} border-b border-rule py-1.5`}>
          <span role="cell" className="truncate text-[14px]" title={f.name}>{f.name}</span>
          <span role="cell" className="num text-right text-[14px] text-muted-foreground">{size(f.bytes)}</span>
          <span role="cell" className="num text-[14px] text-muted-foreground">{timeAgo(f.modified)}</span>
          <span role="cell" className="flex w-[248px] justify-end gap-1">
            <Desktop><Button variant="ghost" size="sm" disabled={!canUseFiles} onClick={() => void attempt(openFile(f.path), 'open the file')}>Open</Button></Desktop>
            <Desktop><Button variant="ghost" size="sm" disabled={!canUseFiles} onClick={() => void attempt(showInFolder(f.path), 'show the file')}>Show in folder</Button></Desktop>
            <Desktop>
              <Button variant="ghost" size="sm" disabled={!canUseFiles} onClick={() => void attempt(saveCopy(f.path, f.name).then((d) => d && toast.success('Copy saved')), 'save a copy')}>Save a copy…</Button>
            </Desktop>
          </span>
        </div>
      ))}
    </div>
  )
}
