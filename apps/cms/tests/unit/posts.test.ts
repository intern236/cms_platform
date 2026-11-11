import { beforeAll, describe, expect, it } from 'vitest'
import { deletePost, savePost } from '@/lib/actions/posts'
import { inviteMember, removeMember, saveSiteSettings, setMemberRole, createKey } from '@/lib/actions/workspace'
import { removeMessage, setMessageState, saveAuthor } from '@/lib/actions/content'
import { inWorkspace } from '@/lib/db'
import { displayStatus, getPost, livePostBySlug, livePosts } from '@/lib/content/posts'
import { readSettings } from '@/lib/workspaces/settings'
import { makeWorkspace, member, patchPost, post, signInAs } from './fixtures'

let ws: Awaited<ReturnType<typeof makeWorkspace>>
let owner: Awaited<ReturnType<typeof member>>
let editor: Awaited<ReturnType<typeof member>>
let writer: Awaited<ReturnType<typeof member>>
let writer2: Awaited<ReturnType<typeof member>>
const S = 'roles-ws'

beforeAll(async () => {
  ws = await makeWorkspace(S)
  owner = await member(ws.id, 'owner')
  editor = await member(ws.id, 'editor')
  writer = await member(ws.id, 'writer')
  writer2 = await member(ws.id, 'writer')
})

const read = (id: string) => inWorkspace(ws.id, (tx) => getPost(tx, ws.id, id))

