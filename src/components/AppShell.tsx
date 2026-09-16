import type { ReactNode } from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

type AppShellProps = {
  title: string
  eyebrow: string
  children: ReactNode
}

export function AppShell({ title, eyebrow, children }: AppShellProps) {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-navy-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">Aether VMS</p>
              <p className="text-sm text-ivory">Vendor Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm text-ivory">{profile?.email}</p>
              <p className="text-xs capitalize text-mist">{profile?.role} access</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl text-ivory sm:text-4xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  )
}
