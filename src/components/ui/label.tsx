import type { LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn('text-xs font-medium uppercase tracking-[0.14em] text-mist', className)}
      {...props}
    />
  )
}
