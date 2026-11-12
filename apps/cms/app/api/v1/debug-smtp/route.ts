import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { mailFrom } from '@/lib/env'

function clean(val?: string | null): string {
  if (!val) return ''
  return val.trim().replace(/^["']|["']$/g, '').trim()
}

export async function GET() {
  const rawHost = process.env.SMTP_HOST || null
  const rawPort = process.env.SMTP_PORT || '587'
  const rawUser = process.env.SMTP_USER || null
  const rawPass = process.env.SMTP_PASS || ''

  const host = clean(rawHost)
  const port = Number(clean(rawPort) || 587)
  const user = clean(rawUser)
  const pass = clean(rawPass)

  const passLength = pass.length
  const passPreview = pass.length <= 4 ? pass : `${pass.slice(0, 2)}...${pass.slice(-2)}`
  const passHadQuotes = rawPass.startsWith('"') || rawPass.endsWith('"') || rawPass.startsWith("'") || rawPass.endsWith("'")
  const secureEnv = clean(process.env.SMTP_SECURE)
  const isSecure = secureEnv ? secureEnv === 'true' : port === 465
  const from = mailFrom()

  let verifyStatus = 'unknown'
  let verifyError: string | null = null

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 8000,
      })
      await transporter.verify()
      verifyStatus = 'CONNECTED_AND_AUTHENTICATED'
    } catch (e) {
      verifyStatus = 'FAILED'
      verifyError = e instanceof Error ? e.message : String(e)
    }
  } else {
    verifyStatus = 'MISSING_ENV_VARS'
  }

  return NextResponse.json({
    host,
    port,
    user,
    passLength,
    passPreview,
    passHadQuotes,
    secureEnv,
    isSecure,
    from,
    verifyStatus,
    verifyError,
  })
}

