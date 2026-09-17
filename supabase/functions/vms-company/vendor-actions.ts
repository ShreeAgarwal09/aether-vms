import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json } from './invite.ts'

export async function handleDeleteVendor(
  service: SupabaseClient,
  callerId: string,
  vendorId: string,
) {
  const { data: vendor } = await service
    .from('vendors')
    .select('id, company_user_id, status, bc_vendor_id')
    .eq('id', vendorId)
    .maybeSingle()

  if (!vendor || vendor.company_user_id !== callerId) {
    return json({ error: 'Vendor not found.' }, 404)
  }

  if (vendor.status === 'approved' && vendor.bc_vendor_id) {
    return json(
      { error: 'Approved vendors synced to Business Central cannot be deleted. Block the vendor instead.' },
      409,
    )
  }

  if (vendor.status === 'pending') {
    return json(
      { error: 'Pending submissions cannot be deleted. Reject the vendor or wait for resubmission.' },
      409,
    )
  }

  const { data: docs } = await service
    .from('vendor_documents')
    .select('storage_path')
    .eq('vendor_id', vendorId)

  const paths = (docs ?? [])
    .map((row: { storage_path?: string }) => row.storage_path)
    .filter(Boolean) as string[]

  if (paths.length) {
    await service.storage.from('vendor-documents').remove(paths)
  }

  await service.from('vendor_review_history').delete().eq('vendor_id', vendorId)
  await service.from('vendor_contact_persons').delete().eq('vendor_id', vendorId)
  await service.from('vendor_gst_locations').delete().eq('vendor_id', vendorId)
  await service.from('vendor_documents').delete().eq('vendor_id', vendorId)
  await service.from('integration_sync_logs').delete().eq('vendor_id', vendorId)

  const { error } = await service.from('vendors').delete().eq('id', vendorId).eq('company_user_id', callerId)
  if (error) return json({ error: 'Could not delete this vendor.' }, 400)

  return json({ success: true, message: 'Vendor record deleted.' })
}

export async function handleSetVendorBlocked(
  service: SupabaseClient,
  callerId: string,
  vendorId: string,
  blocked: boolean,
) {
  const { data: vendor } = await service
    .from('vendors')
    .select('id, company_user_id, status')
    .eq('id', vendorId)
    .maybeSingle()

  if (!vendor || vendor.company_user_id !== callerId) {
    return json({ error: 'Vendor not found.' }, 404)
  }

  if (blocked && vendor.status === 'approved') {
    return json({ error: 'Approved vendors cannot be blocked from this action.' }, 409)
  }

  const nextStatus = blocked ? 'blocked' : 'invited'
  const patch: Record<string, unknown> = { status: nextStatus }
  if (blocked) patch.invite_token_hash = null
  const { error } = await service
    .from('vendors')
    .update(patch)
    .eq('id', vendorId)
    .eq('company_user_id', callerId)

  if (error) return json({ error: blocked ? 'Could not block this vendor.' : 'Could not unblock this vendor.' }, 400)

  return json({
    success: true,
    status: nextStatus,
    message: blocked ? 'Vendor blocked. Their onboarding link no longer works.' : 'Vendor unblocked.',
  })
}
