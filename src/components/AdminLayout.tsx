import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Building2, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const links = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/companies', label: 'Companies', icon: Building2, end: false },
]

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 border-r border-line bg-navy-950 p-5 transition-transform lg:static lg:w-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">Aether VMS</p>
              <p className="text-sm text-ivory">Admin console</p>
            </div>
          </div>
          <button type="button" className="text-mist lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-8 space-y-1 pb-36">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'bg-gold/15 text-gold' : 'text-mist hover:bg-navy-800 hover:text-ivory',
                )
              }
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-5 rounded-xl border border-line bg-navy-900/80 p-4">
          <p className="truncate text-sm text-ivory">{profile?.email}</p>
          <p className="mt-1 text-xs capitalize text-mist">{profile?.role} access</p>
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="min-h-svh">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-navy-950/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" className="text-ivory lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden text-sm text-mist lg:block">Company user management</p>
          <p className="text-sm text-ivory lg:hidden">Admin</p>
          <p className="hidden text-sm text-mist sm:block">{profile?.email}</p>
        </header>
        <main className="px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export { PageHeader as AdminPageHeader } from '@/components/PageHeader'
