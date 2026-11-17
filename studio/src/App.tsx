import { lazy, Suspense } from 'react'
import { CommandPalette } from '@/components/CommandPalette'
import { Sidebar } from '@/components/shell/Sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Bookshelf } from '@/screens/Bookshelf'
import { Write } from '@/screens/Write'
import { useStore } from '@/state/context'
import { StoreProvider } from '@/state/store'

// Screens that aren't the first thing you see load on first visit, so start-up parses less code.
const Design = lazy(() => import('@/screens/Design').then((m) => ({ default: m.Design })))
const Details = lazy(() => import('@/screens/Details').then((m) => ({ default: m.Details })))
const Export = lazy(() => import('@/screens/Export').then((m) => ({ default: m.Export })))
const Preview = lazy(() => import('@/screens/Preview').then((m) => ({ default: m.Preview })))
const World = lazy(() => import('@/screens/World').then((m) => ({ default: m.World })))

function Main() {
  const s = useStore()
  if (s.loadError)
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md">
          <h1 className="text-[24px] font-semibold">Between the Lines couldn't start</h1>
          <p className="mt-2 text-muted-foreground">{s.loadError}</p>
        </div>
      </div>
    )
  if (!s.ready) return <div className="h-full bg-background" aria-busy />
  const screen = !s.book ? <Bookshelf /> : {
    write: <Write />, details: <Details />, world: <World />, design: <Design />, preview: <Preview />, export: <Export />,
  }[s.screen]
  return (
    <div className="flex h-full">
      {!s.focus && <Sidebar />}
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <Suspense fallback={null}>{screen}</Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <TooltipProvider delayDuration={400}>
        <Main />
        <CommandPalette />
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </StoreProvider>
  )
}
