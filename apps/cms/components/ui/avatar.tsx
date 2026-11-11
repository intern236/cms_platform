import { cn, hueFor, initials } from '@/lib/utils'

/** Initials on a soft, name-derived colour. Deterministic, so a person keeps their colour. */
export function Avatar({ name, size = 32, className, src }: { name: string; size?: number; className?: string; src?: string | null }) {
  const hue = hueFor(name)
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  }
  return (
    <span
      aria-hidden
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-medium', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        background: `oklch(0.9 0.06 ${hue})`,
        color: `oklch(0.35 0.08 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  )
}

/** A workspace's mark: their logo on white, or their initials on their brand colour. */
export function WorkspaceMark({
  slug,
  name,
  accent,
  hasLogo,
  size = 32,
  className,
  version,
}: {
  slug: string
  name: string
  accent: string
  hasLogo: boolean
  size?: number
  className?: string
  version?: number
}) {
  const radius = Math.round(size * 0.3)
  if (hasLogo) {
    return (
      <span
        className={cn('inline-grid shrink-0 place-items-center overflow-hidden bg-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]', className)}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/${slug}/logo${version ? `?v=${version}` : ''}`} alt="" className="max-h-[72%] max-w-[72%] object-contain" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn('inline-grid shrink-0 place-items-center font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]', className)}
      style={{ width: size, height: size, borderRadius: radius, background: accent, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name).slice(0, size < 28 ? 1 : 2)}
    </span>
  )
}
