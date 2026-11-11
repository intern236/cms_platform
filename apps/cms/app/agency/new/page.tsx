import type { Metadata } from 'next'
import { NewClientForm } from '@/components/agency/new-client-form'
import { PageHeader } from '@/components/ui/page-header'
import { requireAgency } from '@/lib/auth/access'
import { cmsUrl } from '@/lib/env'

export const metadata: Metadata = { title: 'Add a client' }

export default async function NewClient() {
  await requireAgency()
  return (
    <>
      <PageHeader eyebrow="New workspace" title="Add a client" description="They get their own workspace, a sign-in page in their colours, and a key for their website." />
      <NewClientForm cmsHost={cmsUrl().replace(/^https?:\/\//, '')} />
    </>
  )
}
