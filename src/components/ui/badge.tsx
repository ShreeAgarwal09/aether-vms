import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'success' | 'danger' | 'neutral' | 'warning'
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em]',
        tone === 'success' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'warning' && 'bg-amber-500/15 text-amber-200',
        tone === 'danger' && 'bg-red-500/15 text-red-300',
        tone === 'neutral' && 'bg-navy-800 text-mist',
        className,
      )}
      {...props}
    />
  )
}
