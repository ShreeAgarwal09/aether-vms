import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory placeholder:text-mist/60 outline-none transition-colors focus:border-gold/60 focus:ring-2 focus:ring-gold/20',
        className,
      )}
      {...props}
    />
  )
}