describe('publishing lifecycle', () => {
  it('a draft can be rough; publishing needs a description and a body', async () => {
    await signInAs(editor)
    const draft = await savePost(S, post({ title: 'Rough', description: '', contentHtml: '' }))
    expect(draft.ok).toBe(true)
    const id = (draft as { id: string }).id
    const pub = await savePost(S, post({ id, title: 'Rough', description: '', contentHtml: '', intent: 'publish' }))
    expect(pub.ok).toBe(false)
    expect((pub as { errors: Record<string, string> }).errors).toHaveProperty('description')
  })

  it('publish → live; unpublish → gone; republish keeps the original date', async () => {
    await signInAs(editor)
    const r = await savePost(S, post({ title: 'Lifecycle post', intent: 'publish' }))
    expect(r.ok).toBe(true)
    const { id, publishedAt } = r as { id: string; publishedAt: string }
    expect(await inWorkspace(ws.id, (tx) => livePostBySlug(tx, ws.id, 'lifecycle-post'))).not.toBeNull()
    await savePost(S, post({ id, title: 'Lifecycle post', intent: 'unpublish' }))
    expect(await inWorkspace(ws.id, (tx) => livePostBySlug(tx, ws.id, 'lifecycle-post'))).toBeNull()
    const again = (await savePost(S, post({ id, title: 'Lifecycle post', intent: 'publish' }))) as { publishedAt: string }
    expect(again.publishedAt).toBe(publishedAt)
  })

  it('the address locks once a post has been live', async () => {
    await signInAs(editor)
    const r = (await savePost(S, post({ title: 'Locked slug', intent: 'publish' }))) as { id: string }
    const renamed = (await savePost(S, post({ id: r.id, title: 'Locked slug', slug: 'new-address', intent: 'publish' }))) as { slug: string }
    expect(renamed.slug).toBe('locked-slug')
  })

  it('a published post keeps its format', async () => {
    await signInAs(editor)
    const r = (await savePost(S, post({ title: 'Format lock', intent: 'publish' }))) as { id: string }
    const swap = await savePost(S, post({ id: r.id, format: 'html', contentHtml: '<html><head><title>T</title><meta name="description" content="d"></head><body>x</body></html>', intent: 'publish' }))
    expect(swap.ok).toBe(false)
  })

  it('scheduling: hidden until its time, shown as scheduled', async () => {
    await signInAs(editor)
    const when = new Date(Date.now() + 3 * 86_400_000)
    const r = (await savePost(S, post({ title: 'Future post', intent: 'schedule', publishAt: when.toISOString() }))) as { id: string }
    const p = await read(r.id)
    expect(displayStatus(p!)).toBe('scheduled')
    expect(await inWorkspace(ws.id, (tx) => livePostBySlug(tx, ws.id, 'future-post'))).toBeNull()
    // Time passes: pretend the scheduled moment arrived.
    await patchPost(ws.id, r.id, { publishedAt: new Date(Date.now() - 1000) })
    expect(await inWorkspace(ws.id, (tx) => livePostBySlug(tx, ws.id, 'future-post'))).not.toBeNull()
  })

  it('refuses a schedule in the past or years away', async () => {
    await signInAs(editor)
    expect((await savePost(S, post({ title: 'Past', intent: 'schedule', publishAt: new Date(Date.now() - 60_000).toISOString() }))).ok).toBe(false)
    expect((await savePost(S, post({ title: 'Far', intent: 'schedule', publishAt: new Date(Date.now() + 5 * 365 * 86_400_000).toISOString() }))).ok).toBe(false)
    expect((await savePost(S, post({ title: 'Garbage', intent: 'schedule', publishAt: 'tomorrowish' }))).ok).toBe(false)
  })

  it('slugs are unique per workspace, tidied on the server, and reserved words refused', async () => {
    await signInAs(editor)
    expect((await savePost(S, post({ title: 'Same name' }))).ok).toBe(true)
    expect((await savePost(S, post({ title: 'Same name' }))).ok).toBe(false)
    const tidy = (await savePost(S, post({ title: 'x', slug: '  Café ÜBER/../<script> ' }))) as { slug: string }
    expect(tidy.slug).toBe('cafe-uber-script')
    expect((await savePost(S, post({ title: 'x', slug: 'tag' }))).ok).toBe(false)
    expect((await savePost(S, post({ title: 'x', slug: 'page' }))).ok).toBe(false)
  })

  it('the same slug is fine in another workspace', async () => {
    const other = await makeWorkspace('roles-other')
    const o = await member(other.id, 'editor')
    await signInAs(o)
    expect((await savePost('roles-other', post({ title: 'Same name' }))).ok).toBe(true)
  })

  it('stores sanitised HTML only', async () => {
    await signInAs(editor)
    const r = (await savePost(S, post({ title: 'Dirty', contentHtml: '<p onclick="x()">hi<script>alert(1)</script><img src=x onerror=alert(1)></p>' }))) as { id: string }
    const p = await read(r.id)
    expect(p!.contentHtml).toBe('<p>hi</p>')
  })

  it('coerces hostile payload shapes', async () => {
    await signInAs(editor)
    const r = await savePost(S, {
      ...post({ title: 'Shapes' }),
      title: { $gt: '' } as unknown as string,
      tags: [{ evil: 1 }, 'ok'] as unknown as string[],
      faqs: 'nope' as unknown as [],
      intent: 'delete-everything' as unknown as 'save',
    })
    expect(r.ok).toBe(false)
    const r2 = (await savePost(S, { ...post({ title: 'Shapes 2' }), tags: [{ evil: 1 }, 'ok'] as unknown as string[], intent: 'nuke' as unknown as 'save' })) as { id: string; status: string }
    expect(r2.status).toBe('draft')
    expect((await read(r2.id))!.tags).toEqual(['ok'])
  })

  it('caps sizes before doing any work', async () => {
    await signInAs(editor)
    expect((await savePost(S, post({ title: 'Huge', contentHtml: 'x'.repeat(400_001) }))).ok).toBe(false)
    expect((await savePost(S, post({ title: 'T'.repeat(161) }))).ok).toBe(false)
  })
})

