'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EditorContent, Extension, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Image as TiptapImage } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  CheckCircle,
  CloudCheck,
  Eye,
  PaperPlaneRight,
  SidebarSimple,
  Trash,
  CalendarBlank,
  ArrowCounterClockwise,
  FloppyDisk,
  Warning,
} from '@phosphor-icons/react'
import { deletePost, previewLink, savePost, type Intent, type SaveResult } from '@/lib/actions/posts'
import { adoptRemoteImage } from '@/lib/actions/content'
import { startUpload } from '@/lib/cloudinary/upload-client'
import { bodyUrl, isStoredImageSrc } from '@/lib/cloudinary/url'
import { ACCEPT_ATTRIBUTE, type CloudinaryImage } from '@/lib/cloudinary/types'
import { slugify } from '@/lib/slug'
import { Avatar } from '@/components/ui/avatar'
import { Button, Spinner } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { Field, Input } from '@/components/ui/field'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Segmented } from '@/components/ui/segmented'
import { StatusPill, type StatusKind } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import { FaqFields, type FaqDraft } from './faq-fields'
import { HtmlEditor } from './html-editor'
import { ImageDrop } from './image-drop'
import { ScheduleDialog } from './schedule-dialog'
import { SeoPanel } from './seo-panel'
import { TagInput } from './tag-input'
import { EditorToolbar, SelectionBubble } from './toolbar'

export type EditorPost = {
  id: string
  title: string
  slug: string
  description: string
  excerpt: string
  format: 'editor' | 'html'
  contentHtml: string
  coverImage: CloudinaryImage | null
  coverAlt: string
  coverCaption: string
  category: string
  tags: string[]
  faqs: { question: string; answer: string }[]
  authorId: string
  seoTitle: string
  focusKeyword: string
  status: StatusKind
  publishedAt: string | null
  everLive: boolean
  updatedAt: string
}

export type EditorContext = {
  workspace: string
  siteUrl: string
  basePath: string
  htmlPages: boolean
  faqsEnabled: boolean
  authorsEnabled: boolean
  canPublish: boolean
  canDelete: boolean
  authors: { id: string; name: string; role: string | null }[]
  usedTags: string[]
  usedCategories: string[]
  uploadsEnabled: boolean
}

/* A link may carry data-button="" (solid) or "outline" — the sanitiser allows exactly this. */
const LinkButton = Extension.create({
  name: 'linkButton',
  addGlobalAttributes() {
    return [
      {
        types: ['link'],
        attributes: {
          button: {
            default: null,
            parseHTML: (el) => (el.hasAttribute('data-button') ? (el.getAttribute('data-button') === 'outline' ? 'outline' : 'solid') : null),
            renderHTML: (attrs) => (attrs.button ? { 'data-button': attrs.button === 'outline' ? 'outline' : '' } : {}),
          },
        },
      },
    ]
  },
})

const AUTOSAVE_MS = 2500

type Panel = 'post' | 'seo' | 'faq'

