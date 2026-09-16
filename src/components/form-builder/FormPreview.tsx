import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FormField } from '@/lib/form-builder'

export function FormPreview({ fields }: { fields: FormField[] }) {
  const ordered = useMemo(
    () => [...fields].sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  )
  const [notice, setNotice] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('Preview only. Vendor data is not submitted, stored, or emailed in this phase.')
  }

  if (ordered.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-mist">
        Add fields to preview how a vendor would see this form.
      </p>
    )
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate={false}>
      {ordered.map((field) => (
        <PreviewControl key={field.id} field={field} />
      ))}
      {notice ? <p className="text-sm text-gold">{notice}</p> : null}
      <Button type="submit">Check preview validation</Button>
    </form>
  )
}

function PreviewControl({ field }: { field: FormField }) {
  const requiredMark = field.is_required ? <span className="text-gold"> *</span> : null
  const help = field.help_text ? <p className="mt-1 text-xs text-mist">{field.help_text}</p> : null
  const rules = field.validation_rules

  if (field.field_type === 'checkbox') {
    return (
      <div>
        <label className="flex items-start gap-3 text-sm text-ivory">
          <input type="checkbox" required={field.is_required} className="mt-1 h-4 w-4 accent-gold" />
          <span>
            {field.label}
            {requiredMark}
          </span>
        </label>
        {help}
      </div>
    )
  }

  if (field.field_type === 'radio') {
    return (
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-[0.14em] text-mist">
          {field.label}
          {requiredMark}
        </legend>
        <div className="mt-2 space-y-2">
          {field.options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-ivory">
              <input type="radio" name={field.field_key} value={option.value} required={field.is_required} />
              {option.label}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    )
  }

  if (field.field_type === 'dropdown') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {requiredMark}
        </Label>
        <select
          id={field.id}
          required={field.is_required}
          className="h-11 w-full rounded-lg border border-line bg-navy-950/70 px-3.5 text-sm text-ivory outline-none focus:border-gold/60"
          defaultValue=""
        >
          <option value="" disabled>
            {field.placeholder || 'Select an option'}
          </option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {help}
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
    <div className="space-y-2">
      <Label htmlFor={field.id}>
        {field.label}
        {requiredMark}
      </Label>
      <Input
        id={field.id}
        type={inputType}
        required={field.is_required}
        placeholder={field.placeholder ?? undefined}
        minLength={rules.minLength}
        maxLength={rules.maxLength}
        min={rules.min}
        max={rules.max}
        step={field.field_type === 'integer' ? 1 : undefined}
      />
      {help}
    </div>
  )
}
