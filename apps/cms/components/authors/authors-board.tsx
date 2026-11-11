'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { LinkedinLogo, Globe, XLogo, Plus, UsersThree } from '@phosphor-icons/react'
import { deleteAuthor, saveAuthor } from '@/lib/actions/content'
import type { CloudinaryImage } from '@/lib/cloudinary/types'
import { avatarUrl } from '@/lib/cloudinary/url'
import { ImageDrop } from '@/components/editor/image-drop'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { EmptyState, Stagger, riseIn } from '@/components/ui/misc'

export type AuthorCard = {
  id: string
  name: string
  slug: string
  role: string | null
  bio: string | null
  avatar: CloudinaryImage | null
  avatarAlt: string | null
  linkedinUrl: string | null
  xUrl: string | null
  websiteUrl: string | null
  posts: number
}

type Draft = Omit<AuthorCard, 'posts' | 'id'> & { id?: string }

const EMPTY: Draft = { name: '', slug: '', role: '', bio: '', avatar: null, avatarAlt: '', linkedinUrl: '', xUrl: '', websiteUrl: '' }

export function AuthorsBoard({ workspace, authors, uploadsEnabled }: { workspace: string; authors: AuthorCard[]; uploadsEnabled: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const set = (patch: Partial<Draft>) => setEditing((d) => (d ? { ...d, ...patch } : d))

  async function submit() {
    if (!editing) return
    setBusy(true)
    const r = await saveAuthor(workspace, { ...editing, avatar: editing.avatar })
    setBusy(false)
    if (!r.ok) {
      setErrors(r.errors)
      return
    }
    toast.success(editing.id ? 'Author updated' : 'Author added')
    setEditing(null)
    router.refresh()
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button variant="brand" onClick={() => (setErrors({}), setEditing({ ...EMPTY }))}>
          <Plus weight="bold" /> Add author
        </Button>
      </div>
      {authors.length === 0 ? (
        <EmptyState
          title="No authors yet"
          body="Authors give posts a face and a byline. Each one gets a profile page on the site once they have a published post."
          art={<UsersThree size={44} weight="thin" />}
          action={<Button variant="brand" onClick={() => setEditing({ ...EMPTY })}>Add the first author</Button>}
        />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {authors.map((a) => (
            <motion.button
              key={a.id}
              variants={riseIn}
              type="button"
              onClick={() => (setErrors({}), setEditing({ ...a }))}
              className="group relative flex flex-col items-start overflow-hidden rounded-[24px] border border-line bg-surface p-6 text-left shadow-card transition-[transform,box-shadow] duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-float"
            >
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand-soft blur-2xl transition-transform duration-700 group-hover:scale-150" />
              {a.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl(a.avatar.publicId, 144)} alt="" className="relative size-16 rounded-full object-cover" />
              ) : (
                <Avatar name={a.name} size={64} className="relative" />
              )}
              <h3 className="relative mt-5 font-serif text-[28px] leading-none tracking-[-0.01em] text-ink">{a.name}</h3>
              {a.role && <p className="relative mt-1.5 text-[13.5px] text-muted">{a.role}</p>}
              {a.bio && <p className="relative mt-4 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{a.bio}</p>}
              <div className="relative mt-auto flex w-full items-center justify-between pt-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                  {a.posts} {a.posts === 1 ? 'post' : 'posts'}
                </span>
                <span className="flex gap-1.5 text-muted">
                  {a.linkedinUrl && <LinkedinLogo size={16} />}
                  {a.xUrl && <XLogo size={16} />}
                  {a.websiteUrl && <Globe size={16} />}
                </span>
              </div>
            </motion.button>
          ))}
        </Stagger>
      )}

      <Dialog
        side="right"
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? 'Edit author' : 'New author'}
        description="Shown under the posts they write, and on their profile page."
        footer={
          <>
            {editing?.id && (
              <Button variant="danger-ghost" className="mr-auto" onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="brand" loading={busy} onClick={submit}>
              {editing?.id ? 'Save' : 'Add author'}
            </Button>
          </>
        }
      >
        {editing && (
          <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), void submit())}>
            {errors.form && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{errors.form}</p>}
            <div className="flex items-center gap-5">
              {uploadsEnabled ? (
                <ImageDrop workspace={workspace} kind="avatar" round value={editing.avatar} onChange={(img) => set({ avatar: img })} />
              ) : (
                <Avatar name={editing.name || '?'} size={96} />
              )}
              <p className="text-[13px] leading-relaxed text-muted">
                {uploadsEnabled ? 'A square photo works best. Drop it on the circle.' : 'Photos need Cloudinary keys on the server.'}
              </p>
            </div>
            {editing.avatar && (
              <Field label="Photo alt text" error={errors.avatarAlt}>
                {(p) => <Input {...p} value={editing.avatarAlt ?? ''} onChange={(e) => set({ avatarAlt: e.target.value })} maxLength={125} />}
              </Field>
            )}
            <Field label="Name" error={errors.name}>
              {(p) => <Input {...p} value={editing.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoFocus />}
            </Field>
            <Field label="Role" error={errors.role} hint="e.g. Head of design">
              {(p) => <Input {...p} value={editing.role ?? ''} onChange={(e) => set({ role: e.target.value })} maxLength={80} />}
            </Field>
            <Field label="Bio" error={errors.bio} counter={{ value: (editing.bio ?? '').length, max: 600 }}>
              {(p) => <Textarea {...p} value={editing.bio ?? ''} onChange={(e) => set({ bio: e.target.value })} maxLength={600} rows={4} />}
            </Field>
            <Field label="Profile address" error={errors.slug} hint="Locked once they have a published post.">
              {(p) => <Input {...p} value={editing.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="from-their-name" className="font-mono text-[13px]" />}
            </Field>
            <div className="grid gap-4">
              <Field label="LinkedIn" error={errors.linkedinUrl}>
                {(p) => <Input {...p} value={editing.linkedinUrl ?? ''} onChange={(e) => set({ linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />}
              </Field>
              <Field label="X" error={errors.xUrl}>
                {(p) => <Input {...p} value={editing.xUrl ?? ''} onChange={(e) => set({ xUrl: e.target.value })} placeholder="https://x.com/…" />}
              </Field>
              <Field label="Website" error={errors.websiteUrl}>
                {(p) => <Input {...p} value={editing.websiteUrl ?? ''} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder="https://…" />}
              </Field>
            </div>
            <button type="submit" className="hidden" />
          </form>
        )}
      </Dialog>

      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this author?"
        description="Their posts stay published, under the company byline instead."
        confirmLabel="Delete author"
        danger
        onConfirm={async () => {
          if (!editing?.id) return
          const r = await deleteAuthor(workspace, editing.id)
          if (r.ok) {
            toast.success('Author deleted', { description: r.unassigned ? `${r.unassigned} posts now show the company byline.` : undefined })
            setConfirm(false)
            setEditing(null)
            router.refresh()
          } else toast.error(r.error)
        }}
      />
    </>
  )
}
