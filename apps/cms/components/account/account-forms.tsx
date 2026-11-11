'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Desktop, DeviceMobile, ShieldCheck } from '@phosphor-icons/react'
import { changePassword, setTwoFactor, signOutEverywhere, updateProfile } from '@/lib/actions/account'
import { PasswordMeter } from '@/components/auth/forms'
import { Section } from '@/components/settings/save-bar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

export function AccountForms({
  name: initialName,
  email,
  twoFactor,
  mailReady,
  sessions,
  currentSession,
}: {
  name: string
  email: string
  twoFactor: boolean
  mailReady: boolean
  sessions: { id: string; userAgent: string; lastSeenAt: string; createdAt: string }[]
  currentSession: string
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [tf, setTf] = useState({ open: false, password: '', error: '' })

  return (
    <div className="pb-16">
      <Section title="Profile" description={`Signed in as ${email}.`}>
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy('name')
            const r = await updateProfile(name)
            setBusy(null)
            if (r.ok) toast.success('Name saved')
            else toast.error(r.errors?.name ?? r.error ?? 'Failed')
            router.refresh()
          }}
        >
          <Field label="Your name" className="flex-1">
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
          </Field>
          <Button type="submit" variant="ink" loading={busy === 'name'} disabled={name === initialName} className="h-11">
            Save
          </Button>
        </form>
      </Section>

      <Section title="Password" description="At least 12 characters. Changing it signs you out on every other device.">
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy('pw')
            const r = await changePassword(pw)
            setBusy(null)
            if (!r.ok) return setPwErrors(r.errors ?? {})
            setPwErrors({})
            setPw({ current: '', next: '', confirm: '' })
            toast.success(r.message ?? 'Password changed')
            router.refresh()
          }}
        >
          <Field label="Current password" error={pwErrors.current}>
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />}
          </Field>
          <Field label="New password" error={pwErrors.next}>
            {(p) => (
              <>
                <Input {...p} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
                <PasswordMeter value={pw.next} />
              </>
            )}
          </Field>
          <Field label="Repeat it" error={pwErrors.confirm}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />}
          </Field>
          <Button type="submit" variant="ink" loading={busy === 'pw'} className="self-start">
            Change password
          </Button>
        </form>
      </Section>

      <Section title="Sign-in codes" description="After your password, we email a 6-digit code. Someone who learns your password still cannot get in.">
        <div className="flex items-center justify-between gap-6 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className={twoFactor ? 'text-ok' : 'text-faint'}>
              <ShieldCheck size={26} weight={twoFactor ? 'fill' : 'regular'} />
            </span>
            <div>
              <p className="text-sm font-medium">{twoFactor ? 'On' : 'Off'}</p>
              <p className="text-[12.5px] text-muted">{mailReady ? `Codes go to ${email}.` : 'Email is not set up on this server — codes appear in the agency outbox.'}</p>
            </div>
          </div>
          <Switch aria-label="Sign-in codes" checked={tf.open ? !twoFactor : twoFactor} onCheckedChange={() => setTf({ open: true, password: '', error: '' })} />
        </div>
        {tf.open && (
          <form
            className="flex max-w-md flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy('tf')
              const r = await setTwoFactor({ enabled: !twoFactor, password: tf.password })
              setBusy(null)
              if (!r.ok) return setTf({ ...tf, error: r.errors?.password ?? r.error ?? 'Failed' })
              setTf({ open: false, password: '', error: '' })
              toast.success(r.message ?? 'Saved')
              router.refresh()
            }}
          >
            <Field label="Confirm with your password" error={tf.error}>
              {(p) => <Input {...p} type="password" value={tf.password} onChange={(e) => setTf({ ...tf, password: e.target.value })} autoFocus required />}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="ink" loading={busy === 'tf'}>
                {twoFactor ? 'Turn off' : 'Turn on'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setTf({ open: false, password: '', error: '' })}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Section>

      <Section title="Where you are signed in" description="Sessions end after 7 idle days, or 30 days at most.">
        <ul className="overflow-hidden rounded-[22px] border border-line bg-surface">
          {sessions.map((s) => {
            const mobile = /mobile|iphone|android/i.test(s.userAgent)
            return (
              <li key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <span className="grid size-9 place-items-center rounded-xl bg-sunken text-muted">{mobile ? <DeviceMobile size={17} /> : <Desktop size={17} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{describeAgent(s.userAgent)}</p>
                  <p className="text-[12px] text-muted">
                    Active <TimeAgo date={s.lastSeenAt} /> · signed in <TimeAgo date={s.createdAt} />
                  </p>
                </div>
                {s.id === currentSession && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-medium text-ok">This device</span>}
              </li>
            )
          })}
        </ul>
        <Button
          variant="outline"
          className="self-start"
          disabled={sessions.length < 2}
          loading={busy === 'out'}
          onClick={async () => {
            setBusy('out')
            const r = await signOutEverywhere()
            setBusy(null)
            if (r.ok) toast.success(r.message ?? 'Done')
            router.refresh()
          }}
        >
          Sign out everywhere else
        </Button>
      </Section>
    </div>
  )
}

function describeAgent(ua: string): string {
  if (!ua) return 'Unknown device'
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : 'Browser'
  const os = /windows/i.test(ua) ? 'Windows' : /mac os x/i.test(ua) ? 'macOS' : /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /linux/i.test(ua) ? 'Linux' : ''
  return `${browser}${os ? ` on ${os}` : ''}`
}
