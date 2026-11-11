# Security

What this platform defends against, how, and where the code and tests for each
defence live. Paths are relative to `apps/cms/` unless they say otherwise.

## Who we defend against

1. **Another client.** Any person in any workspace trying to read or change a
   different client's posts, enquiries, people, keys or settings.
2. **A lower role in the same workspace.** For example, a writer trying to
   publish, read the inbox or change settings.
3. **The public internet.** Visitors of client sites, bots on the contact form,
   people guessing passwords, and anyone holding a stolen or forged token.
4. **Hostile content.** Markup pasted into a post that tries to run script on a
   client's site, or in the admin.
5. **The CMS as a weapon.** Using webhooks to reach internal networks (SSRF), or
   using the contact form to send spam under a client's name.

## Keeping clients apart

Isolation is enforced **twice**: once in the application and once in the database.

- **Application.** Every page and server action resolves the workspace from the
  URL and checks the signed-in user's membership. This is `lib/auth/access.ts`:
  `requireWorkspace`, `actionAccess`. A workspace you are not in is a **404**,
  never a 403, so its existence is not revealed. Every server action is guarded,
  and agency actions additionally require an agency user.
- **Data layer.** Client content (posts, authors, enquiries, contact rate
  counters, the audit log) is only reachable inside `inWorkspace(id, …)`
  (`lib/db/index.ts`), which hands out a `Scope` already bound to one workspace,
  inside a transaction. Its methods take no workspace id, so they cannot be
  pointed at another client. Code outside `lib/db` cannot import a database
  driver at all (a lint rule).
- **Database, on MongoDB (production): the workspace fence**
  (`lib/db/mongo/scoped.ts`).
  - Scope code never touches a raw content collection. It gets wrappers bound to
    one workspace that AND `{ workspaceId }` into every filter (overriding any
    workspaceId the caller supplied), stamp it on every inserted document, and
    refuse any update that would change it.
  - A query that "forgot" its filter still only sees its own client.
  - Collection validators reject any content document without a valid
    `workspaceId` (`lib/db/mongo/schema.mjs`).
  - The only cross-client reads are the agency dashboard's counts
    (`overview` in `lib/db/mongo/index.ts`), reached from agency-only pages.
  - `tests/unit/mongo-fence.test.ts` records every command the driver sends while
    every Scope method runs, and fails if any command on a content collection is
    not pinned to the right workspace.
- **Media.** Cloudinary files live under `cms/<workspace id>/`. Uploads are signed
  for that folder only. The sanitiser keeps images only from the workspace's own
  folder, and deletes are scoped to it (`lib/cloudinary/`).
- **Site keys** belong to one workspace, and the content API serves only that
  workspace's *published* content. Drafts, scheduled posts, focus keywords, user
  IDs and workspace IDs never appear in API output.

Tests:
- `tests/unit/tenancy.test.ts`: every action across workspaces.
- `tests/unit/db.test.ts`: every data-layer method across workspaces, on
  whichever database the suite runs on; plus the fence and RLS tests above.
- `tests/unit/api.test.ts`
- `tests/e2e/2-security.spec.ts`: cross-client URLs in a real browser.

## Roles

`lib/permissions.ts` is the single table every check reads. Writers can only
create posts, and can edit only their own unpublished ones (`canEditPost`).
Nobody can grant a role above their own, and a workspace can never lose its last
owner. Server actions re-check permissions themselves; hiding a button is never
the protection.

Tests: `tests/unit/posts.test.ts`, `tests/unit/tenancy.test.ts`, and the writer
part of `tests/e2e/1-journey.spec.ts`.

## Accounts and sessions

- **Passwords:** bcrypt (cost 12), at least 12 characters, and common
  words/patterns are refused. Unknown emails still run a bcrypt comparison, so
  timing does not reveal who has an account. Errors never say which part was wrong.
- **Rate limits** (`lib/auth/rate-limit.ts`), per 15 minutes: 5 failed sign-ins
  per IP, 10 per account, and 100 across the whole CMS as a brake on distributed
  guessing. A locked account stays locked even for the right password.
- **Sessions** are random 256-bit tokens. Only their SHA-256 is stored. The cookie
  is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Sessions expire after
  30 days, or after 7 days idle. Signing out deletes the session server-side, so
  a copied cookie stops working (tested end-to-end). Changing or resetting a
  password signs out every other session, and users can see and end their sessions.
- **Two-factor:** an optional emailed 6-digit code, valid for 10 minutes, with 5 tries.
- **Password resets:** single-use links, valid 30 minutes, stored hashed, at most
  5 per machine per 15 minutes. The response is the same whether or not the email
  exists.
- **Invites:** single-use, 7 days, stored hashed, and revocable. Accepting as an
  existing user requires being signed in as that user. No one can sign up without
  an invite.
- **First run:** `/setup` exists only while there are no users. In production it
  also requires `CMS_SETUP_TOKEN`, compared in constant time.

## The admin in the browser

- **CSP with a fresh nonce on every request** (`proxy.ts`): `script-src 'self'
  'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'` and `frame-ancestors 'none'`.
