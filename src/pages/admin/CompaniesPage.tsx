import { useEffect, useMemo, useState } from 'react'
import { Ban, Building2, Mail, Pencil, Plus, Search, ShieldCheck, Trash2, Unlock } from 'lucide-react'
import { AdminPageHeader } from '@/components/AdminLayout'
import { CompanyFormDialog } from '@/components/admin/CompanyFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  companyToForm,
  createCompanyUser,
  deleteCompanyUser,
  emptyCompanyForm,
  fetchCompanyUsers,
  sendCompanyPasswordEmail,
  setCompanyActive,
  updateCompanyProfile,
  type CompanyFormValues,
} from '@/lib/admin-api'
import type { CompanyUser } from '@/lib/types'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'active' | 'blocked'
type Feedback = { tone: 'success' | 'error'; text: string } | null
type PendingAction = { type: 'block' | 'delete' | 'password'; company: CompanyUser } | null

export function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formValues, setFormValues] = useState<CompanyFormValues>(emptyCompanyForm())
  const [editing, setEditing] = useState<CompanyUser | null>(null)
  const [formPending, setFormPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [actionPending, setActionPending] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchCompanyUsers()
    if (loadError) {
      setError(loadError.message)
      setCompanies([])
    } else {
      setCompanies((data ?? []) as CompanyUser[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return companies.filter((company) => {
      if (status === 'active' && !company.is_active) return false
      if (status === 'blocked' && company.is_active) return false
      if (!needle) return true
      return [company.full_name, company.company_name, company.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [companies, query, status])

  const stats = {
    total: companies.length,
    active: companies.filter((company) => company.is_active).length,
    blocked: companies.filter((company) => !company.is_active).length,
  }

  function openCreate() {
    setFormMode('create')
    setEditing(null)
    setFormValues(emptyCompanyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(company: CompanyUser) {
    setFormMode('edit')
    setEditing(company)
    setFormValues(companyToForm(company))
    setFormError(null)
    setFormOpen(true)
  }

  async function handleFormSubmit() {
    setFormPending(true)
    setFormError(null)
    if (formMode === 'create') {
      const result = await createCompanyUser(formValues)
      if (result.error) {
        setFormError(result.error)
        setFormPending(false)
        return
      }
      setFeedback({ tone: 'success', text: result.message ?? 'Company user created and set-password email queued.' })
    } else if (editing) {
      const { error: updateError } = await updateCompanyProfile(editing.id, formValues)
      if (updateError) {
        setFormError(updateError.message)
        setFormPending(false)
        return
      }
      setFeedback({ tone: 'success', text: 'Company details saved.' })
    }
    setFormPending(false)
    setFormOpen(false)
    await load()
  }

  async function confirmPendingAction() {
    if (!pendingAction) return
    setActionPending(true)
    let result
    if (pendingAction.type === 'block') {
      result = await setCompanyActive(pendingAction.company.id, !pendingAction.company.is_active)
    } else if (pendingAction.type === 'delete') {
      result = await deleteCompanyUser(pendingAction.company.id)
    } else {
      result = await sendCompanyPasswordEmail(pendingAction.company.id)
    }

    if (result.error) {
      setFeedback({ tone: 'error', text: result.message ? `${result.error} ${result.message}` : result.error })
    } else if (pendingAction.type === 'block') {
      setFeedback({
        tone: 'success',
        text: pendingAction.company.is_active
          ? 'Company blocked. Existing sessions were revoked.'
          : 'Company unblocked and can sign in again.',
      })
    } else if (pendingAction.type === 'delete') {
      setFeedback({ tone: 'success', text: 'Company user deleted from Auth and profiles.' })
    } else {
      setFeedback({ tone: 'success', text: result.message ?? 'Set-password email queued.' })
    }

    setActionPending(false)
    setPendingAction(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Directory"
        title="Companies"
        description="Create company users, keep profiles current, block access, and send set-password email without exposing privileged keys in the browser."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add company user
          </Button>
        }
      />

      {feedback ? (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            feedback.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200',
          )}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total companies" value={stats.total} icon={Building2} />
        <StatCard label="Active" value={stats.active} icon={ShieldCheck} />
        <StatCard label="Blocked" value={stats.blocked} icon={Ban} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
              <Input
                className="pl-10"
                placeholder="Search name, company, or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="flex rounded-xl border border-line p-1">
              {(['all', 'active', 'blocked'] as StatusFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs uppercase tracking-[0.12em]',
                    status === value ? 'bg-gold text-ink' : 'text-mist',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {loading ? <LoadingState /> : null}
          {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
          {!loading && !error && filtered.length === 0 ? (
            <EmptyState
              hasCompanies={companies.length > 0}
              onCreate={openCreate}
            />
          ) : null}

          {!loading && !error && filtered.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.14em] text-mist">
                    <tr>
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Created</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((company) => (
                      <tr key={company.id} className="border-t border-line/70">
                        <td className="py-4">
                          <p className="text-ivory">{company.full_name || '—'}</p>
                          <p className="text-xs text-mist">{company.company_name || 'No company name'}</p>
                        </td>
                        <td className="py-4 text-mist">{company.email}</td>
                        <td className="py-4">
                          <Badge tone={company.is_active ? 'success' : 'danger'}>
                            {company.is_active ? 'Active' : 'Blocked'}
                          </Badge>
                        </td>
                        <td className="py-4 text-mist">{formatDate(company.created_at)}</td>
                        <td className="py-4">
                          <CompanyActions
                            company={company}
                            onEdit={() => openEdit(company)}
                            onBlock={() => setPendingAction({ type: 'block', company })}
                            onPassword={() => setPendingAction({ type: 'password', company })}
                            onDelete={() => setPendingAction({ type: 'delete', company })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {filtered.map((company) => (
                  <div key={company.id} className="rounded-xl border border-line bg-navy-950/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-ivory">{company.full_name || '—'}</p>
                        <p className="text-xs text-mist">{company.company_name || 'No company name'}</p>
                        <p className="mt-1 text-sm text-mist">{company.email}</p>
                      </div>
                      <Badge tone={company.is_active ? 'success' : 'danger'}>
                        {company.is_active ? 'Active' : 'Blocked'}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-mist">Created {formatDate(company.created_at)}</p>
                    <div className="mt-3">
                      <CompanyActions
                        company={company}
                        onEdit={() => openEdit(company)}
                        onBlock={() => setPendingAction({ type: 'block', company })}
                        onPassword={() => setPendingAction({ type: 'password', company })}
                        onDelete={() => setPendingAction({ type: 'delete', company })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <CompanyFormDialog
        open={formOpen}
        mode={formMode}
        values={formValues}
        pending={formPending}
        error={formError}
        onClose={() => setFormOpen(false)}
        onChange={setFormValues}
        onSubmit={handleFormSubmit}
      />

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={confirmTitle(pendingAction)}
        description={confirmDescription(pendingAction)}
        confirmLabel={confirmLabel(pendingAction)}
        danger={
          pendingAction?.type === 'delete' ||
          (pendingAction?.type === 'block' && pendingAction.company.is_active)
        }
        pending={actionPending}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void confirmPendingAction()}
      />
    </div>
  )
}

function CompanyActions({
  company,
  onEdit,
  onBlock,
  onPassword,
  onDelete,
}: {
  company: CompanyUser
  onEdit: () => void
  onBlock: () => void
  onPassword: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button size="sm" variant="outline" onClick={onBlock}>
        {company.is_active ? <Ban className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        {company.is_active ? 'Block' : 'Unblock'}
      </Button>
      <Button size="sm" variant="outline" onClick={onPassword}>
        <Mail className="h-3.5 w-3.5" />
        Password
      </Button>
      <Button size="sm" variant="outline" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Building2
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-mist">{label}</p>
          <p className="mt-2 font-display text-3xl text-ivory">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-gold" />
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-xl bg-navy-800/80" />
      ))}
    </div>
  )
}

function EmptyState({ hasCompanies, onCreate }: { hasCompanies: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl text-ivory">
        {hasCompanies ? 'No companies match these filters' : 'No company users yet'}
      </p>
      <p className="mt-2 text-sm text-mist">
        {hasCompanies
          ? 'Try a different search or status filter.'
          : 'Add the first company user to open the company portal.'}
      </p>
      {!hasCompanies ? (
        <Button className="mt-5" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Add company user
        </Button>
      ) : null}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-center">
      <p className="text-ivory">Could not load companies</p>
      <p className="mt-2 text-sm text-red-200">{message}</p>
      <Button className="mt-5" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function confirmTitle(action: PendingAction) {
  if (!action) return ''
  if (action.type === 'delete') return 'Delete this company user?'
  if (action.type === 'password') return 'Send set-password email?'
  return action.company.is_active ? 'Block this company?' : 'Unblock this company?'
}

function confirmDescription(action: PendingAction) {
  if (!action) return ''
  if (action.type === 'delete') {
    return `This removes ${action.company.email} from Auth and profiles. If vendor records exist, deletion will be refused and you should block the account instead.`
  }
  if (action.type === 'password') {
    return `Supabase Auth will email a secure password link to ${action.company.email}. This requires Auth email/SMTP to be configured.`
  }
  return action.company.is_active
    ? 'They will be signed out immediately and cannot enter the Company portal until unblocked.'
    : 'They will be allowed to sign in to the Company portal again.'
}

function confirmLabel(action: PendingAction) {
  if (!action) return 'Confirm'
  if (action.type === 'delete') return 'Delete company'
  if (action.type === 'password') return 'Send email'
  return action.company.is_active ? 'Block company' : 'Unblock company'
}
