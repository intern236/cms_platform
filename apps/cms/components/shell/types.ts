import type { Role } from '@/lib/db/types'

export type NavKey = 'dashboard' | 'posts' | 'authors' | 'inbox' | 'settings' | 'clients' | 'team' | 'outbox' | 'account'

export type NavItem = { key: NavKey; label: string; href: string; badge?: number; exact?: boolean }

export type ShellWorkspace = {
  slug: string
  name: string
  accent: string
  hasLogo: boolean
  siteUrl: string
  logoVersion: number
  role: Role
}

export type ShellProps = {
  user: { name: string; email: string; isAgency: boolean }
  workspace: ShellWorkspace | null
  workspaces: { slug: string; name: string; accent: string; hasLogo: boolean; role: Role }[]
  nav: NavItem[]
  agencyName: string
  canCreatePost: boolean
}
