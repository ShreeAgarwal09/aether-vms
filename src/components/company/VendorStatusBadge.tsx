import type { VendorStatus } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

export function VendorStatusBadge({ status }: { status: VendorStatus }) {
  const tone =
    status === 'approved'
      ? 'success'
      : status === 'rejected' || status === 'blocked'
        ? 'danger'
        : status === 'pending'
          ? 'warning'
          : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

export function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
