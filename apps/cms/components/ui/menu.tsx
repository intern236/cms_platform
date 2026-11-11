'use client'

import { DropdownMenu as M } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({ className, align = 'end', sideOffset = 8, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[220px] origin-[var(--radix-dropdown-menu-content-transform-origin)] overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-float',
          'data-[state=open]:animate-[menu-in_180ms_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[menu-out_120ms_ease-in]',
          className
        )}
        {...props}
      />
    </M.Portal>
  )
}

export function MenuItem({ className, danger, ...props }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted',
        danger ? 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger' : 'text-ink data-[highlighted]:bg-sunken',
        className
      )}
      {...props}
    />
  )
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2.5 pb-1 pt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint', className)} {...props} />
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1.5 my-1.5 h-px bg-line" />
}
