'use client'

import { useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Popover } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowArcLeft,
  ArrowArcRight,
  CaretDown,
  Code,
  CodeBlock,
  ImageSquare,
  LinkSimple,
  LinkBreak,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  Table,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  CursorClick,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type Btn = { label: string; icon: React.ReactNode; active?: boolean; disabled?: boolean; run: () => void; shortcut?: string }

function ToolButton({ b, compact }: { b: Btn; compact?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={b.run}
      disabled={b.disabled}
      aria-label={b.label}
      aria-pressed={b.active}
      title={b.shortcut ? `${b.label} (${b.shortcut})` : b.label}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30',
        compact ? 'size-8' : 'size-9',
        b.active && 'text-ink'
      )}
    >
      {b.active && <motion.span layoutId={compact ? undefined : undefined} className="absolute inset-0 rounded-lg bg-sunken" />}
      <span className="relative">{b.icon}</span>
    </button>
  )
}

const BLOCKS = [
  { label: 'Paragraph', value: 'p' },
  { label: 'Heading', value: 'h2' },
  { label: 'Subheading', value: 'h3' },
  { label: 'Small heading', value: 'h4' },
] as const

export function EditorToolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : e.isActive('heading', { level: 4 }) ? 'h4' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  const sep = <span className="mx-1 h-5 w-px bg-line" />

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
      <BlockPicker editor={editor} value={s.block} />
      {sep}
      {(
        [
          { label: 'Bold', icon: <TextB size={17} weight="bold" />, active: s.bold, run: () => c().toggleBold().run(), shortcut: '⌘B' },
          { label: 'Italic', icon: <TextItalic size={17} />, active: s.italic, run: () => c().toggleItalic().run(), shortcut: '⌘I' },
          { label: 'Underline', icon: <TextUnderline size={17} />, active: s.underline, run: () => c().toggleUnderline().run(), shortcut: '⌘U' },
          { label: 'Strikethrough', icon: <TextStrikethrough size={17} />, active: s.strike, run: () => c().toggleStrike().run() },
          { label: 'Inline code', icon: <Code size={17} />, active: s.code, run: () => c().toggleCode().run() },
        ] as Btn[]
      ).map((b) => (
        <ToolButton key={b.label} b={b} />
      ))}
      <LinkControl editor={editor} active={s.link} />
      {sep}
      {(
        [
          { label: 'Bulleted list', icon: <ListBullets size={17} />, active: s.bullet, run: () => c().toggleBulletList().run() },
          { label: 'Numbered list', icon: <ListNumbers size={17} />, active: s.ordered, run: () => c().toggleOrderedList().run() },
          { label: 'Quote', icon: <Quotes size={17} />, active: s.quote, run: () => c().toggleBlockquote().run() },
          { label: 'Code block', icon: <CodeBlock size={17} />, active: s.codeBlock, run: () => c().toggleCodeBlock().run() },
          { label: 'Divider', icon: <Minus size={17} />, run: () => c().setHorizontalRule().run() },
          { label: 'Image', icon: <ImageSquare size={17} />, run: onImage },
          {
            label: s.table ? 'Delete table' : 'Insert table',
            icon: <Table size={17} />,
            active: s.table,
            run: () => (s.table ? c().deleteTable().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
          },
        ] as Btn[]
      ).map((b) => (
        <ToolButton key={b.label} b={b} />
      ))}
      <AnimatePresence>
        {s.table && (
          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="flex items-center gap-0.5 overflow-hidden">
            {sep}
            {[
              ['+ Row', () => c().addRowAfter().run()],
              ['+ Col', () => c().addColumnAfter().run()],
              ['− Row', () => c().deleteRow().run()],
              ['− Col', () => c().deleteColumn().run()],
            ].map(([label, run]) => (
              <button
                key={label as string}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={run as () => void}
                className="h-8 whitespace-nowrap rounded-lg px-2 font-mono text-[11px] text-ink-2 hover:bg-sunken"
              >
                {label as string}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <span className="flex-1" />
      <ToolButton b={{ label: 'Undo', icon: <ArrowArcLeft size={17} />, disabled: !s.canUndo, run: () => c().undo().run(), shortcut: '⌘Z' }} />
      <ToolButton b={{ label: 'Redo', icon: <ArrowArcRight size={17} />, disabled: !s.canRedo, run: () => c().redo().run(), shortcut: '⇧⌘Z' }} />
    </div>
  )
}

function BlockPicker({ editor, value }: { editor: Editor; value: string }) {
  const [open, setOpen] = useState(false)
  const current = BLOCKS.find((b) => b.value === value) ?? BLOCKS[0]
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" onMouseDown={(e) => e.preventDefault()} className="flex h-9 w-[130px] shrink-0 items-center justify-between rounded-lg px-2.5 text-[13px] font-medium text-ink hover:bg-sunken">
          {current.label}
          <CaretDown size={12} className="text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()} className="z-50 w-52 rounded-2xl border border-line bg-surface p-1.5 shadow-float data-[state=open]:animate-[menu-in_160ms_cubic-bezier(0.16,1,0.3,1)]">
          {BLOCKS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => {
                const chain = editor.chain().focus()
                if (b.value === 'p') chain.setParagraph().run()
                else chain.toggleHeading({ level: Number(b.value[1]) as 2 | 3 | 4 }).run()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center rounded-xl px-2.5 py-2 text-left hover:bg-sunken',
                b.value === 'h2' && 'font-serif text-[22px] leading-none',
                b.value === 'h3' && 'text-[16px] font-semibold',
                b.value === 'h4' && 'text-[14px] font-semibold',
                b.value === 'p' && 'text-sm',
                b.value === value && 'bg-sunken'
              )}
            >
              {b.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function normaliseHref(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v
  if (v.startsWith('/') && !v.startsWith('//')) return v
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`
  return null
}

export function LinkControl({ editor, active, compact }: { editor: Editor; active: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  const [button, setButton] = useState<'none' | 'solid' | 'outline'>('none')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (o) {
          const attrs = editor.getAttributes('link') as { href?: string; button?: string | null }
          setHref(attrs.href ?? '')
          setButton(attrs.button === 'outline' ? 'outline' : attrs.button ? 'solid' : 'none')
          setError(false)
        }
        setOpen(o)
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Link"
          className={cn('relative grid place-items-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink', compact ? 'size-8' : 'size-9', active && 'bg-sunken text-ink')}
        >
          <LinkSimple size={17} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          className="z-50 w-80 rounded-2xl border border-line bg-surface p-3 shadow-float data-[state=open]:animate-[menu-in_160ms_cubic-bezier(0.16,1,0.3,1)]"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const value = normaliseHref(href)
              if (!value) {
                setError(true)
                return
              }
              editor
                .chain()
                .focus()
                .extendMarkRange('link')
                .setLink({ href: value })
                .updateAttributes('link', { button: button === 'none' ? null : button })
                .run()
              setOpen(false)
            }}
          >
            <input
              ref={inputRef}
              value={href}
              onChange={(e) => {
                setHref(e.target.value)
                setError(false)
              }}
              placeholder="https://… or /contact"
              aria-invalid={error}
              className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm shadow-[inset_0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--brand)] aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--danger)]"
            />
            <div className="mt-2.5 flex items-center gap-1 rounded-full bg-sunken p-0.5 text-[12px]">
              {(['none', 'solid', 'outline'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setButton(v)}
                  className={cn('flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 font-medium', button === v ? 'bg-surface text-ink shadow-card' : 'text-muted')}
                >
                  {v !== 'none' && <CursorClick size={12} />}
                  {v === 'none' ? 'Text link' : v === 'solid' ? 'Button' : 'Outline'}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              {active ? (
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run()
                    setOpen(false)
                  }}
                  className="flex items-center gap-1 text-[12.5px] text-danger"
                >
                  <LinkBreak size={13} /> Remove link
                </button>
              ) : (
                <span />
              )}
              <button type="submit" className="rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-medium text-canvas">
                Apply
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Floats over selected text: the five things people do to a selection. */
export function SelectionBubble({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
    }),
  })
  const c = () => editor.chain().focus()
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive('image') && !e.isActive('codeBlock')}
      className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-float"
    >
      {(
        [
          { label: 'Heading', icon: <span className="font-serif text-[17px] leading-none">H</span>, active: s.h2, run: () => c().toggleHeading({ level: 2 }).run() },
          { label: 'Bold', icon: <TextB size={16} weight="bold" />, active: s.bold, run: () => c().toggleBold().run() },
          { label: 'Italic', icon: <TextItalic size={16} />, active: s.italic, run: () => c().toggleItalic().run() },
          { label: 'Strikethrough', icon: <TextStrikethrough size={16} />, active: s.strike, run: () => c().toggleStrike().run() },
          { label: 'Inline code', icon: <Code size={16} />, active: s.code, run: () => c().toggleCode().run() },
        ] as Btn[]
      ).map((b) => (
        <ToolButton key={b.label} b={b} compact />
      ))}
      <LinkControl editor={editor} active={s.link} compact />
    </BubbleMenu>
  )
}
