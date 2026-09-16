import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  isChoiceType,
  slugifyKey,
  uniqueKey,
  type FieldOption,
  type FormField,
} from '@/lib/form-builder'

export function FieldConfigPanel({
  field,
  fields,
  onChange,
}: {
  field: FormField | null
  fields: FormField[]
  onChange: (next: FormField) => void
}) {
  if (!field) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-mist">
        Select a field to configure its label, key, and validation.
      </div>
    )
  }

  const current = field

  function patch(partial: Partial<FormField>) {
    onChange({ ...current, ...partial })
  }

  function onLabel(label: string) {
    const nextKey = uniqueKey(slugifyKey(label), [], current.id, fields)
    patch({
      label,
      field_key:
        current.field_key === slugifyKey(current.label) || !current.field_key ? nextKey : current.field_key,
    })
  }

  function setOption(index: number, next: FieldOption) {
    const options = current.options.map((option, optionIndex) => (optionIndex === index ? next : option))
    patch({ options })
  }

  function addOption() {
    const n = current.options.length + 1
    patch({
      options: [...current.options, { label: `Option ${n}`, value: `option_${n}` }],
    })
  }

  const rules = field.validation_rules

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Field settings</p>
        <h3 className="mt-1 font-display text-xl text-ivory">{field.label || 'Untitled field'}</h3>
      </div>
      <div className="space-y-2">
        <Label htmlFor="field-label">{field.field_type === 'checkbox' ? 'Checkbox label' : 'Label'}</Label>
        <Input id="field-label" value={field.label} onChange={(event) => onLabel(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="field-key">Field key</Label>
        <Input
          id="field-key"
          value={field.field_key}
          onChange={(event) =>
            patch({
              field_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
            })
          }
        />
        <p className="text-xs text-mist">Lowercase letters, numbers, and underscores. Must be unique on this template.</p>
      </div>
      {field.field_type !== 'checkbox' && field.field_type !== 'radio' ? (
        <div className="space-y-2">
          <Label htmlFor="field-placeholder">Placeholder</Label>
          <Input
            id="field-placeholder"
            value={field.placeholder ?? ''}
            onChange={(event) => patch({ placeholder: event.target.value })}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="field-help">Help text</Label>
        <Textarea
          id="field-help"
          value={field.help_text ?? ''}
          onChange={(event) => patch({ help_text: event.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={field.is_required}
          onChange={(event) => patch({ is_required: event.target.checked })}
          className="h-4 w-4 accent-gold"
        />
        Required
      </label>

      {field.field_type === 'text' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="min-length">Min length</Label>
            <Input
              id="min-length"
              type="number"
              min={0}
              value={rules.minLength ?? ''}
              onChange={(event) =>
                patch({
                  validation_rules: {
                    ...rules,
                    minLength: event.target.value === '' ? undefined : Number(event.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-length">Max length</Label>
            <Input
              id="max-length"
              type="number"
              min={0}
              value={rules.maxLength ?? ''}
              onChange={(event) =>
                patch({
                  validation_rules: {
                    ...rules,
                    maxLength: event.target.value === '' ? undefined : Number(event.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}

      {field.field_type === 'email' ? (
        <p className="rounded-xl border border-line px-3 py-2 text-xs text-mist">
          Preview and future vendor forms require a valid email address.
        </p>
      ) : null}

      {field.field_type === 'integer' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="min-value">Minimum</Label>
            <Input
              id="min-value"
              type="number"
              step={1}
              value={rules.min ?? ''}
              onChange={(event) =>
                patch({
                  validation_rules: {
                    ...rules,
                    min: event.target.value === '' ? undefined : Number(event.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-value">Maximum</Label>
            <Input
              id="max-value"
              type="number"
              step={1}
              value={rules.max ?? ''}
              onChange={(event) =>
                patch({
                  validation_rules: {
                    ...rules,
                    max: event.target.value === '' ? undefined : Number(event.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}

      {field.field_type === 'datetime' ? (
        <label className="flex items-center gap-2 text-sm text-mist">
          <input
            type="checkbox"
            checked={rules.includeTime !== false}
            onChange={(event) =>
              patch({ validation_rules: { ...rules, includeTime: event.target.checked } })
            }
            className="h-4 w-4 accent-gold"
          />
          Include time
        </label>
      ) : null}

      {isChoiceType(field.field_type) ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Options</Label>
            <Button size="sm" variant="outline" onClick={addOption}>
              Add option
            </Button>
          </div>
          {field.options.map((option, index) => (
            <div key={`${field.id}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={option.label}
                placeholder="Label"
                onChange={(event) => {
                  const label = event.target.value
                  setOption(index, {
                    label,
                    value: option.value || slugifyKey(label),
                  })
                }}
              />
              <Input
                value={option.value}
                placeholder="value"
                onChange={(event) =>
                  setOption(index, {
                    ...option,
                    value: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ options: field.options.filter((_, optionIndex) => optionIndex !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
