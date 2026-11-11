import 'server-only'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { inWorkspace, newId, sys } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { insertAuthor } from '@/lib/content/authors'
import { insertPost } from '@/lib/content/posts'
import { readingMinutes } from '@/lib/content/sanitize'
import { storeSubmission } from '@/lib/content/contact'
import { audit } from '@/lib/audit'
import { createSiteKey } from '@/lib/integrations/site-keys'
import { addMember } from '@/lib/workspaces/members'
import { createWorkspace } from '@/lib/workspaces'

/**
 * DEMO DATA for a fresh local install: two clients, a team for one of them,
 * sample posts, authors and enquiries — and, in development, the example site's
 * .env.local written for you so `npm run dev:site` just works.
 */

export const DEMO_PASSWORD = 'demo-password-2026'

const P = (...paras: string[]) => paras.map((p) => (p.startsWith('<') ? p : `<p>${p}</p>`)).join('')

const POSTS: { title: string; excerpt: string; description: string; category: string; tags: string[]; body: string; daysAgo: number; author: number; status?: 'draft' | 'review' | 'scheduled' }[] = [
  {
    title: 'How we plan a website in the first week',
    excerpt: 'Before a single pixel moves, we spend five days on questions. Here is the agenda, and why every item is on it.',
    description: 'The five-day discovery process Acme Studio runs before designing any website, and the questions each day answers.',
    category: 'Process',
    tags: ['Process', 'Discovery', 'Planning'],
    daysAgo: 2,
    author: 0,
    body: P(
      'Every project we take on starts the same way: a week where nobody opens a design tool. It feels slow to clients on day one and fast to them by week six.',
      '<h2>Day one: what is this site for?</h2>',
      'Not what it should look like. What it should <strong>do</strong>. We write the answer as one sentence and pin it above every desk.',
      '<h2>Day two: who arrives, and from where?</h2>',
      'Search, a referral, a QR code on a box. Each doorway changes what the first screen has to say.',
      '<blockquote><p>A website is a set of answers to questions people are already asking.</p></blockquote>',
      '<h2>Day three: the content inventory</h2>',
      'We list every page that exists and every page that should. The second list is always shorter than people expect.',
      '<ul><li><p>Pages that earn their place</p></li><li><p>Pages that exist out of habit</p></li><li><p>Pages nobody has written yet</p></li></ul>',
      '<h2>Days four and five: structure, then words</h2>',
      'We sketch the navigation, then write real headlines for each page. Lorem ipsum hides problems; real words expose them early, while they are cheap to fix.',
      'By Friday the client has a map of the site, a draft of every headline, and a list of decisions we need from them. Design starts the following Monday, and it goes quickly, because the hard thinking is done.'
    ),
  },
  {
    title: 'The case for fewer pages',
    excerpt: 'Most small business sites would be better at half the size. A field guide to cutting.',
    description: 'Why smaller websites convert better, and a practical method for deciding which pages to cut.',
    category: 'Strategy',
    tags: ['Strategy', 'Content'],
    daysAgo: 6,
    author: 1,
    body: P(
      'When a site grows by accretion, every new idea becomes a new page. Three years later nobody can find anything, including the team that built it.',
      '<h2>A simple test</h2>',
      'For every page, ask: if this disappeared tomorrow, who would email us about it? If the honest answer is nobody, it is a candidate for cutting or merging.',
      '<h3>What to do with the cuts</h3>',
      'Redirect them. A deleted page that 404s is a small betrayal of every link that ever pointed at it.',
      'Fewer pages means fewer things to keep current, and a visitor who reaches the right answer in one click instead of four.'
    ),
  },
  {
    title: 'Writing headlines people actually read',
    excerpt: 'Five rules we use on every page, with before-and-after examples from real client sites.',
    description: 'Five practical rules for writing website headlines that are clear, specific and worth reading.',
    category: 'Writing',
    tags: ['Writing', 'Content', 'Conversion'],
    daysAgo: 11,
    author: 0,
    body: P(
      'Visitors read headlines and skip almost everything else. That makes them the most important words on any page, and the ones most often left until last.',
      '<h2>1. Say the thing</h2>',
      '“Solutions for tomorrow” says nothing. “We fix leaking roofs in Leeds within 48 hours” says everything a customer needs to keep reading.',
      '<h2>2. Use their words, not yours</h2>',
      'People search for “fix my boiler”, not “heating system remediation”.',
      '<h2>3. One idea per headline</h2>',
      'If you need a comma and an “and”, you probably have two headlines.',
      '<h2>4. Make it specific</h2>',
      'Numbers, places and timeframes beat adjectives every time.',
      '<h2>5. Read it out loud</h2>',
      'If it sounds like a brochure, rewrite it until it sounds like a person.'
    ),
  },
  {
    title: 'What a CMS should never ask you to do',
    excerpt: 'Good content tools get out of the way. Here is the checklist we hold ours to.',
    description: 'A checklist of what a good content management system should and should not ask of the people who use it.',
    category: 'Tools',
    tags: ['Tools', 'Process'],
    daysAgo: 19,
    author: 2,
    body: P(
      'A content management system is a promise: you will be able to change your own website without calling anyone. Most break that promise in small ways.',
      '<h2>It should never ask you to think in HTML</h2>',
      'Headings, lists, links and images. That is the vocabulary of writing, and it is all a writer should need.',
      '<h2>It should never lose your work</h2>',
      'Autosave is not a feature. It is the floor.',
      '<h2>It should never surprise you on publish</h2>',
      'A preview that looks exactly like the live page, a schedule that fires on time, and a clear answer to “is this live yet?”.'
    ),
  },
  {
    title: 'Studio notes: our new home',
    excerpt: 'After four years above a bakery, we are moving. A short note on what changes and what does not.',
    description: 'Acme Studio is moving to a new studio in December. What changes for clients and what stays the same.',
    category: 'News',
    tags: ['News', 'Studio'],
    daysAgo: -3,
    author: 1,
    status: 'scheduled',
    body: P('In December we move across town to a bigger space with better light and, sadly, no bakery downstairs.', 'Nothing changes for clients. Same team, same email, same coffee order.'),
  },
  {
    title: 'A draft about accessibility audits',
    excerpt: 'Notes towards a longer piece on running a practical accessibility audit.',
    description: 'How to run a practical, useful accessibility audit on a small business website.',
    category: 'Accessibility',
    tags: ['Accessibility'],
    daysAgo: 0,
    author: 2,
    status: 'review',
    body: P('Start with a keyboard. Unplug the mouse and try to complete the three most important tasks on the site.', 'Then turn on a screen reader and do it again.'),
  },
]

