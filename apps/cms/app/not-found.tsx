import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">404</p>
        <h1 className="mt-3 font-serif text-[64px] leading-none tracking-[-0.02em]">Not here.</h1>
        <p className="mt-3 text-muted">This page does not exist, or you do not have access to it.</p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas">
          Go home
        </Link>
      </div>
    </main>
  )
}
