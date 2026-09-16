import { MESSAGES, userFacingError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'

type Fn = Record<string, unknown> & { error?: string; message?: string }

async function invoke(name: 'vms-business-central' | 'vms-tally', body: Record<string, unknown>): Promise<Fn> {
  const { data, error } = await getSupabase().functions.invoke<Fn>(name, { body })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const parsed = (await response.json()) as Fn
        if (parsed.error) parsed.error = userFacingError(parsed.error, fallbackFor(name))
        return parsed
      } catch {
        return { error: userFacingError(error.message, fallbackFor(name)) }
      }
    }
    return { error: userFacingError(error.message, fallbackFor(name)) }
  }
  if (data?.error) data.error = userFacingError(data.error, fallbackFor(name))
  return data ?? {}
}

function fallbackFor(name: 'vms-business-central' | 'vms-tally') {
  return name === 'vms-tally' ? MESSAGES.tallyUnreachable : MESSAGES.bcConnect
}

export const invokeBc = (body: Record<string, unknown>) => invoke('vms-business-central', body)
export const invokeTally = (body: Record<string, unknown>) => invoke('vms-tally', body)
