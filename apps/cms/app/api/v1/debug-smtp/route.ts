import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { mailFrom } from '@/lib/env'

export async function GET() {
  const host = process.env.SMTP_HOST || null
  const port = process.env.SMTP_PORT || '587'
  const user = process.env.SMTP_USER || null
  const rawPass = process.env.SMTP_PASS || ''
  const passLength = rawPass.length
  const passHasQuotes = rawPass.startsWith('"') || rawPass.endsWith('"') || rawPass.startsWith("'") || rawPass.endsWith("'")
  const secureEnv = process.env.SMTP_SECURE || null
  const isSecure = secureEnv ? secureEnv === 'true' : Number(port) === 465
  const from = mailFrom()

  let verifyStatus = 'unknown'
  let verifyError: string | null = null

  if (host && user && rawPass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: isSecure,
        auth: { user, pass: rawPass },
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
    passHasQuotes,
    secureEnv,
    isSecure,
    from,
    verifyStatus,
    verifyError,
  })
}

