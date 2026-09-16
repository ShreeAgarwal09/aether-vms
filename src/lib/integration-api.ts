import { MESSAGES, userFacingError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'

type Fn = Record<string, unknown> & { error?: string; message?: string }

async function invokeBcFn(body: Record<string, unknown>): Promise<Fn> {
  const { data, error } = await getSupabase().functions.invoke<Fn>('vms-business-central', { body })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const parsed = (await response.json()) as Fn
        if (parsed.error) parsed.error = userFacingError(parsed.error, MESSAGES.bcConnect)
        return parsed
      } catch {
        return { error: userFacingError(error.message, MESSAGES.bcConnect) }
      }
    }
    return { error: userFacingError(error.message, MESSAGES.bcConnect) }
  }
  if (data?.error) data.error = userFacingError(data.error, MESSAGES.bcConnect)
  return data ?? {}
}

export const invokeBc = (body: Record<string, unknown>) => invokeBcFn(body)
