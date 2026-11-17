// The product mark: three lines of text, the middle one in the ribbon colour (between the lines).
export function AppMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeWidth={2.4} aria-hidden>
      <path d="M4 6.5h16" stroke="currentColor" />
      <path d="M4 12h10" stroke="var(--brand)" />
      <path d="M4 17.5h16" stroke="currentColor" />
    </svg>
  )
}