- Also sent: `X-Frame-Options: DENY`, `nosniff`, HSTS, `Cross-Origin-Opener-Policy`,
  `Referrer-Policy`, `X-Robots-Tag: noindex`, and `Cache-Control: no-store` on
  every page. There is no `X-Powered-By`.
- Server actions carry Next's built-in Origin check against cross-site requests.
- Uploaded logos are sniffed by content, not by name or type. SVG logos are served
  with `Content-Security-Policy: sandbox`, so script inside them never runs.
- The HTML-page editor previews pasted pages in an `<iframe sandbox="">`: no
  script, and an opaque origin.

## Content that reaches client sites

- Every post body is sanitised on save and again on read, by an allow-list
  (`lib/content/sanitize.ts`). Script, event handlers, `javascript:` and `data:`
  URLs, inline CSS expressions, `<base>`, `<meta refresh>`, forms pointing at
  `javascript:` and similar are all removed.
  - Rich-editor posts keep a small set of tags.
  - HTML-page posts keep layout and styling, but never script.
  - The test corpus (`tests/unit/xss-vectors.ts`) has 66 known payloads, tried
    alone, in every pair and through the render-time transforms.
- End-to-end, a post stuffed with payloads is published and opened on the real
  site. The test checks that no dialog fires and no handler survives.
- HTML-page posts are written by editors and owners, and may contain forms and
  external links. Treat publishing rights as you would access to the website itself.

## The content API (`/api/v1/*`)

- Bearer site keys look like `cms_<prefix>_<43 random chars>`. Only the SHA-256
  is stored and the comparison is constant-time. Keys are shown once, can be
  revoked, and stop working immediately.
- Each key is limited to 600 requests per minute.
- No CORS headers, and every response is `Cache-Control: private, no-store`. The
  API is for the client's server, never the browser; the key never reaches a
  visitor.
- Preview tokens are short-lived (15 minutes) signed JWTs bound to one workspace
  and one post. A token for another workspace, or a tampered one, returns 404.
- **Contact submissions** have 32 KB limits and strict field validation. Header
  injection is refused, and topics must come from the configured list. Limits are
  5 per visitor and 60 per workspace per 10 minutes. Visitor IPs are stored only
  as keyed hashes. The site kit's `contactHandler` also refuses cross-site posts
  and fakes success for bots that fill the honeypot.
- The visitor's confirmation email **echoes nothing they typed**, so the form
  cannot be used to send arbitrary text to arbitrary inboxes.
- **CSV export** neutralises formula injection: cells starting with `= + - @`,
  tab or CR are prefixed.

## Webhooks and SSRF

- Each request is signed `x-cms-signature: t=<unix>,v1=<HMAC-SHA256 of t.body>`.
  The site kit's `verifySignature` rejects anything older than 5 minutes, any
  tampering and any wrong secret, comparing in constant time.
- Only agency users can set a webhook URL. In production it must be `https://`
  and resolve to a public address. Private, loopback, link-local, CGNAT, multicast
  and cloud-metadata ranges are refused, for IPv4 and IPv6 (including mapped forms).
- That check runs on the URL **and again at connect time**, so DNS rebinding cannot
  change the answer in between (`lib/integrations/net.ts`).
- Redirects are not followed, there is a 5-second timeout, and responses are
  never shown in full.

## Secrets and data

- `CMS_SECRET` signs preview tokens and keys the hashes of visitor IPs. It must
  be 32+ characters; in production, anything that needs it fails loudly
  rather than falling back to a default.
- Webhook secrets and site keys are generated by the CMS.
- No secret is ever sent to the browser except when its owner deliberately reveals
  it, which is an owner/agency action.
- The audit log records, per workspace and inside the same transaction as the
  change: post and author changes, publishing, invites, role changes, removals,
  settings, branding, site keys and webhook secrets. It is kept for a year.

## Dependencies

`npm audit --omit=dev` reports **0 vulnerabilities**. The development tools run only during build or testing.

## Known limits and advice

- Two-factor is by email. If an inbox is compromised, so is the second factor.
  TOTP or passkeys would be stronger.
- Rate limits live in the database, which is fine for a few instances. At very
  large scale, move them to Redis.
- MongoDB has no row-level security, so on MongoDB client isolation rests on the
  data layer and its fence (tested on every command) rather than on the database
  itself. Never give application code other than `lib/db` a raw database
  connection, and keep the lint rule on.
- Use a dedicated MongoDB user for the CMS with access to its one database only,
  and require TLS (`mongodb+srv://` does by default).
- Put the CMS behind a CDN or WAF if you expect hostile traffic. Set
  `TRUSTED_PROXY_COUNT` to match, or the rate limits key on the proxy's IP.
- Webhook secrets are stored as-is in the database, because the CMS must read
  them to sign each request. Guard database access and backups accordingly;
  passwords, sessions, keys, invites and reset links are all stored only as hashes.
- Without SMTP, emails (with their invite and reset links) are kept in the
  outbox table instead of being sent. Configure SMTP in production.
- Keep `CMS_ALLOW_PRIVATE_WEBHOOKS` and `CMS_SHOW_OUTBOX` off in production.

## Reporting

Found something? Email the agency that runs your CMS. Do not open a public issue.
