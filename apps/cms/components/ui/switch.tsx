'use client'

import { Switch as S } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'peer relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors duration-300 ease-out-expo data-[state=checked]:bg-brand disabled:opacity-50',
        className
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-spring data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}

export function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string
  description?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-3">
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  )
}
