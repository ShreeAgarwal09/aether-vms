import { useState, type ChangeEvent } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { inviteVendorsBulk } from '@/lib/vendor-api'
import { validateVendorInvite } from '@/lib/validation'

type Row = { vendor_name: string; email: string; vendor_phone: string }

export function BulkInvitePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [failures, setFailures] = useState<Array<{ email?: string; error?: string }>>([])

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet([
      { 'Vendor name': 'Acme Supplies', 'Vendor email': 'accounts@acme.example', 'Vendor phone': '9876543210' },
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Vendors')
    XLSX.writeFile(workbook, 'vendor-invite-template.xlsx')
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileError(null)
    setSummary(null)
    setFailures([])
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(reader.result, { type: 'array' })
        const first = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(first)
        const parsed: Row[] = []
        for (const item of json) {
          const row = {
            vendor_name: String(item['Vendor name'] ?? item.vendor_name ?? '').trim(),
            email: String(item['Vendor email'] ?? item.email ?? '').trim(),
            vendor_phone: String(item['Vendor phone'] ?? item.vendor_phone ?? item.phone ?? '').trim(),
          }
          const errors = validateVendorInvite(row)
          if (Object.keys(errors).length) {
            setFileError(`Row for ${row.email || row.vendor_name || 'unknown'} is invalid. Use the template headers.`)
            setRows([])
            return
          }
          parsed.push(row)
        }
        if (!parsed.length) {
          setFileError('The spreadsheet does not contain any vendor rows.')
          setRows([])
          return
        }
        setRows(parsed)
      } catch {
        setFileError('Could not read that Excel file.')
        setRows([])
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function submit() {
    setPending(true)
    const result = await inviteVendorsBulk(rows)
    setPending(false)
    if (result.error) {
      setFileError(result.error)
      return
    }
    setSummary(`Created ${result.created ?? 0}. Failed ${result.failed ?? 0}.`)
    setFailures((result.results ?? []).filter((item) => !item.ok))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Invitations"
        title="Bulk Excel invite"
        description="Upload an .xlsx file with Vendor name, Vendor email, and Vendor phone. Each row is created for your company only through the vms-company function."
        action={
          <Button variant="outline" onClick={() => void downloadTemplate()}>
            Download template
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={onFile}
            className="block w-full text-sm text-mist file:mr-4 file:rounded-lg file:border-0 file:bg-gold file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          {fileError ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{fileError}</p>
          ) : null}
          {rows.length ? <p className="text-sm text-mist">{rows.length} valid row{rows.length === 1 ? '' : 's'} ready to invite.</p> : null}
          {summary ? <p className="text-sm text-emerald-200">{summary}</p> : null}
          {failures.length ? (
            <ul className="space-y-1 text-sm text-red-200">
              {failures.map((item) => (
                <li key={`${item.email}-${item.error}`}>{item.email}: {item.error}</li>
              ))}
            </ul>
          ) : null}
          <Button onClick={() => void submit()} disabled={!rows.length || pending}>
            {pending ? 'Inviting…' : 'Invite from Excel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
