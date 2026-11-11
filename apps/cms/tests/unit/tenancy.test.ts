import { beforeAll, describe, expect, it } from 'vitest'
import { savePost, deletePost, previewLink } from '@/lib/actions/posts'
import { deleteAuthor, removeMessage, saveAuthor, setMessageState, signUpload, adoptRemoteImage } from '@/lib/actions/content'
import {
  cancelInvite,
  createKey,
  inviteMember,
  removeLogo,
  removeMember,
  revealWebhookSecret,
  revokeKey,
  rotateSecret,
  saveBranding,
  saveIntegration,
  saveSiteSettings,
  setMemberRole,
  testWebhook,
  uploadLogo,
} from '@/lib/actions/workspace'
import { searchPosts } from '@/lib/actions/search'
import { archiveClient, createClient, inviteAgencyMember } from '@/lib/actions/agency'
import { getAccess } from '@/lib/auth/access'
import { inWorkspace } from '@/lib/db'
import { storeSubmission } from '@/lib/content/contact'
import { getPost, listPosts } from '@/lib/content/posts'
import { readSettings } from '@/lib/workspaces/settings'
import { makeUser, makeWorkspace, member, post, signInAs, signOut } from './fixtures'

/**
 * CROSS-WORKSPACE ATTACKS. Someone who is legitimately an OWNER of workspace A
 * tries every action against workspace B, and every trick with B's ids from
 * inside A. All of it must fail, and B must be unchanged afterwards.
 */

let A: Awaited<ReturnType<typeof makeWorkspace>>
let B: Awaited<ReturnType<typeof makeWorkspace>>
let ownerA: Awaited<ReturnType<typeof makeUser>>
let ownerB: Awaited<ReturnType<typeof makeUser>>
let postB: string
let messageB: string
let authorB: string

beforeAll(async () => {
  A = await makeWorkspace('tenant-a')
  B = await makeWorkspace('tenant-b')
  ownerA = await member(A.id, 'owner')
  ownerB = await member(B.id, 'owner')
  await signInAs(ownerB)
  const p = await savePost('tenant-b', post({ title: 'B secret draft' }))
  if (!p.ok) throw new Error('setup')
  postB = p.id
  const a = await saveAuthor('tenant-b', { name: 'B Author', slug: '', role: '', bio: '', avatar: null, avatarAlt: '', linkedinUrl: '', xUrl: '', websiteUrl: '' })
  if (!a.ok) throw new Error('setup')
  authorB = a.id
  messageB = (
    await inWorkspace(B.id, (tx) =>
      storeSubmission(tx, B.id, { name: 'Visitor', email: 'v@example.com', phone: '', company: '', topic: '', message: 'hello B', }, { userAgent: null, source: null })
    )
  ).id
})