describe('writers', () => {
  it('can draft and send for review, but cannot publish, schedule or unpublish', async () => {
    await signInAs(writer)
    const d = (await savePost(S, post({ title: 'Writer draft' }))) as { id: string }
    expect((await savePost(S, post({ id: d.id, title: 'Writer draft', intent: 'publish' }))).ok).toBe(false)
    expect((await savePost(S, post({ id: d.id, title: 'Writer draft', intent: 'schedule', publishAt: new Date(Date.now() + 86_400_000).toISOString() }))).ok).toBe(false)
    const rev = (await savePost(S, post({ id: d.id, title: 'Writer draft', intent: 'review' }))) as { status: string }
    expect(rev.status).toBe('review')
    expect(((await savePost(S, post({ id: d.id, title: 'Writer draft', intent: 'withdraw' }))) as { status: string }).status).toBe('draft')
  })

  it("cannot touch someone else's post", async () => {
    await signInAs(writer2)
    const theirs = (await savePost(S, post({ title: 'Writer2 post' }))) as { id: string }
    await signInAs(writer)
    expect((await savePost(S, post({ id: theirs.id, title: 'hijacked' }))).ok).toBe(false)
    expect((await deletePost(S, theirs.id)).ok).toBe(false)
  })

  it('cannot edit their own post once an editor published it', async () => {
    await signInAs(writer)
    const d = (await savePost(S, post({ title: 'To be published' }))) as { id: string }
    await savePost(S, post({ id: d.id, title: 'To be published', intent: 'review' }))
    await signInAs(editor)
    expect((await savePost(S, post({ id: d.id, title: 'To be published', intent: 'publish' }))).ok).toBe(true)
    await signInAs(writer)
    expect((await savePost(S, post({ id: d.id, title: 'Writer edits live post' }))).ok).toBe(false)
  })

  it('a writer cannot save over a post marked published', async () => {
    await signInAs(writer)
    const d = (await savePost(S, post({ title: 'Writer sneaky' }))) as { id: string }
    // Even if somehow marked published while still editable, a writer's "save" never keeps it published.
    await patchPost(ws.id, d.id, { status: 'published', publishedAt: null })
    const r = await savePost(S, post({ id: d.id, title: 'Writer sneaky' }))
    expect(r.ok).toBe(false)
  })

  it('cannot read the inbox, manage people, settings, keys or authors', async () => {
    await signInAs(writer)
    expect((await setMessageState(S, '000000000000000000000000', { read: true })).ok).toBe(false)
    expect((await removeMessage(S, '000000000000000000000000')).ok).toBe(false)
    expect((await inviteMember(S, { email: 'a@b.co', role: 'writer' })).ok).toBe(false)
    expect((await saveSiteSettings(S, readSettings({}))).ok).toBe(false)
    expect((await createKey(S, 'k')).ok).toBe(false)
    expect((await saveAuthor(S, { name: 'X', slug: '', role: '', bio: '', avatar: null, avatarAlt: '', linkedinUrl: '', xUrl: '', websiteUrl: '' })).ok).toBe(false)
  })

  it('only see their own posts in search', async () => {
    const { searchPosts } = await import('@/lib/actions/search')
    await signInAs(writer)
    const hits = await searchPosts(S, '')
    expect(hits.some((h) => h.title === 'Writer2 post')).toBe(false)
  })
})

describe('editors and owners', () => {
  it('editors publish and delete any post but cannot manage people or settings', async () => {
    await signInAs(writer)
    const d = (await savePost(S, post({ title: 'Editor will delete' }))) as { id: string }
    await signInAs(editor)
    expect((await deletePost(S, d.id)).ok).toBe(true)
    expect((await inviteMember(S, { email: 'x@y.co', role: 'writer' })).ok).toBe(false)
    expect((await saveSiteSettings(S, readSettings({}))).ok).toBe(false)
    expect((await setMemberRole(S, writer.id, 'editor')).ok).toBe(false)
  })

  it('a workspace always keeps one owner', async () => {
    await signInAs(owner)
    expect((await setMemberRole(S, owner.id, 'editor')).ok).toBe(false)
    expect((await removeMember(S, owner.id)).ok).toBe(false)
    expect((await setMemberRole(S, editor.id, 'owner')).ok).toBe(true)
    expect((await setMemberRole(S, owner.id, 'editor')).ok).toBe(true)
    await signInAs(editor)
    expect((await setMemberRole(S, owner.id, 'owner')).ok).toBe(true)
  })

  it('invalid roles are refused', async () => {
    await signInAs(owner)
    expect((await inviteMember(S, { email: 'z@z.co', role: 'superadmin' })).ok).toBe(false)
    expect((await setMemberRole(S, writer.id, 'god')).ok).toBe(false)
  })
})

describe('public listing', () => {
  it('never includes drafts, reviews or scheduled posts', async () => {
    const { posts } = await inWorkspace(ws.id, (tx) => livePosts(tx, ws.id, { limit: 100, offset: 0 }))
    for (const p of posts) {
      expect(p.status).toBe('published')
      expect(p.publishedAt!.getTime()).toBeLessThanOrEqual(Date.now())
    }
  })

  it('filters by tag slug', async () => {
    await signInAs(editor)
    await savePost(S, post({ title: 'Tagged one', tags: ['Paid Advertising'], intent: 'publish' }))
    const { posts } = await inWorkspace(ws.id, (tx) => livePosts(tx, ws.id, { limit: 10, offset: 0, tagSlug: 'paid-advertising' }))
    expect(posts.map((p) => p.title)).toEqual(['Tagged one'])
  })
})
