import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import { cookies } from 'next/headers'
import { Providers } from '@/components/providers/providers'
import { agencyAccent, agencyName } from '@/lib/env'
import { accentForeground } from '@/lib/workspaces/settings'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: agencyName(), template: `%s · ${agencyName()}` },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('cms_theme')?.value
  const accent = agencyAccent()
  return (
    <html
      lang="en"
      data-theme={theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : undefined}
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}
      style={{ ['--brand' as string]: accent, ['--brand-fg' as string]: accentForeground(accent) }}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
