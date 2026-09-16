import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/components/company/VendorStatusBadge'
import type { FormTemplate } from '@/lib/form-builder'
import {
  activateTemplate,
  createTemplate,
  deactivateTemplate,
  deleteTemplate,
  fetchTemplates,
} from '@/lib/form-builder-api'

export function FormBuilderPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchTemplates()
    if (loadError) {
      setError(loadError.message)
      setTemplates([])
    } else {
      setTemplates((data ?? []) as FormTemplate[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return templates
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(needle) ||
        (template.description ?? '').toLowerCase().includes(needle),
    )
  }, [query, templates])

  async function toggleActive(template: FormTemplate) {
    setPending(true)
    const result = template.is_active
      ? await deactivateTemplate(template.id)
      : await activateTemplate(template.id)
    setPending(false)
    if (result.error) {
      setFeedback(result.error.message)
      return
    }
    setFeedback(template.is_active ? 'Template deactivated.' : 'Template activated. Other templates were deactivated.')
    await load()
  }

  async function onDelete() {
    if (!deleteId) return
    setPending(true)
    const { error: deleteError } = await deleteTemplate(deleteId)
    setPending(false)
    if (deleteError) {
      setFeedback(deleteError.message)
      return
    }
    setDeleteId(null)
    setFeedback('Template deleted.')
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Templates"
        title="Form Builder"
        description="Create vendor form templates for your company. Preview is local only in this phase — vendors cannot fill these forms yet."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create template
          </Button>
        }
      />

      {feedback ? (
        <div className="rounded-xl border border-line bg-navy-900/80 px-4 py-3 text-sm text-mist">{feedback}</div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
            <Input
              className="pl-10"
              placeholder="Search templates"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-xl bg-navy-800/80" />
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-center">
              <p className="text-ivory">Could not load templates</p>
              <p className="mt-2 text-sm text-red-200">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : null}

          {!loading && !error && filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
              <p className="font-display text-xl text-ivory">
                {query.trim() ? 'No templates match this search' : 'No form templates yet'}
              </p>
              <p className="mt-2 text-sm text-mist">
                {query.trim()
                  ? 'Try a different name or description.'
                  : 'Create a template, then add text, email, integer, date/time, dropdown, radio, and checkbox fields.'}
              </p>
            </div>
          ) : null}

          <ul className="divide-y divide-line/70">
            {filtered.map((template) => (
              <li key={template.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/company/form-builder/${template.id}`}
                      className="truncate font-medium text-ivory hover:text-gold"
                    >
                      {template.name}
                    </Link>
                    <Badge tone={template.is_active ? 'success' : 'neutral'}>
                      {template.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {template.description ? <p className="mt-1 text-sm text-mist">{template.description}</p> : null}
                  <p className="mt-1 text-xs text-mist">
                    Updated {formatDateTime(template.updated_at)} · Created {formatDateTime(template.created_at)} · v
                    {template.version}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/company/form-builder/${template.id}`)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => void toggleActive(template)}>
                    {template.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(template.id)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <CreateTemplateDialog
        open={createOpen}
        pending={pending}
        existingNames={templates.map((template) => template.name)}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false)
          setFeedback('Template created.')
          navigate(`/company/form-builder/${id}`)
        }}
        setPending={setPending}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this template?"
        description="All fields on this template will be removed. This does not affect vendor records from earlier phases."
        confirmLabel="Delete template"
        danger
        pending={pending}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  )
}

function CreateTemplateDialog({
  open,
  pending,
  existingNames,
  onClose,
  onCreated,
  setPending,
}: {
  open: boolean
  pending: boolean
  existingNames: string[]
  onClose: () => void
  onCreated: (id: string) => void
  setPending: (value: boolean) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setIsActive(false)
      setError(null)
    }
  }, [open])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Template name is required.')
      return
    }
    if (trimmed.length > 80) {
      setError('Template name must be 80 characters or fewer.')
      return
    }
    if (existingNames.some((item) => item.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError('A template with this name already exists.')
      return
    }
    setPending(true)
    setError(null)
    const { data, error: createError } = await createTemplate({
      name: trimmed,
      description: description.trim() || null,
      is_active: isActive,
    })
    setPending(false)
    if (createError || !data) {
      setError(
        createError?.message.includes('vendor_form_templates_company_name_idx')
          ? 'A template with this name already exists.'
          : (createError?.message ?? 'Could not create template.'),
      )
      return
    }
    onCreated(data.id)
  }

  return (
    <Dialog
      open={open}
      title="Create template"
      description="Name the template, then add fields in the editor. Activating it will deactivate any other active template."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="new-name">Template name</Label>
          <Input id="new-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-description">Description</Label>
          <Textarea
            id="new-description"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-mist">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 accent-gold"
          />
          Active
        </label>
        {error ? <p className="text-sm text-red-200">{error}</p> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create and edit'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
