import { accentForeground } from '@/lib/workspaces/settings'

/** CSS variables that re-skin everything inside with a client's colour. */
export function brandStyle(accent: string): React.CSSProperties {
  return { ['--brand' as string]: accent, ['--brand-fg' as string]: accentForeground(accent) }
}