export function PostEditor({ post, ctx }: { post: EditorPost | null; ctx: EditorContext }) {
  const router = useRouter()
  const [id, setId] = useState(post?.id)
  const [format, setFormat] = useState<'editor' | 'html'>(post?.format ?? 'editor')
  const [title, setTitle] = useState(post?.title ?? '')
  const [slug, setSlug] = useState(post?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(post))
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '')
  const [description, setDescription] = useState(post?.description ?? '')
  const [category, setCategory] = useState(post?.category ?? '')
  const [tags, setTags] = useState<string[]>(post?.tags ?? [])
  const [cover, setCover] = useState<CloudinaryImage | null>(post?.coverImage ?? null)
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? '')
  const [coverCaption, setCoverCaption] = useState(post?.coverCaption ?? '')
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? '')
  const [focusKeyword, setFocusKeyword] = useState(post?.focusKeyword ?? '')
  const [authorId, setAuthorId] = useState(post?.authorId ?? '')
  const [faqs, setFaqs] = useState<FaqDraft[]>((post?.faqs ?? []).map((f, i) => ({ ...f, key: `f${i}` })))
  const [pageHtml, setPageHtml] = useState(post?.format === 'html' ? post.contentHtml : '')
  const [status, setStatus] = useState<StatusKind>(post?.status ?? 'draft')
  const [publishedAt, setPublishedAt] = useState<string | null>(post?.publishedAt ?? null)
  const [everLive, setEverLive] = useState(post?.everLive ?? false)

  const [panel, setPanel] = useState<Panel>('post')
  const [panelOpen, setPanelOpen] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Intent | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(post?.updatedAt ?? null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [celebrate, setCelebrate] = useState<null | 'published' | 'scheduled' | 'review'>(null)
  const [bodyVersion, setBodyVersion] = useState(0)
  const [adopting, setAdopting] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const seen = useRef(new Set<string>())

  const touch = useCallback(() => setDirty(true), [])

  const adoptForeign = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return
    const foreign = new Set<string>()
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        const src = String(node.attrs.src ?? '')
        if (src && !isStoredImageSrc(src) && !seen.current.has(src)) foreign.add(src)
      }
      return true
    })
    if (!foreign.size) return
    for (const src of foreign) seen.current.add(src)
    setAdopting((n) => n + foreign.size)
    let failed = 0
    await Promise.all(
      [...foreign].map(async (src) => {
        const result = ctx.uploadsEnabled ? await adoptRemoteImage(ctx.workspace, src) : { ok: false as const, error: '' }
        const live = editorRef.current
        if (live) {
          const tr = live.state.tr
          const hits: { pos: number; size: number }[] = []
          live.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.src === src) hits.push({ pos, size: node.nodeSize })
            return true
          })
          for (const h of hits.reverse()) {
            if (result.ok) tr.setNodeMarkup(h.pos, undefined, { ...live.state.doc.nodeAt(h.pos)!.attrs, src: result.url })
            else {
              tr.delete(h.pos, h.pos + h.size)
              failed++
            }
          }
          live.view.dispatch(tr)
        }
        setAdopting((n) => n - 1)
      })
    )
    if (failed) toast.error(`${failed} pasted ${failed === 1 ? 'image' : 'images'} could not be copied in`, { description: 'Upload them with the image button instead.' })
  }, [ctx.uploadsEnabled, ctx.workspace])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4, 5, 6] }, link: { openOnClick: false, autolink: true } }),
      TiptapImage.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      LinkButton,
      Placeholder.configure({ placeholder: 'Tell the story…' }),
    ],
    content: post?.format === 'editor' ? post.contentHtml : '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose-editor tiptap-editing min-h-[50vh] focus:outline-none', 'aria-label': 'Post body' },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        void insertFiles(files)
        return true
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        void insertFiles(files)
        return true
      },
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e
    },
    onUpdate: () => {
      touch()
      setBodyVersion((v) => v + 1)
      void adoptForeign()
    },
  })

  async function insertFiles(files: File[]) {
    if (!ctx.uploadsEnabled) {
      toast.error('Image uploads are not set up on this server yet.')
      return
    }
    for (const file of files) {
      setAdopting((n) => n + 1)
      const result = await startUpload(ctx.workspace, file, 'body').done
      setAdopting((n) => n - 1)
      if (result.ok) editorRef.current?.chain().focus().setImage({ src: bodyUrl(result.image.publicId), alt: file.name.replace(/\.[a-z0-9]+$/i, '') }).run()
      else toast.error(result.error)
    }
  }

  /* Derived from the body, for the SEO checks. */
  const bodyStats = useMemo(() => {
    void bodyVersion
    const html = format === 'html' ? pageHtml : (editor?.getHTML() ?? post?.contentHtml ?? '')
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
    return { text, words: text.split(/\s+/).filter(Boolean).length, hasHeading: /<h[2-6]\b/i.test(html) }
  }, [bodyVersion, editor, format, pageHtml, post?.contentHtml])

  const effectiveSlug = slugTouched || everLive ? slug : slugify(title)

  const save = useCallback(
    async (intent: Intent, opts: { publishAt?: Date; silent?: boolean } = {}): Promise<SaveResult | null> => {
      if (adopting > 0) {
        if (!opts.silent) toast('Still copying images in — one moment.')
        return null
      }
      setBusy(intent)
      const contentHtml = format === 'html' ? pageHtml : (editorRef.current?.getHTML() ?? '')
      const result = await savePost(ctx.workspace, {
        id,
        title,
        slug: effectiveSlug,
        description,
        excerpt,
        tags,
        faqs: faqs.map(({ question, answer }) => ({ question, answer })),
        category,
        format,
        contentHtml,
        authorId,
        coverImage: format === 'html' ? null : cover,
        coverAlt,
        coverCaption,
        seoTitle,
        focusKeyword,
        intent,
        publishAt: opts.publishAt?.toISOString(),
      })
      setBusy(null)
      if (!result.ok) {
        setErrors(result.errors)
        if (!opts.silent) {
          const first = Object.values(result.errors)[0]
          toast.error('Not saved', { description: first })
          if (result.errors.description || result.errors.seoTitle || result.errors.focusKeyword) {
            setPanel('seo')
            setPanelOpen(true)
          }
        }
        return result
      }
      setErrors({})
      setDirty(false)
      setSavedAt(new Date().toISOString())
      setSlug(result.slug)
      setSlugTouched(true)
      setPublishedAt(result.publishedAt)
      const now = new Date()
      const display: StatusKind =
        result.status === 'published' && result.publishedAt && new Date(result.publishedAt) > now ? 'scheduled' : result.status
      setStatus(display)
      if (display === 'published') setEverLive(true)
      if (result.warning) toast.warning(result.warning)
      if (intent === 'publish') setCelebrate('published')
      else if (intent === 'schedule') setCelebrate('scheduled')
      else if (intent === 'review') setCelebrate('review')
      else if (intent === 'unpublish') toast.success('Unpublished', { description: 'It is no longer on the site.' })
      else if (!opts.silent) toast.success('Saved')
      if (!id) {
        setId(result.id)
        router.replace(`/${ctx.workspace}/posts/${result.id}`, { scroll: false })
      }
      return result
    },
    [adopting, format, pageHtml, ctx.workspace, id, title, effectiveSlug, description, excerpt, tags, faqs, category, authorId, cover, coverAlt, coverCaption, seoTitle, focusKeyword, router]
  )

  /* Autosave drafts only — a live post changes the public site, so it waits for "Update". */
  useEffect(() => {
    if (!dirty || busy || status === 'published' || status === 'scheduled') return
    if (!title.trim()) return
    const t = setTimeout(() => void save('save', { silent: true }), AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [dirty, busy, status, title, save, bodyVersion, excerpt, description, tags, cover, faqs, pageHtml])

  /* ⌘S saves. Leaving with unsaved changes asks first. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save('save')
      }
    }
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onLeave)
    }
  }, [save, dirty])

  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(null), 2200)
    return () => clearTimeout(t)
  }, [celebrate])

  async function openPreview() {
    if (dirty || !id) {
      const r = await save('save', { silent: true })
      if (!r?.ok) {
        toast.error('Save the post before previewing.')
        return
      }
    }
    const r = await previewLink(ctx.workspace, id ?? '')
    if (r.ok) window.open(r.url, '_blank', 'noopener')
    else toast.error(r.error)
  }

  const live = status === 'published'
  const primary: { label: string; intent: Intent | 'schedule-dialog'; icon: React.ReactNode } = ctx.canPublish
    ? status === 'scheduled'
      ? { label: 'Reschedule', intent: 'schedule-dialog', icon: <CalendarBlank weight="bold" /> }
      : live
        ? { label: 'Update', intent: 'publish', icon: <CloudCheck weight="bold" /> }
        : { label: 'Publish', intent: 'publish', icon: <PaperPlaneRight weight="bold" /> }
    : status === 'review'
      ? { label: 'Save', intent: 'save', icon: <FloppyDisk weight="bold" /> }
      : { label: 'Send for review', intent: 'review', icon: <PaperPlaneRight weight="bold" /> }

  return (
    <div className="-mx-5 -mt-8 sm:-mx-8 lg:-mx-12 lg:-mt-12">
      {/* Top bar */}
      <div className="sticky top-14 z-20 flex h-16 items-center gap-2 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl sm:px-6 lg:top-0 lg:rounded-t-[26px]">
        <Link href={`/${ctx.workspace}/posts`} className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink" aria-label="Back to posts">
          <ArrowLeft size={18} />
        </Link>
        <StatusPill status={status} />
        <SaveIndicator busy={busy !== null} dirty={dirty} savedAt={savedAt} adopting={adopting} errored={Object.keys(errors).length > 0} />
        <span className="flex-1" />
        {ctx.siteUrl && (
          <Button variant="ghost" size="sm" onClick={openPreview} className="hidden sm:inline-flex">
            <Eye /> Preview
          </Button>
        )}
        {live && ctx.siteUrl && (
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <a href={`${ctx.siteUrl}${ctx.basePath}/${slug}`} target="_blank" rel="noreferrer">
              <ArrowSquareOut /> View
            </a>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen((o) => !o)} aria-label="Toggle details panel" className={cn(panelOpen && 'bg-sunken text-ink')}>
          <SidebarSimple />
        </Button>
        <div className="flex items-center">
          <Button
            variant="brand"
            size="sm"
            className="rounded-r-none pr-3.5"
            loading={busy === primary.intent || (primary.intent === 'schedule-dialog' && busy === 'schedule')}
            onClick={() => (primary.intent === 'schedule-dialog' ? setScheduleOpen(true) : void save(primary.intent))}
          >
            {primary.icon}
            {primary.label}
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="brand" size="sm" className="rounded-l-none border-l border-black/10 px-2" aria-label="More publish options">
                <CaretDown weight="bold" />
              </Button>
            </MenuTrigger>
            <MenuContent className="w-60">
              {!live && status !== 'scheduled' && (
                <MenuItem onSelect={() => void save('save')}>
                  <FloppyDisk /> Save draft
                </MenuItem>
              )}
              {ctx.canPublish && !live && (
                <MenuItem onSelect={() => setScheduleOpen(true)}>
                  <CalendarBlank /> Schedule…
                </MenuItem>
              )}
              {ctx.canPublish && status === 'scheduled' && (
                <MenuItem onSelect={() => void save('publish')}>
                  <PaperPlaneRight /> Publish now
                </MenuItem>
              )}
              {!ctx.canPublish && status === 'draft' && (
                <MenuItem onSelect={() => void save('review')}>
                  <PaperPlaneRight /> Send for review
                </MenuItem>
              )}
              {status === 'review' && (
                <MenuItem onSelect={() => void save('withdraw')}>
                  <ArrowCounterClockwise /> {ctx.canPublish ? 'Return to draft' : 'Withdraw from review'}
                </MenuItem>
              )}
              {ctx.canPublish && (live || status === 'scheduled') && (
                <MenuItem onSelect={() => void save('unpublish')}>
                  <ArrowCounterClockwise /> Unpublish
                </MenuItem>
              )}
              {id && (ctx.canDelete || (!everLive && status !== 'published')) && (
                <>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setConfirmDelete(true)}>
                    <Trash /> Delete post
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row">
        {/* Writing column */}
        <div className="min-w-0 flex-1 px-5 pb-24 pt-10 sm:px-10">
          <div className={cn('mx-auto', format === 'html' ? 'max-w-none' : 'max-w-[720px]')}>
            {errors.form && (
              <div role="alert" className="mb-6 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                <Warning size={18} className="mt-0.5 shrink-0" />
                {errors.form}
              </div>
            )}
            {format === 'editor' ? (
              <>
                <AutoTextarea
                  value={title}
                  onChange={(v) => {
                    setTitle(v)
                    touch()
                  }}
                  placeholder="Title"
                  ariaLabel="Title"
                  className="font-serif text-[44px] leading-[1.02] tracking-[-0.02em] text-ink placeholder:text-faint sm:text-[56px]"
                />
                {errors.title && <p className="mt-1 text-[13px] font-medium text-danger">{errors.title}</p>}
                <AutoTextarea
                  value={excerpt}
                  onChange={(v) => {
                    setExcerpt(v)
                    touch()
                  }}
                  placeholder="Add a byline — the line readers see under the title"
                  ariaLabel="Byline description"
                  className="mt-4 text-[19px] leading-relaxed text-ink-2 placeholder:text-faint"
                />
                <div className="sticky top-[120px] z-10 -mx-3 mt-8 rounded-2xl border border-line bg-surface/90 px-1.5 py-1 shadow-card backdrop-blur-xl lg:top-[64px]">
                  {editor && <EditorToolbar editor={editor} onImage={() => fileInput.current?.click()} />}
                </div>
                <div className="mt-8">
                  {editor ? <EditorContent editor={editor} /> : <div className="skeleton h-64" />}
                  {editor && <SelectionBubble editor={editor} />}
                </div>
                {errors.content && <p className="mt-2 text-[13px] font-medium text-danger">{errors.content}</p>}
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])]
                    e.target.value = ''
                    if (files.length) void insertFiles(files)
                  }}
                />
              </>
            ) : (
              <HtmlEditor
                value={pageHtml}
                onChange={(v) => {
                  setPageHtml(v)
                  touch()
                }}
                error={errors.title || errors.description || errors.content}
              />
            )}
          </div>
        </div>

        {/* Details panel: a sticky column on wide screens, a section below the text otherwise */}
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 34 }}
              className="shrink-0 border-t border-line xl:sticky xl:top-16 xl:h-[calc(100dvh-88px)] xl:w-[380px] xl:border-l xl:border-t-0"
            >
              <div className="mx-auto h-full max-w-[720px] overflow-y-auto px-5 py-8 sm:px-10 xl:max-w-none xl:px-6 xl:py-6">{detailsPanel()}</div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        initial={publishedAt ? new Date(publishedAt) : null}
        error={errors.publishAt}
        busy={busy === 'schedule'}
        onSchedule={async (when) => {
          const r = await save('schedule', { publishAt: when })
          if (r?.ok) setScheduleOpen(false)
        }}
      />
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this post?"
        description={live ? 'It is live — it will disappear from the site straight away. This cannot be undone.' : 'This cannot be undone.'}
        confirmLabel="Delete post"
        danger
        onConfirm={async () => {
          if (!id) return
          const r = await deletePost(ctx.workspace, id)
          if (r.ok) {
            setDirty(false)
            toast.success('Post deleted')
            router.push(`/${ctx.workspace}/posts`)
          } else toast.error(r.error)
        }}
      />
      <Celebration kind={celebrate} />
    </div>
  )

  function detailsPanel() {
    const panels: { value: Panel; label: string }[] = [
      { value: 'post', label: 'Post' },
      ...(format === 'editor' ? [{ value: 'seo' as const, label: 'SEO' }] : []),
      ...(ctx.faqsEnabled ? [{ value: 'faq' as const, label: 'FAQ' }] : []),
    ]
    const current = panels.some((p) => p.value === panel) ? panel : 'post'
    return (
      <div className="flex flex-col gap-6">
        <Segmented size="sm" value={current} onChange={setPanel} options={panels} className="self-start" />
        <AnimatePresence mode="wait">
          <motion.div key={current} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="flex flex-col gap-6">
            {current === 'post' && (
              <>
                {ctx.htmlPages && !everLive && (
                  <Field label="Format" hint={format === 'html' ? 'A finished page, pasted as HTML. Title and description come from its <head>.' : 'Write here with the rich editor.'}>
                    {() => (
                      <Segmented
                        size="sm"
                        value={format}
                        onChange={(v) => {
                          setFormat(v)
                          touch()
                        }}
                        options={[
                          { value: 'editor', label: 'Rich editor' },
                          { value: 'html', label: 'HTML page' },
                        ]}
                      />
                    )}
                  </Field>
                )}
                {format === 'editor' && (
                  <div className="flex flex-col gap-3">
                    <span className="text-[13px] font-medium text-ink-2">Cover image</span>
                    {ctx.uploadsEnabled ? (
                      <ImageDrop
                        workspace={ctx.workspace}
                        kind="cover"
                        value={cover}
                        onChange={(img) => {
                          setCover(img)
                          touch()
                        }}
                      />
                    ) : (
                      <p className="rounded-2xl bg-sunken px-4 py-3 text-[13px] text-muted">Image uploads need Cloudinary keys on the server. See the README.</p>
                    )}
                    {errors.cover && <p className="text-[12.5px] font-medium text-danger">{errors.cover}</p>}
                    {cover && (
                      <>
                        <Field label="Alt text" error={errors.coverAlt} hint="Describe the image for people who cannot see it.">
                          {(p) => <Input {...p} value={coverAlt} maxLength={125} onChange={(e) => (setCoverAlt(e.target.value), touch())} />}
                        </Field>
                        <Field label="Caption" error={errors.coverCaption}>
                          {(p) => <Input {...p} value={coverCaption} maxLength={125} onChange={(e) => (setCoverCaption(e.target.value), touch())} />}
                        </Field>
                      </>
                    )}
                  </div>
                )}
                <Field
                  label="Address"
                  error={errors.slug}
                  hint={everLive ? 'Locked — the post has been live, and links to it may exist.' : undefined}
                >
                  {(p) => (
                    <div className="flex items-center overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_1.5px_var(--brand),var(--ring)]">
                      <span className="shrink-0 bg-surface-2 py-2.5 pl-3 pr-1 font-mono text-[12px] text-faint">{ctx.basePath}/</span>
                      <input
                        {...p}
                        value={effectiveSlug}
                        disabled={everLive}
                        onChange={(e) => {
                          setSlug(slugify(e.target.value) || e.target.value.toLowerCase())
                          setSlugTouched(true)
                          touch()
                        }}
                        className="h-10 min-w-0 flex-1 bg-surface pr-3 font-mono text-[13px] text-ink focus:outline-none disabled:text-muted"
                      />
                    </div>
                  )}
                </Field>
                {format === 'editor' && !excerpt && null}
                <Field label="Category" error={errors.category}>
                  {(p) => (
                    <>
                      <Input {...p} value={category} list="cms-categories" maxLength={60} onChange={(e) => (setCategory(e.target.value), touch())} placeholder="e.g. Guides" />
                      <datalist id="cms-categories">
                        {ctx.usedCategories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
                <Field label="Tags" error={errors.tags}>
                  {() => (
                    <TagInput
                      value={tags}
                      onChange={(t) => {
                        setTags(t)
                        touch()
                      }}
                      suggestions={ctx.usedTags}
                    />
                  )}
                </Field>
                {ctx.authorsEnabled && (
                  <Field label="Author">
                    {() => (
                      <div className="flex flex-col gap-1">
                        {[{ id: '', name: 'No author (the company)', role: null }, ...ctx.authors].map((a) => (
                          <button
                            key={a.id || 'none'}
                            type="button"
                            onClick={() => {
                              setAuthorId(a.id)
                              touch()
                            }}
                            className={cn(
                              'flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition',
                              authorId === a.id ? 'bg-surface shadow-[inset_0_0_0_1.5px_var(--ink)]' : 'hover:bg-sunken'
                            )}
                          >
                            {a.id ? <Avatar name={a.name} size={28} /> : <span className="grid size-7 place-items-center rounded-full bg-sunken text-[11px] text-muted">—</span>}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-ink">{a.name}</span>
                              {a.role && <span className="block truncate text-[12px] text-muted">{a.role}</span>}
                            </span>
                            {authorId === a.id && <CheckCircle size={18} weight="fill" className="text-ink" />}
                          </button>
                        ))}
                        {ctx.authors.length === 0 && (
                          <Link href={`/${ctx.workspace}/authors`} className="px-2.5 text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline">
                            Add authors →
                          </Link>
                        )}
                      </div>
                    )}
                  </Field>
                )}
              </>
            )}
            {current === 'seo' && (
              <SeoPanel
                siteUrl={ctx.siteUrl}
                basePath={ctx.basePath}
                title={title}
                seoTitle={seoTitle}
                description={description}
                slug={effectiveSlug}
                focusKeyword={focusKeyword}
                bodyText={bodyStats.text}
                words={bodyStats.words}
                hasCover={Boolean(cover)}
                coverAlt={coverAlt}
                hasHeading={bodyStats.hasHeading}
                tagCount={tags.length}
                errors={errors}
                onSeoTitle={(v) => (setSeoTitle(v), touch())}
                onDescription={(v) => (setDescription(v), touch())}
                onFocusKeyword={(v) => (setFocusKeyword(v), touch())}
              />
            )}
            {current === 'faq' && (
              <FaqFields
                value={faqs}
                onChange={(v) => {
                  setFaqs(v)
                  touch()
                }}
                error={errors.faqs}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }
}

function AutoTextarea({ value, onChange, placeholder, className, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; ariaLabel: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      placeholder={placeholder}
      className={cn('block w-full resize-none overflow-hidden bg-transparent focus:outline-none focus:shadow-none', className)}
    />
  )
}

function SaveIndicator({ busy, dirty, savedAt, adopting, errored }: { busy: boolean; dirty: boolean; savedAt: string | null; adopting: number; errored: boolean }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  let content: React.ReactNode
  if (adopting > 0) content = <><Spinner className="size-3.5" /> Copying images…</>
  else if (busy) content = <><Spinner className="size-3.5" /> Saving…</>
  else if (errored && dirty) content = <span className="text-danger">Not saved</span>
  else if (dirty) content = 'Unsaved changes'
  else if (savedAt) content = <><CloudCheck size={15} className="text-ok" /> Saved <TimeAgo date={savedAt} /></>
  else content = 'New post'
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={busy ? 'busy' : dirty ? 'dirty' : 'saved'}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="ml-1 hidden items-center gap-1.5 text-[12.5px] text-muted sm:flex"
        aria-live="polite"
      >
        {content}
      </motion.span>
    </AnimatePresence>
  )
}

/** A moment of delight on publish: a ring draws, a check pops, the word lands. */
function Celebration({ kind }: { kind: null | 'published' | 'scheduled' | 'review' }) {
  const label = kind === 'published' ? 'Published' : kind === 'scheduled' ? 'Scheduled' : 'Sent for review'
  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          className="pointer-events-none fixed inset-0 z-[60] grid place-items-center"
          role="status"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="flex flex-col items-center gap-4 rounded-[32px] bg-ink px-12 py-10 text-canvas shadow-float"
          >
            <svg viewBox="0 0 80 80" className="size-20">
              <motion.circle cx="40" cy="40" r="34" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0, rotate: -90 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ originX: '50%', originY: '50%' }} />
              <motion.path d="M26 41 L36 51 L55 31" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.35 }} />
            </svg>
            <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="font-serif text-[40px] leading-none">
              {label}
            </motion.span>
            {[...Array(14)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute size-2 rounded-full"
                style={{ background: i % 3 === 0 ? 'var(--brand)' : i % 3 === 1 ? 'white' : 'color-mix(in oklab, var(--brand) 50%, white)' }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos((i / 14) * Math.PI * 2) * (140 + (i % 4) * 30),
                  y: Math.sin((i / 14) * Math.PI * 2) * (110 + (i % 3) * 30),
                  opacity: 0,
                  scale: 0.4,
                }}
                transition={{ delay: 0.35, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
