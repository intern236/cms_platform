'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Code, Eye, Warning } from '@phosphor-icons/react'
import { pageDescription, pageTitle } from '@/lib/content/post-page-meta'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'

/**
 * "HTML page" posts: paste a whole page, see it rendered beside the source.
 *
 * The preview is a sandboxed iframe with NO script permission and an opaque
 * origin, so nothing in a pasted page can run or reach the admin. On save the
 * server's page sanitiser strips scripts and handlers anyway.
 */
export function HtmlEditor({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [view, setView] = useState<'split' | 'code' | 'preview'>('split')
  const deferred = useDeferredValue(value)
  const title = useMemo(() => pageTitle(deferred), [deferred])
  const description = useMemo(() => pageDescription(deferred), [deferred])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <Detected ok={Boolean(title)} label={title ? `Title: ${title}` : 'No <title> found'} />
          <Detected ok={Boolean(description)} label={description ? 'Meta description found' : 'No meta description'} />
        </div>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'code', label: <Code size={14} /> },
            { value: 'split', label: 'Split' },
            { value: 'preview', label: <Eye size={14} /> },
          ]}
        />
      </div>
      <div className={cn('grid gap-3', view === 'split' && 'xl:grid-cols-2')}>
        {view !== 'preview' && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            placeholder={'<!DOCTYPE html>\n<html>\n<head>\n  <title>Your page title</title>\n  <meta name="description" content="…">\n</head>\n<body>\n  …\n</body>\n</html>'}
            className={cn(
              'min-h-[60vh] w-full resize-y rounded-2xl bg-[#111113] p-4 font-mono text-[12.5px] leading-relaxed text-[#e6e5e1] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] placeholder:text-white/25 focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--brand)]',
              error && 'shadow-[inset_0_0_0_1.5px_var(--danger)]'
            )}
          />
        )}
        {view !== 'code' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-[60vh] overflow-hidden rounded-2xl border border-line bg-white">
            {deferred.trim() ? (
              <iframe title="Page preview" sandbox="" srcDoc={deferred} className="size-full min-h-[60vh] bg-white" />
            ) : (
              <div className="grid size-full min-h-[60vh] place-items-center text-sm text-muted">Paste a page to preview it here.</div>
            )}
          </motion.div>
        )}
      </div>
      {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
      <p className="text-[12.5px] text-muted">Scripts and event handlers are removed when you save. Styles, layout, embeds and JSON-LD are kept.</p>
    </div>
  )
}

function Detected({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex max-w-[320px] items-center gap-1.5 truncate rounded-full px-2.5 py-1', ok ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
      {ok ? <Check size={12} weight="bold" /> : <Warning size={12} weight="bold" />}
      <span className="truncate">{label}</span>
    </span>
  )
}
