import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function loadProfile(userId: string): Promise<Profile> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, company_name, company_mobile_number, company_address, gst_number, role, is_active, created_at, updated_at',
    )
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to load your profile.')
  }

  if (data.role !== 'admin' && data.role !== 'company') {
    throw new Error('Your account has an unsupported role.')
  }

  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(
    isSupabaseConfigured ? null : 'Supabase environment variables are missing.',
  )

  const hydrate = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setSession(null)
      setProfile(null)
      setError(null)
      return
    }

    setSession(nextSession)
    try {
      const nextProfile = await loadProfile(nextSession.user.id)
      setProfile(nextProfile)
      setError(null)
    } catch (caught) {
      setProfile(null)
      setError(caught instanceof Error ? caught.message : 'Unable to load your profile.')
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    const supabase = getSupabase()
    let cancelled = false

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return
        await hydrate(data.session)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'Unable to restore session.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrate(nextSession)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [hydrate])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured.' }
    }

    const supabase = getSupabase()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      return { error: signInError.message }
    }

    if (!data.session?.user) {
      return { error: 'Sign-in did not return a session.' }
    }

    try {
      const nextProfile = await loadProfile(data.session.user.id)
      if (!nextProfile.is_active) {
        await supabase.auth.signOut()
        return { error: 'This account has been blocked. Contact an administrator.' }
      }
      await hydrate(data.session)
      return { error: null }
    } catch (caught) {
      await supabase.auth.signOut()
      return { error: caught instanceof Error ? caught.message : 'Unable to load your profile.' }
    }
  }, [hydrate])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return
    await getSupabase().auth.signOut()
    setSession(null)
    setProfile(null)
    setError(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    await hydrate(session)
  }, [hydrate, session])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      error,
      configured: isSupabaseConfigured,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, error, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
