import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 py-3 text-sm text-ivory placeholder:text-mist/60 outline-none transition-colors focus:border-gold/60 focus:ring-2 focus:ring-gold/20',
        className,
      )}
      {...props}
    />
  )
}
