'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, PaperPlaneTilt, ShieldCheck } from '@phosphor-icons/react'
import { cancelAgencyInvite, inviteAgencyMember, removeAgencyMember, setUserDisabled } from '@/lib/actions/agency'
import { Section } from '@/components/settings/save-bar'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { Field, Input } from '@/components/ui/field'
import { Badge } from '@/components/ui/status'

type Member = { id: string; name: string; email: string; lastLoginAt: string | null; twoFactor: boolean; disabled: boolean }

export function TeamPanel({ me, members, pending }: { me: string; members: Member[]; pending: { id: string; email: string; expiresAt: string }[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  return (
    <>
      <Section title="Invite a teammate" description="Agency admins can open every client workspace, add clients and manage this team.">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            const r = await inviteAgencyMember(email)
            setBusy(false)
            if (!r.ok) return setError(r.errors?.email ?? r.error)
            setError(undefined)
            setEmail('')
            setLink(r.url ?? null)
            toast.success(r.message ?? 'Invite sent')
            router.refresh()
          }}
        >
          <Field error={error} className="flex-1">
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@youragency.com" required />}
          </Field>
          <Button type="submit" variant="brand" loading={busy} className="h-11">
            <PaperPlaneTilt weight="bold" /> Invite
          </Button>
        </form>
        {link && (
          <div className="flex items-center gap-2 rounded-2xl bg-warn-soft p-3 text-[13px] text-warn">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{link}</code>
            <Button size="xs" variant="ink" onClick={() => (navigator.clipboard.writeText(link), toast.success('Copied'))}>
              <Copy /> Copy
            </Button>
          </div>
        )}
      </Section>
      <Section title="Agency admins" description="Disabling someone signs them out everywhere and blocks sign-in until you turn them back on.">
        <ul className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-card">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
              <Avatar name={m.name} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {m.id === me && <Badge>You</Badge>}
                  {m.disabled && <Badge tone="danger">Disabled</Badge>}
                  {m.twoFactor && <ShieldCheck size={15} weight="fill" className="text-ok" />}
                </div>
                <span className="block truncate text-[12.5px] text-muted">
                  {m.email} · {m.lastLoginAt ? <TimeAgo date={m.lastLoginAt} prefix="last seen " /> : 'never signed in'}
                </span>
              </div>
              {m.id !== me && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const r = await setUserDisabled(m.id, !m.disabled)
                      if (!r.ok) toast.error(r.error ?? 'Failed')
                      router.refresh()
                    }}
                  >
                    {m.disabled ? 'Enable' : 'Disable'}
                  </Button>
                  <Button variant="danger-ghost" size="sm" onClick={() => setRemoving(m)}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {pending.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.email}</span>
                <span className="text-[12px] text-muted">expires <TimeAgo date={p.expiresAt} /></span>
                <Button variant="ghost" size="sm" onClick={async () => (await cancelAgencyInvite(p.id), router.refresh())}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Confirm
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name} from the agency?`}
        description="They lose access to every client straight away (unless a client invited them directly)."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (!removing) return
          const r = await removeAgencyMember(removing.id)
          if (!r.ok) toast.error(r.error ?? 'Failed')
          setRemoving(null)
          router.refresh()
        }}
      />
    </>
  )
}
