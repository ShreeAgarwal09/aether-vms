import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Eye, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FieldConfigPanel } from '@/components/form-builder/FieldConfigPanel'
import { FormPreview } from '@/components/form-builder/FormPreview'
import { SortableFieldCard } from '@/components/form-builder/SortableFieldCard'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createDraftField,
  duplicateField,
  FIELD_TYPES,
  reindex,
  validateFields,
  type FieldType,
  type FormField,
  type FormTemplate,
} from '@/lib/form-builder'
import {
  activateTemplate,
  deactivateTemplate,
  fetchFields,
  fetchTemplate,
  saveTemplateFields,
  updateTemplate,
} from '@/lib/form-builder-api'
import { notifyTemplateUpdated } from '@/lib/vendor-api'

export function FormBuilderEditorPage() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const load = useCallback(async () => {
    if (!templateId) return
    setLoading(true)
    setError(null)
    const [{ data: nextTemplate, error: templateError }, fieldsResult] = await Promise.all([
      fetchTemplate(templateId),
      fetchFields(templateId),
    ])
    if (templateError || !nextTemplate) {
      setError(templateError?.message ?? 'Template not found.')
      setTemplate(null)
      setFields([])
    } else {
      setTemplate(nextTemplate as FormTemplate)
      setName(nextTemplate.name)
      setDescription(nextTemplate.description ?? '')
      setFields(fieldsResult.data)
      setSelectedId(fieldsResult.data[0]?.id ?? null)
      setDirty(false)
    }
    if (fieldsResult.error) setError(fieldsResult.error.message)
    setLoading(false)
  }, [templateId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const selected = fields.find((field) => field.id === selectedId) ?? null
  const ids = useMemo(() => fields.map((field) => field.id), [fields])

  function mark(next: FormField[]) {
    setFields(reindex(next))
    setDirty(true)
    setFeedback(null)
  }

  function addField(type: FieldType) {
    if (!templateId) return
    const field = createDraftField(type, templateId, fields)
    mark([...fields, field])
    setSelectedId(field.id)
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((field) => field.id === active.id)
    const newIndex = fields.findIndex((field) => field.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    mark(arrayMove(fields, oldIndex, newIndex))
  }

  async function onSave() {
    if (!template || !templateId || saving) return
    const trimmed = name.trim()
    if (!trimmed) {
      setFeedback('Template name is required.')
      return
    }
    if (trimmed.length > 80) {
      setFeedback('Template name must be 80 characters or fewer.')
      return
    }
    const fieldErrors = validateFields(fields)
    if (fieldErrors.length) {
      setFeedback(fieldErrors[0])
      return
    }
    setSaving(true)
    setFeedback(null)
    const meta = await updateTemplate(templateId, {
      name: trimmed,
      description: description.trim() || null,
    })
    if (meta.error) {
      setSaving(false)
      setFeedback(friendlyDbError(meta.error.message))
      return
    }
    const saved = await saveTemplateFields(templateId, fields, meta.data?.version ?? template.version)
    setSaving(false)
    if (saved.error) {
      setFeedback(friendlyDbError(saved.error.message))
      return
    }
    setTemplate(saved.data as FormTemplate)
    setDirty(false)
    setFeedback('Saved successfully.')
    if (saved.data?.is_active) {
      const notify = await notifyTemplateUpdated(templateId)
      if (notify.message) {
        setFeedback(`Saved successfully. ${notify.message}`)
      }
    }
  }

  async function toggleActive() {
    if (!template || saving) return
    if (dirty) {
      setFeedback('Save your changes before activating or deactivating this template.')
      return
    }
    setSaving(true)
    const result = template.is_active
      ? await deactivateTemplate(template.id)
      : await activateTemplate(template.id)
    setSaving(false)
    if (result.error) {
      setFeedback(result.error.message)
      return
    }
    await load()
    const activated = !template.is_active
    setFeedback(activated ? 'Template activated. Other templates were deactivated.' : 'Template deactivated.')
    if (activated && templateId) {
      const notify = await notifyTemplateUpdated(templateId)
      if (notify.message) setFeedback(`Template activated. ${notify.message}`)
    }
  }

  function requestLeave() {
    if (dirty) {
      setLeaveOpen(true)
      return
    }
    navigate('/company/form-builder')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-navy-800/80" />
        <div className="h-96 animate-pulse rounded-2xl bg-navy-800/80" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-10 text-center">
        <p className="text-ivory">Could not open this template</p>
        <p className="mt-2 text-sm text-red-200">{error}</p>
        <Link to="/company/form-builder" className="mt-5 inline-flex text-sm text-gold">
          Back to Form Builder
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Form builder"
        title={name || 'Untitled template'}
        description="Add fields, configure them, reorder, and save. Preview is local only — vendors cannot fill this form yet."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={requestLeave}>
              Back
            </Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4" />
              Preview form
            </Button>
            <Button variant="outline" onClick={() => void toggleActive()} disabled={saving}>
              {template.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button onClick={() => void onSave()} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        }
      />

      {feedback ? (
        <div className="rounded-xl border border-line bg-navy-900/80 px-4 py-3 text-sm text-mist">{feedback}</div>
      ) : null}
      {dirty ? <p className="text-xs text-gold">Unsaved changes</p> : null}

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value)
                setDirty(true)
              }}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              maxLength={500}
              onChange={(event) => {
                setDescription(event.target.value)
                setDirty(true)
              }}
            />
          </div>
          <p className="text-xs text-mist">
            Version {template.version} · {template.is_active ? 'Active' : 'Inactive'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Field types</p>
            {FIELD_TYPES.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => addField(item.type)}
                className="block w-full rounded-xl border border-line px-3 py-2 text-left hover:border-gold/40 hover:bg-navy-800/80"
              >
                <span className="text-sm text-ivory">{item.label}</span>
                <span className="mt-0.5 block text-xs text-mist">{item.hint}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {fields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
              <p className="font-display text-xl text-ivory">No fields yet</p>
              <p className="mt-2 text-sm text-mist">Choose a field type on the left to start building this form.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {fields.map((field, index) => (
                  <SortableFieldCard
                    key={field.id}
                    field={field}
                    selected={field.id === selectedId}
                    canMoveUp={index > 0}
                    canMoveDown={index < fields.length - 1}
                    onSelect={() => setSelectedId(field.id)}
                    onDuplicate={() => {
                      const next = duplicateField(field, fields)
                      mark(next)
                      const copy = next[index + 1]
                      if (copy) setSelectedId(copy.id)
                    }}
                    onDelete={() => setDeleteFieldId(field.id)}
                    onMove={(direction) => {
                      const nextIndex = index + direction
                      if (nextIndex < 0 || nextIndex >= fields.length) return
                      mark(arrayMove(fields, index, nextIndex))
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <FieldConfigPanel
              field={selected}
              fields={fields}
              onChange={(next) => {
                mark(fields.map((field) => (field.id === next.id ? next : field)))
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={previewOpen}
        title="Preview form"
        description="This is how a vendor would see the current fields. Nothing is submitted."
        onClose={() => setPreviewOpen(false)}
        className="max-w-2xl"
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <FormPreview fields={fields} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteFieldId)}
        title="Delete this field?"
        description="The field will be removed from this template after you save. You can cancel if this was accidental."
        confirmLabel="Delete field"
        danger
        onClose={() => setDeleteFieldId(null)}
        onConfirm={() => {
          const next = fields.filter((field) => field.id !== deleteFieldId)
          mark(next)
          if (selectedId === deleteFieldId) setSelectedId(next[0]?.id ?? null)
          setDeleteFieldId(null)
        }}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="Leave without saving?"
        description="You have unsaved template or field changes. Leave anyway, or cancel and save first."
        confirmLabel="Leave"
        danger
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => navigate('/company/form-builder')}
      />
    </div>
  )
}

function friendlyDbError(message: string) {
  if (message.includes('vendor_form_templates_company_name_idx')) {
    return 'A template with this name already exists.'
  }
  if (message.includes('vendor_form_fields_template_key_idx')) {
    return 'Each field key must be unique on this template.'
  }
  return message
}