describe('an owner of A, aimed at B by slug', () => {
  const denied = (r: unknown) => {
    const x = r as { ok?: boolean; errors?: Record<string, string> }
    expect(x.ok === false || Array.isArray(r)).toBe(true)
  }

  it('cannot open B at all', async () => {
    await signInAs(ownerA)
    expect(await getAccess('tenant-b')).toBeNull()
  })

  it('every action refuses', async () => {
    await signInAs(ownerA)
    const f = new FormData()
    f.set('logo', new File([Buffer.from('<svg/>')], 'l.svg', { type: 'image/svg+xml' }))
    const results = await Promise.all([
      savePost('tenant-b', post({ title: 'smuggled' })),
      savePost('tenant-b', post({ id: postB, title: 'overwritten', intent: 'publish' })),
      deletePost('tenant-b', postB),
      previewLink('tenant-b', postB),
      saveAuthor('tenant-b', { id: authorB, name: 'hijack', slug: '', role: '', bio: '', avatar: null, avatarAlt: '', linkedinUrl: '', xUrl: '', websiteUrl: '' }),
      deleteAuthor('tenant-b', authorB),
      setMessageState('tenant-b', messageB, { read: true }),
      removeMessage('tenant-b', messageB),
      signUpload('tenant-b', 'cover'),
      adoptRemoteImage('tenant-b', 'https://example.com/a.png'),
      saveSiteSettings('tenant-b', readSettings({})),
      saveBranding('tenant-b', { name: 'pwned', accent: '#000000' }),
      uploadLogo('tenant-b', f),
      removeLogo('tenant-b'),
      saveIntegration('tenant-b', { siteUrl: 'https://evil.example', webhookUrl: '' }),
      rotateSecret('tenant-b'),
      revealWebhookSecret('tenant-b'),
      testWebhook('tenant-b'),
      createKey('tenant-b', 'stolen'),
      revokeKey('tenant-b', postB),
      inviteMember('tenant-b', { email: 'friend@evil.example', role: 'owner' }),
      setMemberRole('tenant-b', ownerB.id, 'writer'),
      removeMember('tenant-b', ownerB.id),
      cancelInvite('tenant-b', postB),
    ])
    for (const r of results) denied(r)
    expect(await searchPosts('tenant-b', '')).toEqual([])
  })

  it("cannot reach B's rows through A's own slug either", async () => {
    await signInAs(ownerA)
    expect((await savePost('tenant-a', post({ id: postB, title: 'via A' }))).ok).toBe(false)
    expect((await deletePost('tenant-a', postB)).ok).toBe(false)
    expect((await previewLink('tenant-a', postB)).ok).toBe(false)
    expect((await saveAuthor('tenant-a', { id: authorB, name: 'x', slug: '', role: '', bio: '', avatar: null, avatarAlt: '', linkedinUrl: '', xUrl: '', websiteUrl: '' })).ok).toBe(false)
    expect((await deleteAuthor('tenant-a', authorB)).ok).toBe(false)
    expect((await setMessageState('tenant-a', messageB, { archived: true })).ok).toBe(false)
    expect((await removeMessage('tenant-a', messageB)).ok).toBe(false)
    expect((await setMemberRole('tenant-a', ownerB.id, 'writer')).ok).toBe(false)
    expect((await removeMember('tenant-a', ownerB.id)).ok).toBe(false)
  })

  it("cannot attach B's author to an A post", async () => {
    await signInAs(ownerA)
    const r = await savePost('tenant-a', post({ title: 'with stolen author', authorId: authorB }))
    expect(r.ok).toBe(true)
    const saved = await inWorkspace(A.id, (tx) => getPost(tx, A.id, (r as { id: string }).id))
    expect(saved?.authorId).toBeNull()
  })

  it("cannot use a cover image from B's folder", async () => {
    await signInAs(ownerA)
    const r = await savePost('tenant-a', post({ title: 'cover theft', coverImage: { publicId: `cms/${B.id}/posts/covers/x`, url: '', secureUrl: '', width: 1, height: 1, format: 'jpg', bytes: 10 } }))
    expect(r.ok).toBe(false)
  })

  it('B is untouched', async () => {
    const p = await inWorkspace(B.id, (tx) => getPost(tx, B.id, postB))
    expect(p?.title).toBe('B secret draft')
    const all = await inWorkspace(B.id, (tx) => listPosts(tx, B.id))
    expect(all.map((x) => x.title)).toEqual(['B secret draft'])
  })
})

describe('signed out, or a stranger', () => {
  it('every action refuses with no session', async () => {
    signOut()
    expect((await savePost('tenant-a', post())).ok).toBe(false)
    expect((await saveSiteSettings('tenant-a', readSettings({}))).ok).toBe(false)
    expect((await createKey('tenant-a', 'x')).ok).toBe(false)
    expect((await createClient({ name: 'x', slug: 'xxx', siteUrl: '', accent: '#000000', ownerEmail: '' })).ok).toBe(false)
  })

  it('a user with no membership sees nothing', async () => {
    const stranger = await makeUser()
    await signInAs(stranger)
    expect(await getAccess('tenant-a')).toBeNull()
    expect((await savePost('tenant-a', post())).ok).toBe(false)
    expect((await inviteAgencyMember('me@evil.example')).ok).toBe(false)
    expect((await archiveClient('tenant-a', true)).ok).toBe(false)
  })

  it('non-string or hostile slugs are refused', async () => {
    await signInAs(ownerA)
    // @ts-expect-error -- deliberately wrong type
    expect((await savePost({ slug: 'tenant-a' }, post())).ok).toBe(false)
    expect((await savePost("tenant-a' OR 1=1 --", post())).ok).toBe(false)
    expect((await savePost('../tenant-a', post())).ok).toBe(false)
  })
})

describe('agency access', () => {
  it('an agency user acts as owner everywhere, and only agency users can create clients', async () => {
    const agency = await makeUser({ isAgency: true })
    await signInAs(agency)
    expect((await getAccess('tenant-b'))?.role).toBe('owner')
    const r = await createClient({ name: 'New Co', slug: 'new-co', siteUrl: 'https://new.example', accent: '#ff0000', ownerEmail: '' })
    expect(r.ok).toBe(true)
    expect((await createClient({ name: 'Dup', slug: 'new-co', siteUrl: '', accent: '#ff0000', ownerEmail: '' })).ok).toBe(false)
    expect((await createClient({ name: 'Reserved', slug: 'agency', siteUrl: '', accent: '#ff0000', ownerEmail: '' })).ok).toBe(false)
  })

  it('archiving a client locks its members out but not the agency', async () => {
    const ws = await makeWorkspace('archived-co')
    const m = await member(ws.id, 'owner')
    const agency = await makeUser({ isAgency: true })
    await signInAs(agency)
    expect((await archiveClient('archived-co', true)).ok).toBe(true)
    await signInAs(m)
    expect(await getAccess('archived-co')).toBeNull()
    await signInAs(agency)
    expect(await getAccess('archived-co')).not.toBeNull()
  })
})
