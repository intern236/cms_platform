'use client'

import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsClockwise, ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react'
import { ACCEPT_ATTRIBUTE, type CloudinaryImage, type MediaFolder } from '@/lib/cloudinary/types'
import { startUpload } from '@/lib/cloudinary/upload-client'
import { coverUrl, avatarUrl } from '@/lib/cloudinary/url'
import { cn } from '@/lib/utils'

/**
 * Drop an image, watch it upload, see it land. Used for post covers and author
 * photos. Replacing keeps the old image until the post is saved; the server then
 * deletes what nothing uses any more.
 */
export function ImageDrop({
  workspace,
  kind,
  value,
  onChange,
  round,
  className,
}: {
  workspace: string
  kind: MediaFolder
  value: CloudinaryImage | null
  onChange: (image: CloudinaryImage | null) => void
  round?: boolean
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    setLocal(URL.createObjectURL(file))
    setProgress(0)
    const handle = startUpload(workspace, file, kind, (p) => setProgress(p.percent))
    const result = await handle.done
    setProgress(null)
    if (result.ok) onChange(result.image)
    else {
      setError(result.error)
      setLocal(null)
    }
  }

  const src = local ?? (value ? (kind === 'avatar' ? avatarUrl(value.publicId, 320) : coverUrl(value.publicId, 960)) : null)

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void upload(file)
        }}
        className={cn(
          'group relative overflow-hidden bg-surface-2 transition-all duration-300',
          round ? 'aspect-square w-32 rounded-full' : 'aspect-[16/9] w-full rounded-2xl',
          'shadow-[inset_0_0_0_1px_var(--line-strong)]',
          dragging && 'scale-[1.01] shadow-[inset_0_0_0_2px_var(--brand),var(--ring)]'
        )}
      >
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className={cn('absolute inset-0 size-full object-cover transition duration-700', progress !== null && 'scale-105 blur-[2px] brightness-75')} />
            {progress === null && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition duration-300 group-hover:bg-black/35 group-hover:opacity-100">
                <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ink shadow">
                  <ArrowsClockwise size={14} /> Replace
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocal(null)
                    onChange(null)
                  }}
                  className="grid size-8 place-items-center rounded-full bg-white text-danger shadow"
                  aria-label="Remove image"
                >
                  <Trash size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted transition hover:text-ink">
            <motion.span animate={dragging ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }} className="grid size-11 place-items-center rounded-2xl bg-surface shadow-card">
              {dragging ? <UploadSimple size={20} /> : <ImageSquare size={20} />}
            </motion.span>
            {!round && (
              <span className="text-[13px]">
                <span className="font-medium text-ink">Drop an image</span> or click to choose
              </span>
            )}
          </button>
        )}
        <AnimatePresence>
          {progress !== null && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center">
              <ProgressRing value={progress} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
      />
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 text-[12.5px] font-medium text-danger">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProgressRing({ value }: { value: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid size-16 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="4" />
        <motion.circle cx="28" cy="28" r={r} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} animate={{ strokeDashoffset: c - (value / 100) * c }} />
      </svg>
      <span className="font-mono text-xs font-semibold text-white">{value}%</span>
    </div>
  )
}
