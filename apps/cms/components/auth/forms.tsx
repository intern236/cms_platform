'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CheckCircle, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react'
import { acceptInvite, forgotPassword, resetPassword, type ForgotState, type InviteState, type ResetState } from '@/lib/actions/auth'
import { completeSetup, type SetupState } from '@/lib/actions/setup'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { ErrorLine } from './login-form'
import { cn } from '@/lib/utils'

function Heading({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <>
      <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.02em] text-ink">{title}</h1>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-muted">{body}</p>}
    </>
  )
}

/** A live strength meter: length, variety, and nothing obvious. */
export function PasswordMeter({ value }: { value: string }) {
  let score = 0
  if (value.length >= 12) score++
  if (value.length >= 16) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score++
  const labels = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']
  const colours = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--ok)', 'var(--ok)']
  return (
    <div className="mt-1 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="h-1 flex-1 rounded-full bg-line"
            animate={{ backgroundColor: i < score ? colours[score] : 'var(--line)' }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
      <span className="w-16 text-right font-mono text-[11px] text-muted">{value ? labels[score] : ''}</span>
    </div>
  )
}

export function SetupForm({ needsToken, dev }: { needsToken: boolean; dev: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, {})
  const [password, setPassword] = useState('')
  const [demo, setDemo] = useState(dev)
  // Controlled, so a failed submit (React resets uncontrolled forms after an action) keeps what was typed.
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  return (
    <div>
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        className="mb-6 grid size-14 place-items-center rounded-2xl bg-brand text-brand-fg"
      >
        <Sparkle size={26} weight="fill" />
      </motion.div>
      <Heading title="Set up your studio" body="Create the first agency account. You can invite your team and add clients right after." />
      <form action={action} className="mt-8 flex flex-col gap-4">
        {needsToken && (
          <Field label="Setup token" error={state.errors?.token} hint="The CMS_SETUP_TOKEN value from your server's environment.">
            {(p) => <Input {...p} name="token" type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />}
          </Field>
        )}
        <Field label="Your name" error={state.errors?.name}>
          {(p) => <Input {...p} name="name" required autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Email" error={state.errors?.email}>
          {(p) => <Input {...p} name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" error={state.errors?.password}>
          {(p) => (
            <>
              <Input {...p} name="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <PasswordMeter value={password} />
            </>
          )}
        </Field>
        {dev && (
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-4">
            <span>
              <span className="block text-sm font-medium text-ink">Add demo clients</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                Three sample clients with posts, authors, enquiries and a team — and the example site connected for you.
              </span>
            </span>
            <Switch checked={demo} onCheckedChange={setDemo} />
            <input type="hidden" name="demo" value={demo ? 'on' : 'off'} />
          </label>
        )}
        <ErrorLine error={state.error} />
        <Button type="submit" variant="brand" size="lg" loading={pending} className="group mt-2 w-full">
          Create account
          <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" weight="bold" />
        </Button>
      </form>
    </div>
  )
}

export function ForgotForm({ workspace }: { workspace?: string }) {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPassword, {})
  const [email, setEmail] = useState('')
  return (
    <AnimatePresence mode="wait">
      {state.sent ? (
        <motion.div key="sent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <motion.div
            initial={{ x: -40, y: 20, opacity: 0, rotate: -20 }}
            animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 140, damping: 14 }}
            className="mb-6 grid size-14 place-items-center rounded-2xl bg-brand-soft text-ink"
          >
            <PaperPlaneTilt size={26} />
          </motion.div>
          <Heading title="Check your inbox" body="If that email has an account, a reset link is on its way. It works once, for 30 minutes." />
          <Link href={workspace ? `/${workspace}/login` : '/login'} className="mt-8 inline-flex text-sm font-medium text-ink underline decoration-brand decoration-2 underline-offset-4">
            Back to sign in
          </Link>
        </motion.div>
      ) : (
        <motion.div key="form" exit={{ opacity: 0, y: -10 }}>
          <Heading title="Forgot your password?" body="Enter your email and we will send you a link to choose a new one." />
          <form action={action} className="mt-8 flex flex-col gap-4">
            {workspace && <input type="hidden" name="workspace" value={workspace} />}
            <Field label="Email">{(p) => <Input {...p} name="email" type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <ErrorLine error={state.error} />
            <Button type="submit" variant="brand" size="lg" loading={pending} className="mt-2 w-full">
              Send reset link
            </Button>
            <Link href={workspace ? `/${workspace}/login` : '/login'} className="self-center text-[13px] text-muted hover:text-ink">
              Back to sign in
            </Link>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, {})
  const [password, setPassword] = useState('')
  return (
    <div>
      <Heading title="Choose a new password" body={<>For <span className="font-medium text-ink">{email}</span>. You will be signed out everywhere else.</>} />
      <form action={action} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <Field label="New password">
          {(p) => (
            <>
              <Input {...p} name="password" type="password" required autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              <PasswordMeter value={password} />
            </>
          )}
        </Field>
        <Field label="Repeat it">{(p) => <Input {...p} name="confirm" type="password" required autoComplete="new-password" />}</Field>
        <ErrorLine error={state.error} />
        <Button type="submit" variant="brand" size="lg" loading={pending} className="mt-2 w-full">
          Save and sign in
        </Button>
      </form>
    </div>
  )
}

export function InviteForm({
  token,
  email,
  where,
  roleLabel,
  mode,
}: {
  token: string
  email: string
  where: string
  roleLabel: string
  /** new: create an account · join: signed in as the right person · signin: needs to sign in · wrong: signed in as someone else */
  mode: 'new' | 'join' | 'signin' | 'wrong'
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(acceptInvite, {})
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  return (
    <div>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-medium text-ink"
      >
        <CheckCircle size={16} weight="fill" className="text-brand" />
        Invite for {roleLabel}
      </motion.div>
      <Heading title={`Join ${where}`} body={<>This invite is for <span className="font-medium text-ink">{email}</span>.</>} />
      {mode === 'signin' && (
        <div className="mt-8 flex flex-col gap-3">
          <p className="text-[15px] text-muted">You already have an account. Sign in, then open this link again.</p>
          <Button asChild variant="brand" size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
          </Button>
        </div>
      )}
      {mode === 'wrong' && (
        <p className="mt-8 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          You are signed in as someone else. Sign out first, then open this link again.
        </p>
      )}
      {(mode === 'new' || mode === 'join') && (
        <form action={action} className="mt-8 flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          {mode === 'new' && (
            <>
              <Field label="Your name" error={state.fieldErrors?.name}>
                {(p) => <Input {...p} name="name" required autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field label="Choose a password" error={state.fieldErrors?.password}>
                {(p) => (
                  <>
                    <Input {...p} name="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <PasswordMeter value={password} />
                  </>
                )}
              </Field>
            </>
          )}
          <ErrorLine error={state.error} />
          <Button type="submit" variant="brand" size="lg" loading={pending} className={cn('group mt-2 w-full')}>
            {mode === 'new' ? 'Create account and join' : `Join ${where}`}
            <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" weight="bold" />
          </Button>
        </form>
      )}
    </div>
  )
}