export async function seedDemo(agencyUserId: string): Promise<{ siteKey: string; wroteEnv: boolean }> {
  const db = await sys()
  if (await db.workspaces.bySlug('acme')) throw new Error('Demo data already exists.')

  const acme = await createWorkspace({
    name: 'Acme Studio',
    slug: 'acme',
    siteUrl: 'http://localhost:3100',
    accent: '#ff5b2e',
    settings: {
      description: 'Notes, guides and news from the Acme Studio team.',
      legalName: 'Acme Studio Ltd',
      social: [
        { platform: 'linkedin', url: 'https://www.linkedin.com/company/example' },
        { platform: 'instagram', url: 'https://www.instagram.com/example' },
      ],
      blog: { title: 'Journal', description: 'Guides, case notes and studio news.', basePath: '/blog', postsPerPage: 9, authors: true, faqs: true, htmlPages: true, midPostCta: true },
      cta: { enabled: true, heading: 'Have a project in mind?', body: 'Tell us what you are building. We reply within one working day.', label: 'Start a project', href: '/contact' },
      contact: { enabled: true, notifyEmails: [], confirmation: true, confirmationSubject: 'Thanks — we got your message', topics: ['New website', 'Redesign', 'Content help', 'Something else'] },
    },
  })
  const bakery = await createWorkspace({ name: 'Northwind Bakery', slug: 'northwind', siteUrl: '', accent: '#2f7d5b' })
  await createWorkspace({ name: 'Halcyon Clinic', slug: 'halcyon', siteUrl: '', accent: '#4d5bd8' })
  if (!acme.ok || !bakery.ok) throw new Error('Could not create demo workspaces.')
  const wsId = acme.workspace.id

  await db.workspaces.update(wsId, { webhookUrl: 'http://localhost:3100/api/cms/revalidate', updatedAt: new Date() })

  const hash = await hashPassword(DEMO_PASSWORD)
  const people = [
    { name: 'Priya Sharma', email: 'owner@acme.test', role: 'owner' as const },
    { name: 'Rahul Mehta', email: 'editor@acme.test', role: 'editor' as const },
    { name: 'Ana Costa', email: 'writer@acme.test', role: 'writer' as const },
  ]
  const ids: string[] = []
  for (const p of people) {
    const id = newId()
    await db.users.insert({ id, email: p.email, name: p.name, passwordHash: hash })
    await addMember(wsId, id, p.role)
    ids.push(id)
  }
  const bakerId = newId()
  await db.users.insert({ id: bakerId, email: 'owner@northwind.test', name: 'Tom Baker', passwordHash: hash })
  await addMember(bakery.workspace.id, bakerId, 'owner')

  await inWorkspace(wsId, async (tx) => {
    const authorIds = [
      await insertAuthor(tx, wsId, { slug: 'priya-sharma', name: 'Priya Sharma', role: 'Founder & strategist', bio: 'Priya started Acme Studio in 2019 after a decade building websites for other agencies. She writes about planning, content and saying no to unnecessary pages.', avatar: null, linkedinUrl: 'https://www.linkedin.com/in/example', xUrl: null, websiteUrl: null, updatedAt: new Date() }),
      await insertAuthor(tx, wsId, { slug: 'rahul-mehta', name: 'Rahul Mehta', role: 'Design lead', bio: 'Rahul leads design at Acme. He cares about type, whitespace and websites that load before you finish blinking.', avatar: null, linkedinUrl: null, xUrl: 'https://x.com/example', websiteUrl: null, updatedAt: new Date() }),
      await insertAuthor(tx, wsId, { slug: 'ana-costa', name: 'Ana Costa', role: 'Content designer', bio: 'Ana writes the words on client sites and the guides on this one.', avatar: null, linkedinUrl: null, xUrl: null, websiteUrl: 'https://example.com', updatedAt: new Date() }),
    ]
    for (const post of POSTS) {
      const publishedAt = post.status === 'review' ? null : new Date(Date.now() - post.daysAgo * 86_400_000)
      await insertPost(tx, wsId, ids[post.author], {
        slug: post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title: post.title,
        description: post.description,
        excerpt: post.excerpt,
        format: 'editor',
        contentHtml: post.body,
        coverImage: null,
        category: post.category,
        tags: post.tags,
        faqs: post.title.startsWith('How we plan')
          ? [
              { question: 'How long does discovery take?', answer: 'Five working days for most small business sites. Larger sites take two weeks.' },
              { question: 'Do I need to be there every day?', answer: 'For about an hour a day. We send the agenda the week before.' },
            ]
          : [],
        authorId: authorIds[post.author],
        seoTitle: null,
        focusKeyword: null,
        status: post.status === 'review' ? 'review' : 'published',
        publishedAt,
        readingMinutes: readingMinutes(post.body),
        updatedBy: ids[post.author],
        updatedAt: new Date(Date.now() - Math.max(0, post.daysAgo) * 86_400_000),
      })
      await audit(tx, {
        workspaceId: wsId,
        actor: { id: ids[post.author], name: people[post.author].name },
        action: post.status === 'review' ? 'post.review' : post.status === 'scheduled' ? 'post.scheduled' : 'post.published',
        targetType: 'post',
        summary: `${post.status === 'review' ? 'sent for review' : post.status === 'scheduled' ? 'scheduled' : 'published'} “${post.title}”`,
      })
    }
    const enquiries = [
      { name: 'Meera Iyer', email: 'meera@example.com', company: 'Iyer & Daughters', topic: 'New website', message: 'We run a family-owned spice shop and finally want a proper website with online ordering. Could we talk next week?' },
      { name: 'James Okafor', email: 'james@example.org', company: '', topic: 'Redesign', message: 'Our site is eight years old and it shows. Looking for a refresh before our spring launch.' },
      { name: 'Lena Fischer', email: 'lena@example.net', company: 'Fischer Physio', topic: 'Content help', message: 'Do you also write content? We have the design sorted but our pages are mostly empty.' },
    ]
    for (const e of enquiries) await storeSubmission(tx, wsId, { ...e, phone: '' }, { userAgent: null, source: '/contact' })
  })

  const { key } = await createSiteKey(wsId, 'Acme website (local)', agencyUserId)

  let wroteEnv = false
  if (process.env.NODE_ENV !== 'production') {
    const ws = (await db.workspaces.byId(wsId))!
    const envFile = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..', '..', 'examples', 'acme-site', '.env.local')
    if (existsSync(path.dirname(envFile))) {
      writeFileSync(
        envFile,
        [
          '# Written by the CMS demo setup. Points this example site at your local CMS.',
          'CMS_URL=http://localhost:3000',
          `CMS_SITE_KEY=${key}`,
          `CMS_WEBHOOK_SECRET=${ws.webhookSecret}`,
          'SITE_URL=http://localhost:3100',
          '',
        ].join('\n'),
        { mode: 0o600 }
      )
      wroteEnv = true
    }
  }
  return { siteKey: key, wroteEnv }
}
