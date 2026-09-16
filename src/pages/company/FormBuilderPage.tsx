import { PageHeader } from '@/components/PageHeader'
import { PlaceholderPage } from '@/components/CompanyLayout'

export function FormBuilderPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Templates"
        title="Form builder"
        description="Dynamic vendor fields are scheduled for Phase 4. Navigation is in place so the company portal layout is complete."
      />
      <PlaceholderPage
        eyebrow="Phase 4"
        title="Custom vendor form builder is not enabled"
        body="You will be able to add text, email, integer, date/time, dropdown, radio, and checkbox fields here. Nothing in this screen writes template data yet."
      />
    </div>
  )
}
