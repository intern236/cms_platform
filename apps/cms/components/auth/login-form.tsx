'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Eye, EyeSlash, EnvelopeSimple } from '@phosphor-icons/react'
import { login, verifyCode, type LoginState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { OtpInput } from './otp-input'

export function LoginForm({
  workspace,
  next,
  heading,
  outboxHint,
}: {
  workspace?: string
  next?: string
  heading: string
  outboxHint?: boolean
}) {
  const [state, action, pending] = useActionState(async (prev: LoginState, form: FormData): Promise<LoginState> => {
    const step = form.get('step')
    if (step === 'restart') return { step: 'password' }
    return step === 'code' ? verifyCode(prev, form) : login(prev, form)
  }, { step: 'password' })
  const [show, setShow] = useState(false)
  const [code, setCode] = useState('')
  const current = state
  const error = state.error

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {current.step === 'password' ? (
          <motion.div key="password" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
            <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.02em] text-ink">{heading}</h1>
            <p className="mt-3 text-[15px] text-muted">Sign in with the email your invite was sent to.</p>

            <form action={action} className="mt-9 flex flex-col gap-4">
              <input type="hidden" name="step" value="password" />
              {workspace && <input type="hidden" name="workspace" value={workspace} />}
              {next && <input type="hidden" name="next" value={next} />}
              <Field label="Email">
                {(p) => <Input {...p} name="email" type="email" autoComplete="username" required defaultValue={state.step === 'password' ? state.email : ''} autoFocus />}
              </Field>
              <Field
                label={
                  <span className="flex w-full items-center justify-between">
                    Password
                  </span>
                }
              >
                {(p) => (
                  <div className="relative">
                    <Input {...p} name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="pr-11" />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
                      aria-label={show ? 'Hide password' : 'Show password'}
                    >
                      {show ? <EyeSlash size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                )}
              </Field>
              <ErrorLine error={error} />
              <Button type="submit" variant="brand" size="lg" loading={pending} className="group mt-2 w-full">
                Sign in
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" weight="bold" />
              </Button>
              <Link
                href={workspace ? `/forgot?workspace=${workspace}` : '/forgot'}
                className="self-center text-[13px] text-muted underline-offset-4 transition hover:text-ink hover:underline"
              >
                Forgot your password?
              </Link>
            </form>
          </motion.div>
        ) : (
          <motion.div key="code" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
            <motion.div
              initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="mb-6 grid size-14 place-items-center rounded-2xl bg-brand-soft text-ink"
            >
              <EnvelopeSimple size={26} />
            </motion.div>
            <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.02em] text-ink">Check your email</h1>
            <p className="mt-3 text-[15px] text-muted">
              We sent a 6-digit code to <span className="font-medium text-ink">{current.step === 'code' ? current.maskedEmail : ''}</span>. It
              expires in 10 minutes.
            </p>
            {current.step === 'code' && current.outbox && outboxHint && (
              <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
                Email is not set up on this server — find the code under Agency → Email outbox.
              </p>
            )}
            <form action={action} className="mt-8 flex flex-col gap-4">
              <input type="hidden" name="step" value="code" />
              {workspace && <input type="hidden" name="workspace" value={workspace} />}
              {next && <input type="hidden" name="next" value={next} />}
              <input type="hidden" name="code" value={code} />
              <OtpInput value={code} onChange={setCode} autoFocus />
              <ErrorLine error={error} />
              <Button type="submit" variant="brand" size="lg" loading={pending} disabled={code.length < 6} className="mt-2 w-full">
                Verify and sign in
              </Button>
            </form>
            <form action={action} className="mt-3 flex justify-center">
              <input type="hidden" name="step" value="restart" />
              <button type="submit" className="text-[13px] text-muted transition hover:text-ink">
                Use a different account
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ErrorLine({ error }: { error?: string }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.p
          role="alert"
          key={error}
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

export { ErrorLine }
