import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function ensureDefaultFormTemplate(service: SupabaseClient, companyUserId: string) {
  const { count, error: countError } = await service
    .from('vendor_form_templates')
    .select('id', { count: 'exact', head: true })
    .eq('company_user_id', companyUserId)

  if (countError) return { error: countError.message }
  if ((count ?? 0) > 0) return { created: false }

  const { error } = await service.from('vendor_form_templates').insert({
    company_user_id: companyUserId,
    name: 'Default vendor form',
    description: 'Standard vendor onboarding template created automatically.',
    is_active: true,
    version: 1,
  })

  if (error) return { error: error.message }
  return { created: true }
}
