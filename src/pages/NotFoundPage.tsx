import { Link } from 'react-router-dom'
import { ScreenState } from '@/components/ScreenState'

export function NotFoundPage() {
  return (
    <ScreenState
      title="Page not found"
      body="That route is not part of this workspace."
      action={
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          Go home
        </Link>
      }
    />
  )
}
