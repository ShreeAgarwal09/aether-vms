import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invokeBc } from '@/lib/integration-api'

type Template = {
  id: string
  name: string
  is_active: boolean
  field_mappings: Array<{ vms: string; bc: string | null; supported: boolean; note?: string }>
}

export function BcVendorTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [defaults, setDefaults] = useState<Template['field_mappings']>([])
  const [name, setName] = useState('Default vendor map')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function load() {
    const result = await invokeBc({ action: 'list_templates' })
    if (result.error) setError(String(result.error))
    setTemplates((result.templates as Template[]) ?? [])
    setDefaults((result.default_mappings as Template['field_mappings']) ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function create(active: boolean) {
    setBusy(true)
    const result = await invokeBc({
      action: 'save_template',
      name,
      is_active: active,
      field_mappings: defaults,
    })
    setBusy(false)
    if (result.error) setError(String(result.error))
    else setNotice(String(result.message))
    await load()
  }

  async function activate(template: Template) {
    setBusy(true)
    const result = await invokeBc({
      action: 'save_template',
      id: template.id,
      name: template.name,
      field_mappings: template.field_mappings,
      is_active: true,
    })
    setBusy(false)
    if (result.error) setError(String(result.error))
    else setNotice('Template activated. Only one active template is kept per company.')
    await load()
  }

  async function duplicate(id: string) {
    setBusy(true)
    const result = await invokeBc({ action: 'save_template', duplicateFrom: id })
    setBusy(false)
    if (result.error) setError(String(result.error))
    else setNotice(String(result.message))
    await load()
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    const result = await invokeBc({ action: 'delete_template', id: deleteId })
    setBusy(false)
    setDeleteId(null)
    if (result.error) setError(String(result.error))
    else setNotice(String(result.message))
    await load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business Central"
        title="Vendor templates"
        description="Map VMS fields to standard Business Central vendor properties. Unsupported Indian GST locations, PAN, and vendor bank accounts stay documented — they are not posted as if they succeeded."
        action={
          <Link to="/company/integrations/business-central" className="text-sm text-gold">
            Back
          </Link>
        }
      />
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-line px-4 py-3 text-sm text-mist">{notice}</div> : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <Label htmlFor="tpl-name">New template</Label>
          <Input id="tpl-name" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void create(templates.every((row) => !row.is_active))}>
              Create
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void create(true)}>
              Create and activate
            </Button>
          </div>
        </CardContent>
      </Card>

      {templates.map((template) => (
        <Card key={template.id}>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-ivory">{template.name}</h2>
                <p className="text-sm text-mist">{template.is_active ? 'Active' : 'Inactive'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!template.is_active ? (
                  <Button size="sm" disabled={busy} onClick={() => void activate(template)}>
                    Activate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void invokeBc({
                        action: 'save_template',
                        id: template.id,
                        name: template.name,
                        field_mappings: template.field_mappings,
                        is_active: false,
                      }).then(() => load())
                    }
                  >
                    Deactivate
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void duplicate(template.id)}>
                  Duplicate
                </Button>
                <Button size="sm" variant="outline" disabled={busy || template.is_active} onClick={() => setDeleteId(template.id)}>
                  Delete
                </Button>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-mist">
              {template.field_mappings.map((map) => (
                <li key={map.vms}>
                  <span className="text-ivory">{map.vms}</span>
                  {' → '}
                  {map.supported ? map.bc : 'not supported'}
                  {map.note ? ` · ${map.note}` : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete unused template?"
        description="Active templates cannot be deleted."
        confirmLabel="Delete"
        danger
        pending={busy}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
