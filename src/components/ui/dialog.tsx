import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DialogProps = {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Dialog({ open, title, description, onClose, children, className }: DialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'relative z-10 w-full max-w-lg rounded-2xl border border-line bg-navy-900 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]',
          className,
        )}
      >
        <h2 id="dialog-title" className="font-display text-2xl text-ivory">
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm leading-6 text-mist">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  pending?: boolean
  danger?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  danger,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} description={description} onClose={onClose}>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          className={danger ? 'bg-red-500 text-white hover:bg-red-400' : undefined}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
