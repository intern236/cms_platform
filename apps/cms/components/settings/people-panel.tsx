'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { Copy, PaperPlaneTilt, ShieldCheck, X } from '@phosphor-icons/react'
import { cancelInvite, inviteMember, removeMember, setMemberRole } from '@/lib/actions/workspace'
import type { Role } from '@/lib/db/types'
import { ROLE_BLURB, ROLE_LABEL, ROLE_RANK } from '@/lib/permissions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { Field, Input } from '@/components/ui/field'
import { Badge } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import { Section } from './save-bar'

export type MemberRow = { userId: string; name: string; email: string; role: Role; lastLoginAt: string | null; twoFactor: boolean }
export type InviteRow = { id: string; email: string; role: string; expiresAt: string }

export function PeoplePanel({
  workspace,
  workspaceName,
  me,
  myRole,
  members,
  invites,
}: {
  workspace: string
  workspaceName: string
  me: string
  myRole: Role
  members: MemberRow[]
  invites: InviteRow[]
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [link, setLink] = useState<string | null>(null)
  const [removing, setRemoving] = useState<MemberRow | null>(null)
  const grantable = (['writer', 'editor', 'owner'] as Role[]).filter((r) => ROLE_RANK[r] <= ROLE_RANK[myRole])

  async function invite() {
    setBusy(true)
    setLink(null)
    const r = await inviteMember(workspace, { email, role })
    setBusy(false)
    if (!r.ok) return setError(r.errors?.email ?? r.errors?.role ?? r.error)
    setError(undefined)
    setEmail('')
    toast.success(r.message ?? 'Invite sent')
    if (r.url) setLink(r.url)
    router.refresh()
  }

  return (
    <div>
      <Section title="Invite someone" description={`They get an email with a link to join ${workspaceName}. No one can sign up without an invite.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void invite()
          }}
        >
          <Field label="Email" error={error}>
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />}
          </Field>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Role">
            {grantable.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  'relative rounded-2xl border p-3.5 text-left transition',
                  role === r ? 'border-transparent bg-surface shadow-[inset_0_0_0_1.5px_var(--ink)]' : 'border-line bg-surface-2 hover:border-line-strong'
                )}
              >
                <span className="block text-sm font-semibold text-ink">{ROLE_LABEL[r]}</span>
                <span className="mt-1 block text-[12px] leading-snug text-muted">{ROLE_BLURB[r]}</span>
              </button>
            ))}
          </div>
          <Button type="submit" variant="brand" loading={busy} className="self-start">
            <PaperPlaneTilt weight="bold" /> Send invite
          </Button>
          <AnimatePresence>
            {link && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-warn-soft p-4 text-[13px] text-warn">
                <p className="font-medium">Direct invite link (valid for 7 days). You can copy and share this link directly with the client:</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2 py-1.5 font-mono text-[12px] text-ink">{link}</code>
                  <Button size="xs" variant="ink" type="button" onClick={() => (navigator.clipboard.writeText(link), toast.success('Copied'))}>
                    <Copy /> Copy
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </Section>

      <Section title="People" description="Everyone who can sign in to this workspace. Your agency team can always get in and is not listed.">
        <ul className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-card">
          <AnimatePresence initial={false}>
            {members.map((m) => {
              const self = m.userId === me
              const canChange = ROLE_RANK[m.role] <= ROLE_RANK[myRole]
              return (
                <motion.li key={m.userId} layout exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
                  <Avatar name={m.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                      {self && <Badge>You</Badge>}
                      {m.twoFactor && (
                        <span title="Sign-in codes on" className="text-ok">
                          <ShieldCheck size={15} weight="fill" />
                        </span>
                      )}
                    </div>
                    <span className="block truncate text-[12.5px] text-muted">
                      {m.email} · {m.lastLoginAt ? <TimeAgo date={m.lastLoginAt} prefix="last seen " /> : 'never signed in'}
                    </span>
                  </div>
                  <select
                    value={m.role}
                    disabled={!canChange}
                    aria-label={`Role for ${m.name}`}
                    onChange={async (e) => {
                      const r = await setMemberRole(workspace, m.userId, e.target.value)
                      if (r.ok) toast.success(`${m.name} is now ${ROLE_LABEL[e.target.value as Role].toLowerCase()}`)
                      else toast.error(r.error ?? 'Could not change role')
                      router.refresh()
                    }}
                    className="h-9 rounded-full bg-sunken px-3 text-[13px] font-medium text-ink focus:outline-none disabled:opacity-60"
                  >
                    {(['owner', 'editor', 'writer'] as Role[]).map((r) => (
                      <option key={r} value={r} disabled={ROLE_RANK[r] > ROLE_RANK[myRole]}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" size="icon-sm" disabled={!canChange} onClick={() => setRemoving(m)} aria-label={`Remove ${m.name}`}>
                    <X />
                  </Button>
                </motion.li>
              )
            })}
          </AnimatePresence>
          {members.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No one yet. Invite the client&apos;s owner above.</li>}
        </ul>
        {invites.length > 0 && (
          <div>
            <h3 className="mb-2 mt-4 text-[13px] font-medium text-ink-2">Pending invites</h3>
            <ul className="flex flex-col gap-2">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3">
                  <span className="grid size-9 place-items-center rounded-full bg-sunken text-muted">
                    <PaperPlaneTilt size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{inv.email}</span>
                    <span className="text-[12px] text-muted">
                      {ROLE_LABEL[inv.role as Role] ?? inv.role} · expires <TimeAgo date={inv.expiresAt} />
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await cancelInvite(workspace, inv.id)
                      toast.success('Invite cancelled')
                      router.refresh()
                    }}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Confirm
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description={`They will lose access to ${workspaceName} straight away. Their posts stay.`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (!removing) return
          const r = await removeMember(workspace, removing.userId)
          if (r.ok) toast.success(`${removing.name} removed`)
          else toast.error(r.error ?? 'Could not remove')
          setRemoving(null)
          router.refresh()
        }}
      />
    </div>
  )
}
