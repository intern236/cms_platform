import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { OutboxView } from '@/components/agency/outbox-view'
import { PageHeader } from '@/components/ui/page-header'
import { requireAgency } from '@/lib/auth/access'
import { outboxVisible } from '@/lib/env'
import { latestOutbox } from '@/lib/mail'

export const metadata: Metadata = { title: 'Email outbox' }

/** While SMTP is not configured, every email the CMS would send is kept here instead. */
export default async function OutboxPage() {
  await requireAgency()
  if (!outboxVisible()) notFound()
  const mails = await latestOutbox(60)
  return (
    <>
      <PageHeader
        title="Email outbox"
        description="Email is not set up on this server, so messages are kept here instead of sent. Set SMTP_HOST to send them for real."
      />
      <OutboxView mails={mails.map((m) => ({ id: m.id, to: m.to, subject: m.subject, html: m.html, createdAt: m.createdAt.toISOString() }))} />
    </>
  )
}
