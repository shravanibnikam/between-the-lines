// The store's shape, context and hook (kept apart from the provider component for fast refresh).
import { createContext, useContext } from 'react'
import type { Area, Book, Catalog, Settings, Summary } from '@/lib/types'

export type Screen = 'write' | 'details' | 'world' | 'design' | 'preview' | 'export'
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
export interface Selection { area: Area; index: number }

export interface Store {
  ready: boolean
  loadError: string | null
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void
  catalog: Catalog | null
  library: Summary[]
  refreshLibrary: () => Promise<void>
  book: Book | null
  /** Increments on every change to the open book. */
  rev: number
  screen: Screen
  setScreen: (s: Screen) => void
  selection: Selection
  select: (area: Area, index: number) => void
  updateBook: (fn: (draft: Book) => void) => void
  /** Swap in a whole book (snapshot restore, theme applied by the core…); marks it unsaved. */
  replaceBook: (b: Book) => void
  /** Saves the current book first; on a failed save or load it toasts and changes nothing. */
  openBook: (id: string, screen?: Screen) => Promise<void>
  /** False (with a toast) when the book couldn't be saved, so it stays open. */
  closeBook: () => Promise<boolean>
  saveState: SaveState
  saveError: string | null
  /** Flushes pending edits and saves; false when the save failed (the book stays unsaved). */
  saveNow: () => Promise<boolean>
  /** Register a function that writes held-back edits (the editor's typing timer) into the book. */
  registerFlush: (fn: () => void) => () => void
  /** Run every registered flush now; returns the book as it is afterwards. */
  flushEdits: () => Book | null
  focus: boolean
  setFocus: (on: boolean) => void
}

export const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
