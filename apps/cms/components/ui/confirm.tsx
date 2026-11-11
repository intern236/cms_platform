'use client'

import { useState } from 'react'
import { Button } from './button'
import { Dialog } from './dialog'

export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'ink'}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
