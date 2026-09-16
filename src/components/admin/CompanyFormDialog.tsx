import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CompanyFormValues } from '@/lib/admin-api'
import { validateCompanyForm } from '@/lib/validation'

type CompanyFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  values: CompanyFormValues
  pending: boolean
  error: string | null
  onClose: () => void
  onChange: (values: CompanyFormValues) => void
  onSubmit: () => Promise<void>
}

export function CompanyFormDialog({
  open,
  mode,
  values,
  pending,
  error,
  onClose,
  onChange,
  onSubmit,
}: CompanyFormDialogProps) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const isCreate = mode === 'create'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateCompanyForm(values, { requireEmail: isCreate })
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    await onSubmit()
  }

  return (
    <Dialog
      open={open}
      title={isCreate ? 'Add company user' : 'Edit company'}
      description={
        isCreate
          ? 'Creates a company Auth user, links a profile with role company, and queues a set-password email.'
          : 'Update company profile details. Email and role stay locked to protect authentication.'
      }
      onClose={onClose}
      className="max-w-xl"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field label="Full name" error={fieldErrors.full_name}>
          <Input
            value={values.full_name}
            onChange={(event) => onChange({ ...values, full_name: event.target.value })}
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            disabled={!isCreate}
            value={values.email}
            onChange={(event) => onChange({ ...values, email: event.target.value })}
          />
        </Field>
        <Field label="Company name" error={fieldErrors.company_name}>
          <Input
            value={values.company_name}
            onChange={(event) => onChange({ ...values, company_name: event.target.value })}
          />
        </Field>
        <Field label="Mobile number" error={fieldErrors.company_mobile_number}>
          <Input
            value={values.company_mobile_number}
            onChange={(event) => onChange({ ...values, company_mobile_number: event.target.value })}
          />
        </Field>
        <Field label="GST number" error={fieldErrors.gst_number}>
          <Input
            value={values.gst_number}
            onChange={(event) => onChange({ ...values, gst_number: event.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Company address">
          <Textarea
            value={values.company_address}
            onChange={(event) => onChange({ ...values, company_address: event.target.value })}
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : isCreate ? 'Create company user' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  )
}
