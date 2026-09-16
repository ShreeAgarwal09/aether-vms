import { getSupabase } from '@/lib/supabase'

type Fn = Record<string, unknown> & { error?: string; message?: string }

async function invoke(name: 'vms-business-central' | 'vms-tally', body: Record<string, unknown>): Promise<Fn> {
  const { data, error } = await getSupabase().functions.invoke<Fn>(name, { body })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        return (await response.json()) as Fn
      } catch {
        return { error: error.message }
      }
    }
    return { error: error.message }
  }
  return data ?? {}
}

export const invokeBc = (body: Record<string, unknown>) => invoke('vms-business-central', body)
export const invokeTally = (body: Record<string, unknown>) => invoke('vms-tally', body)
