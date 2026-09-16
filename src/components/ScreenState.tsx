import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ScreenStateProps = {
  title: string
  body: string
  loading?: boolean
  action?: ReactNode
  className?: string
}

export function ScreenState({ title, body, loading = false, action, className }: ScreenStateProps) {
  return (
    <div className={cn('flex min-h-svh items-center justify-center px-6', className)}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-navy-900/80 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        {loading ? (
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
        ) : null}
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold">Vendor Management</p>
        <h1 className="mt-3 font-display text-2xl text-ivory">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-mist">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  )
}
