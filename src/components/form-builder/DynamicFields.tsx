import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FormField } from '@/lib/form-builder'
import type { SnapshotField } from '@/lib/onboarding'

export function DynamicFields({
  fields,
  values,
  errors,
  onChange,
}: {
  fields: Array<FormField | SnapshotField>
  values: Record<string, string | boolean | number | null>
  errors?: Record<string, string>
  onChange: (key: string, value: string | boolean | number | null) => void
}) {
  const ordered = [...fields].sort((a, b) => a.sort_order - b.sort_order)
  if (!ordered.length) return null

  return (
    <div className="space-y-5">
      {ordered.map((field) => {
        const error = errors?.[`custom_${field.field_key}`]
        const requiredMark = field.is_required ? <span className="text-gold"> *</span> : null
        const help = field.help_text ? <p className="mt-1 text-xs text-mist">{field.help_text}</p> : null
        const value = values[field.field_key]
        const rules = field.validation_rules

        if (field.field_type === 'checkbox') {
          return (
            <div key={field.id}>
              <label className="flex items-start gap-3 text-sm text-ivory">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-gold"
                  checked={value === true}
                  onChange={(event) => onChange(field.field_key, event.target.checked)}
                />
                <span>
                  {field.label}
                  {requiredMark}
                </span>
              </label>
              {help}
              {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
            </div>
          )
        }

        if (field.field_type === 'radio') {
          return (
            <fieldset key={field.id}>
              <legend className="text-xs font-medium uppercase tracking-[0.14em] text-mist">
                {field.label}
                {requiredMark}
              </legend>
              <div className="mt-2 space-y-2">
                {field.options.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-ivory">
                    <input
                      type="radio"
                      name={field.field_key}
                      value={option.value}
                      checked={value === option.value}
                      onChange={() => onChange(field.field_key, option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {help}
              {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
            </fieldset>
          )
        }

        if (field.field_type === 'dropdown') {
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>
                {field.label}
                {requiredMark}
              </Label>
              <select
                id={field.id}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(field.field_key, event.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory outline-none focus:border-gold/60"
              >
                <option value="">{field.placeholder || 'Select an option'}</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {help}
              {error ? <p className="text-xs text-red-300">{error}</p> : null}
            </div>
          )
        }

        const inputType =
          field.field_type === 'email'
            ? 'email'
            : field.field_type === 'integer'
              ? 'number'
              : field.field_type === 'datetime'
                ? rules.includeTime === false
                  ? 'date'
                  : 'datetime-local'
                : 'text'

        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {requiredMark}
            </Label>
            <Input
              id={field.id}
              type={inputType}
              placeholder={field.placeholder ?? undefined}
              minLength={rules.minLength}
              maxLength={rules.maxLength}
              min={rules.min}
              max={rules.max}
              step={field.field_type === 'integer' ? 1 : undefined}
              value={value === true || value === false || value == null ? '' : String(value)}
              onChange={(event) =>
                onChange(
                  field.field_key,
                  field.field_type === 'integer'
                    ? event.target.value === ''
                      ? ''
                      : Number(event.target.value)
                    : event.target.value,
                )
              }
            />
            {help}
            {error ? <p className="text-xs text-red-300">{error}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
