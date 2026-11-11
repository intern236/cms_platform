'use client'

import { useState, type FormEvent } from 'react'

export type ContactStatus = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Everything a contact form needs: posts to your site's /api/contact (the site
 * kit's contactHandler), shows field errors from the CMS, and reports success.
 * Render <HoneypotField /> inside the form.
 */
export function useContactForm(endpoint = '/api/contact') {
  const [status, setStatus] = useState<ContactStatus>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setErrors({})
    setFailure(null)
    const data = new FormData(event.currentTarget)
    const body = Object.fromEntries(['name', 'email', 'phone', 'company', 'topic', 'message', 'botField'].map((k) => [k, String(data.get(k) ?? '')]))
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, source: window.location.pathname }),
      })
      if (res.ok) return setStatus('sent')
      const payload = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string }
      if (payload.errors) {
        setErrors(payload.errors)
        setStatus('idle')
        return
      }
      setFailure(payload.error ?? 'That did not send. Please try again.')
      setStatus('error')
    } catch {
      setFailure('That did not send. Check your connection and try again.')
      setStatus('error')
    }
  }

  return { onSubmit, status, errors, failure, reset: () => setStatus('idle') }
}

/** A field people never see and bots fill in. Filled → silently dropped. */
export function HoneypotField() {
  return (
    <p aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Leave this empty <input name="botField" tabIndex={-1} autoComplete="off" />
      </label>
    </p>
  )
}
