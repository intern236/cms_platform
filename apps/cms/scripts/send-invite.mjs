#!/usr/bin/env node

/**
 * Super Admin Direct Invite Tool
 *
 * Usage:
 *   node apps/cms/scripts/send-invite.mjs <workspace-slug> <client-email> [role]
 *
 * Example:
 *   node apps/cms/scripts/send-invite.mjs saquib kartik4023@gmail.com owner
 */

import { MongoClient } from 'mongodb'
import nodemailer from 'nodemailer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

const [, , slugInput, emailInput, roleInput = 'owner'] = process.argv

if (!slugInput || !emailInput) {
  console.log(`
Usage:
  node apps/cms/scripts/send-invite.mjs <workspace-slug> <client-email> [role]

Examples:
  node apps/cms/scripts/send-invite.mjs saquib kartik4023@gmail.com owner
  node apps/cms/scripts/send-invite.mjs kartik client@example.com editor
  `)
  process.exit(1)
}

const slug = slugInput.trim().toLowerCase()
const email = emailInput.trim().toLowerCase()
const role = roleInput.trim().toLowerCase()

function newId() {
  return crypto.randomBytes(12).toString('hex')
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url')
}

function sha256(val) {
  return crypto.createHash('sha256').update(val).digest('hex')
}

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is missing in apps/cms/.env')
    process.exit(1)
  }

  const cmsUrl = (process.env.CMS_URL || 'https://cms-platform-flame.vercel.app').replace(/\/+$/, '')
  const smtpUser = process.env.SMTP_USER?.trim()
  const smtpPass = process.env.SMTP_PASS?.trim()
  const mailFrom = process.env.MAIL_FROM?.trim() || smtpUser

  console.log(`Connecting to MongoDB Atlas...`)
  const client = new MongoClient(dbUrl)
  await client.connect()
  const db = client.db('cms')

  try {
    // 1. Find workspace
    const workspace = await db.collection('workspaces').findOne({ slug, archivedAt: null })
    if (!workspace) {
      console.error(`ERROR: Workspace with slug "${slug}" not found in database!`)
      process.exit(1)
    }

    // 2. Find agency inviter or system
    const agencyAdmin = await db.collection('users').findOne({ isAgency: true })
    const inviterId = agencyAdmin ? agencyAdmin._id : 'system'
    const inviterName = agencyAdmin?.name || 'Studio CMS'

    // 3. Revoke any existing open invite for this email in this workspace
    await db.collection('invites').updateMany(
      { email, workspaceId: workspace._id, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    )

    // 4. Generate new invite token
    const token = randomToken()
    const inviteId = newId()
    const expiresAt = new Date(Date.now() + 7 * 86_400_000)

    await db.collection('invites').insertOne({
      _id: inviteId,
      workspaceId: workspace._id,
      email,
      role,
      tokenHash: sha256(token),
      invitedBy: inviterId,
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    })

    const inviteUrl = `${cmsUrl}/invite/${token}`

    console.log(`\n========================================`)
    console.log(`INVITATION CREATED FOR WORKSPACE: ${workspace.name}`)
    console.log(`Recipient: ${email}`)
    console.log(`Role:      ${role}`)
    console.log(`Link:      ${inviteUrl}`)
    console.log(`Expires:   7 days (${expiresAt.toISOString()})`)
    console.log(`========================================\n`)

    // 5. Send email via Nodemailer
    console.log(`Sending email to ${email} via ${smtpUser}...`)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    })

    const info = await transporter.sendMail({
      from: { name: workspace.name, address: mailFrom },
      to: email,
      subject: `${inviterName} invited you to ${workspace.name}`,
      text: `${inviterName} invited you to ${workspace.name}'s CMS as ${role}.\n\nAccept your invite:\n${inviteUrl}\n\nThis link works once and expires in 7 days.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e9e8e4; border-radius: 16px; background-color: #ffffff;">
          <h2 style="margin: 0 0 16px; color: #0b0b0c; font-size: 22px;">You are invited to ${workspace.name}</h2>
          <p style="font-size: 15px; color: #333333; line-height: 1.6;">
            <strong>${inviterName}</strong> invited you to join <strong>${workspace.name}'s CMS</strong> as <strong>${role}</strong>.
          </p>
          <div style="margin: 24px 0;">
            <a href="${inviteUrl}" style="background-color: ${workspace.accent || '#ff5b2e'}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: 600; font-size: 15px; display: inline-block;">Accept invite</a>
          </div>
          <p style="font-size: 13px; color: #6b6b70;">Or copy and paste this link into your browser:</p>
          <p style="font-size: 13px; color: #0b0b0c; word-break: break-all; background-color: #f6f5f2; padding: 8px 12px; border-radius: 8px; font-family: monospace;">${inviteUrl}</p>
          <hr style="border: 0; border-top: 1px solid #e9e8e4; margin: 24px 0 16px;" />
          <p style="font-size: 12px; color: #888888; margin: 0;">This invitation works once and expires in 7 days.</p>
        </div>
      `,
    })

    console.log(`SUCCESS! Email delivered! Message ID: ${info.messageId}`)
    console.log(`Server response: ${info.response}\n`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message)
  process.exit(1)
})
