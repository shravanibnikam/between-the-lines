import { api, isTauri } from '@/lib/api'

/** Desktop-only file actions (Tauri plugins); in a plain browser they are disabled by the UI. */
export const canUseFiles = isTauri

export async function showInFolder(path: string) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}

export async function openFile(path: string) {
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(path)
}

/** Asks where to save, then copies. Returns the destination, or null if cancelled. */
export async function saveCopy(src: string, name: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const dest = await save({ defaultPath: name })
  if (!dest) return null
  await api.copyFile(src, dest)
  return dest
}

export const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
