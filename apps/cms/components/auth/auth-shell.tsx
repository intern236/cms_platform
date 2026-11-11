import { BrandCanvas } from './brand-canvas'

/** Split screen: the brand on the left, the form on the right. Stacks on phones. */
export function AuthShell({
  brand,
  children,
}: {
  brand: { name: string; slug: string | null; accent: string; hasLogo: boolean; agency: string; logoVersion?: number }
  children: React.ReactNode
}) {
  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <div className="p-2 lg:sticky lg:top-0 lg:h-dvh lg:p-3">
        <div className="h-full overflow-hidden rounded-[22px] lg:rounded-[28px]">
          <BrandCanvas {...brand} />
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </main>
  )
}
